import { NextResponse } from "next/server";

import { getLatestIbkrSyncSnapshot, listTrades } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [snapshot, optionTrades] = await Promise.all([
      getLatestIbkrSyncSnapshot(),
      listTrades({ positionType: "option" }),
    ]);
    if (!snapshot) {
      return NextResponse.json({ error: "No IBKR sync snapshot found yet." }, { status: 404 });
    }

    const baselineOpenTrades = optionTrades.filter((trade) => trade.status === "OPEN");

    return NextResponse.json({
      snapshot,
      baselineOpenTrades,
      baselineOptionTradeCount: optionTrades.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load IBKR dashboard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
