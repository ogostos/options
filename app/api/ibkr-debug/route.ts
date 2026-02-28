import { NextResponse } from "next/server";

import { getLatestIbkrSyncSnapshot } from "@/lib/db";
import { buildIbkrLiveModel } from "@/lib/ibkr-transform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getLatestIbkrSyncSnapshot();
    if (!snapshot) {
      return NextResponse.json({ error: "No IBKR sync snapshot found yet." }, { status: 404 });
    }

    const model = buildIbkrLiveModel(snapshot);

    return NextResponse.json({
      fetched_at: snapshot.fetched_at,
      snapshot_meta: {
        account_id: snapshot.account_id,
        source: snapshot.source,
        positions: snapshot.positions.length,
        trades: snapshot.trades.length,
        notes: snapshot.notes,
      },
      model_meta: model.meta,
      account_summary: model.accountSummary,
      open_positions: model.openPositions.map((trade) => ({
        id: trade.id,
        ticker: trade.ticker,
        strategy: trade.strategy,
        legs: trade.legs,
        expiry_date: trade.expiry_date,
        contracts: trade.contracts,
        cost_basis: trade.cost_basis,
        max_risk: trade.max_risk,
        max_profit: trade.max_profit,
        breakeven: trade.breakeven,
        strike_long: trade.strike_long,
        strike_short: trade.strike_short,
        close_price_long: trade.close_price_long,
        close_price_short: trade.close_price_short,
        unrealized_pl: trade.unrealized_pl,
        realized_pl: trade.realized_pl,
        ib_symbols: trade.ib_symbols,
      })),
      option_quotes: model.optionQuotes,
      underlying_prices: model.underlyingPrices,
      recent_trades: model.recentTrades,
      raw_snapshot: snapshot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build IBKR debug payload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
