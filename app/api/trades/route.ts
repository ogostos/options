import { NextRequest, NextResponse } from "next/server";

import { createTrade, listTrades } from "@/lib/db";
import type { TradeInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const ticker = request.nextUrl.searchParams.get("ticker") ?? undefined;
    const positionType =
      (request.nextUrl.searchParams.get("positionType") as "option" | "stock" | null) ?? undefined;

    const trades = await listTrades({ status, ticker, positionType });
    return NextResponse.json({ trades });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch trades";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as TradeInput;
    const trade = await createTrade({
      ...payload,
      ticker: payload.ticker.toUpperCase(),
    });

    return NextResponse.json({ trade }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create trade";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
