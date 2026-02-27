import { NextRequest, NextResponse } from "next/server";

import { probePriceSources } from "@/lib/price-fetcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeTicker(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}

function normalizeOptionSymbol(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim().toUpperCase();
  return value.length > 0 ? value : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const ticker = normalizeTicker(request.nextUrl.searchParams.get("ticker") ?? "ADBE");
    const optionSymbol = normalizeOptionSymbol(request.nextUrl.searchParams.get("optionSymbol"));
    if (!ticker) {
      return NextResponse.json(
        { error: "ticker is required (example: ADBE)" },
        { status: 400 },
      );
    }

    const data = await probePriceSources(ticker, optionSymbol);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to probe price sources";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      ticker?: unknown;
      optionSymbol?: unknown;
    };
    const ticker = normalizeTicker(body.ticker ?? "ADBE");
    const optionSymbol = normalizeOptionSymbol(body.optionSymbol);

    if (!ticker) {
      return NextResponse.json(
        { error: "ticker is required (example: ADBE)" },
        { status: 400 },
      );
    }

    const data = await probePriceSources(ticker, optionSymbol);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to probe price sources";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
