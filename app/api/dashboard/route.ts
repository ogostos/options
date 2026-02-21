import { NextResponse } from "next/server";

import {
  getLatestAccountSnapshot,
  getSettings,
  listJournalEntries,
  listRules,
  listStockPositions,
  listTrades,
} from "@/lib/db";
import { scoreOpenPositions } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [account, rules, journals, settings, stocks, trades] = await Promise.all([
      getLatestAccountSnapshot(),
      listRules(),
      listJournalEntries(),
      getSettings(),
      listStockPositions(),
      listTrades(),
    ]);

    if (!account) {
      return NextResponse.json({ error: "No account snapshot found" }, { status: 404 });
    }

    const openTrades = trades.filter((trade) => trade.status === "OPEN" && trade.position_type === "option");
    const scoring = scoreOpenPositions({
      openTrades,
      allTrades: trades,
      account,
      journals,
      rules,
    });

    return NextResponse.json({
      account,
      settings,
      stocks,
      trades,
      rules,
      journals,
      scoring,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load dashboard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
