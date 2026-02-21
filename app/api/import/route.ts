import { NextResponse } from "next/server";

import {
  listTrades,
  replaceAccountSnapshot,
  upsertTradeByImportMatch,
} from "@/lib/db";
import { parseIBStatementPdf } from "@/lib/ib-parser";
import type { ImportPreview, Trade } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function overlapSymbols(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  const set = new Set(a);
  return b.some((item) => set.has(item));
}

function findMatch(trade: ImportPreview["trades"][number]["trade"], existingTrades: Trade[]) {
  const sameDate = existingTrades.filter((candidate) => candidate.entry_date === trade.entry_date);
  const bySymbol = sameDate.filter((candidate) => overlapSymbols(candidate.ib_symbols, trade.ib_symbols ?? []));

  if (bySymbol.length === 1) {
    return {
      matchStatus: "match" as const,
      matchedTradeId: bySymbol[0].id,
      reason: `Matched existing trade #${bySymbol[0].id} by IB symbol + date`,
    };
  }

  if (bySymbol.length > 1) {
    return {
      matchStatus: "conflict" as const,
      matchedTradeId: null,
      reason: `Multiple existing trades matched (${bySymbol.map((t) => t.id).join(", ")})`,
    };
  }

  const sameTicker = sameDate.filter((candidate) => candidate.ticker === trade.ticker);
  if (sameTicker.length === 1) {
    return {
      matchStatus: "match" as const,
      matchedTradeId: sameTicker[0].id,
      reason: `Matched by ticker + entry date with trade #${sameTicker[0].id}`,
    };
  }

  if (sameTicker.length > 1) {
    return {
      matchStatus: "conflict" as const,
      matchedTradeId: null,
      reason: `Ticker/date matched multiple trades (${sameTicker.map((t) => t.id).join(", ")})`,
    };
  }

  return {
    matchStatus: "new" as const,
    matchedTradeId: null,
    reason: "New trade not found in database",
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const mode = String(formData.get("mode") ?? "preview");
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload a PDF file under the `file` field." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const parsed = await parseIBStatementPdf(Buffer.from(arrayBuffer));

    const existingTrades = await listTrades();

    const preview: ImportPreview = {
      account: parsed.account,
      trades: parsed.detectedTrades.map((trade) => {
        const match = findMatch(trade, existingTrades);
        return {
          trade,
          ...match,
        };
      }),
      errors: parsed.errors,
    };

    if (mode !== "commit") {
      return NextResponse.json({ preview, parsedMeta: {
        executionCount: parsed.executions.length,
        openPositionCount: parsed.openPositions.length,
        summaryRows: parsed.summaryBySymbol.length,
      } });
    }

    const applied: Array<{ action: "created" | "updated"; tradeId: number; ticker: string }> = [];

    for (const item of preview.trades) {
      if (item.matchStatus === "conflict") continue;
      const merged = await upsertTradeByImportMatch(item.trade);
      applied.push({
        action: merged.action,
        tradeId: merged.trade.id,
        ticker: merged.trade.ticker,
      });
    }

    if (Object.keys(preview.account).length > 0) {
      await replaceAccountSnapshot(preview.account);
    }

    return NextResponse.json({
      ok: true,
      preview,
      applied,
      skippedConflicts: preview.trades.filter((item) => item.matchStatus === "conflict").length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
