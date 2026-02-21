import { NextRequest, NextResponse } from "next/server";

import { getSettings } from "@/lib/db";
import { fetchLivePrices } from "@/lib/price-fetcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseTickers(request: NextRequest, bodyTickers?: unknown): string[] {
  if (Array.isArray(bodyTickers)) {
    return bodyTickers
      .map((ticker) => String(ticker).trim().toUpperCase())
      .filter((ticker) => ticker.length > 0);
  }

  const raw = request.nextUrl.searchParams.get("tickers") ?? "";
  return raw
    .split(",")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  try {
    const tickers = parseTickers(request);
    if (tickers.length === 0) {
      return NextResponse.json({ prices: {} });
    }

    const settings = await getSettings();
    const prices = await fetchLivePrices(tickers, settings);
    return NextResponse.json({ prices });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch prices";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { tickers?: unknown };
    const tickers = parseTickers(request, body.tickers);
    if (tickers.length === 0) {
      return NextResponse.json({ prices: {} });
    }

    const settings = await getSettings();
    const prices = await fetchLivePrices(tickers, settings);
    return NextResponse.json({ prices });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch prices";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
