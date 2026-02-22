import { NextResponse } from "next/server";

import {
  applyImportPayloadToTradeId,
  createTrade,
  listTrades,
  replaceAccountSnapshot,
  upsertTradeByImportMatch,
} from "@/lib/db";
import { parseIBStatementPdf } from "@/lib/ib-parser";
import type { ImportPreview, ImportPreviewTrade, Trade } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConflictMode = "require_resolution" | "ignore" | "resolve";

type ConflictResolution =
  | { action: "ignore" }
  | { action: "create_new" }
  | { action: "update_existing"; tradeId: number };

function overlapSymbols(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  const set = new Set(a);
  return b.some((item) => set.has(item));
}

function findMatch(
  trade: ImportPreview["trades"][number]["trade"],
  existingTrades: Trade[],
): Omit<ImportPreviewTrade, "trade" | "preview_id"> {
  const sameDate = existingTrades.filter((candidate) => candidate.entry_date === trade.entry_date);
  const bySymbol = sameDate.filter((candidate) => overlapSymbols(candidate.ib_symbols, trade.ib_symbols ?? []));

  if (bySymbol.length === 1) {
    return {
      matchStatus: "match",
      matchedTradeId: bySymbol[0].id,
      conflict_candidates: [bySymbol[0].id],
      reason: `Matched existing trade #${bySymbol[0].id} by IB symbol + date`,
    };
  }

  if (bySymbol.length > 1) {
    return {
      matchStatus: "conflict",
      matchedTradeId: null,
      conflict_candidates: bySymbol.map((tradeItem) => tradeItem.id),
      reason: `Multiple existing trades matched (${bySymbol.map((t) => t.id).join(", ")})`,
    };
  }

  const sameTicker = sameDate.filter((candidate) => candidate.ticker === trade.ticker);
  if (sameTicker.length === 1) {
    return {
      matchStatus: "match",
      matchedTradeId: sameTicker[0].id,
      conflict_candidates: [sameTicker[0].id],
      reason: `Matched by ticker + entry date with trade #${sameTicker[0].id}`,
    };
  }

  if (sameTicker.length > 1) {
    return {
      matchStatus: "conflict",
      matchedTradeId: null,
      conflict_candidates: sameTicker.map((tradeItem) => tradeItem.id),
      reason: `Ticker/date matched multiple trades (${sameTicker.map((t) => t.id).join(", ")})`,
    };
  }

  return {
    matchStatus: "new",
    matchedTradeId: null,
    conflict_candidates: [],
    reason: "New trade not found in database",
  };
}

function parseConflictResolutions(raw: FormDataEntryValue | null): Record<string, ConflictResolution> {
  if (!raw || typeof raw !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, { action?: string; tradeId?: number }>;
    const result: Record<string, ConflictResolution> = {};

    for (const [previewId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      if (value.action === "ignore") {
        result[previewId] = { action: "ignore" };
      } else if (value.action === "create_new") {
        result[previewId] = { action: "create_new" };
      } else if (value.action === "update_existing" && Number.isFinite(value.tradeId)) {
        result[previewId] = { action: "update_existing", tradeId: Number(value.tradeId) };
      }
    }

    return result;
  } catch {
    return {};
  }
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
      trades: parsed.detectedTrades.map((trade, index) => {
        const match = findMatch(trade, existingTrades);
        return {
          preview_id: `preview-${index}`,
          trade,
          ...match,
        };
      }),
      errors: parsed.errors,
    };

    if (mode !== "commit") {
      return NextResponse.json({
        preview,
        parsedMeta: {
          executionCount: parsed.executions.length,
          openPositionCount: parsed.openPositions.length,
          summaryRows: parsed.summaryBySymbol.length,
        },
      });
    }

    const conflictMode = (String(formData.get("conflictMode") ?? "require_resolution") as ConflictMode);
    const conflictResolutions = parseConflictResolutions(formData.get("conflictResolutions"));

    const unresolvedConflicts: Array<{ preview_id: string; ticker: string; reason: string }> = [];

    const plannedOperations: Array<
      | { kind: "upsert"; item: ImportPreviewTrade }
      | { kind: "ignore"; item: ImportPreviewTrade }
      | { kind: "create_new"; item: ImportPreviewTrade }
      | { kind: "update_existing"; item: ImportPreviewTrade; tradeId: number }
    > = [];

    for (const item of preview.trades) {
      if (item.matchStatus !== "conflict") {
        plannedOperations.push({ kind: "upsert", item });
        continue;
      }

      if (conflictMode === "ignore") {
        plannedOperations.push({ kind: "ignore", item });
        continue;
      }

      if (conflictMode === "resolve") {
        const resolution = conflictResolutions[item.preview_id];
        if (!resolution) {
          unresolvedConflicts.push({
            preview_id: item.preview_id,
            ticker: item.trade.ticker,
            reason: "No resolution selected",
          });
          continue;
        }

        if (resolution.action === "ignore") {
          plannedOperations.push({ kind: "ignore", item });
          continue;
        }

        if (resolution.action === "create_new") {
          plannedOperations.push({ kind: "create_new", item });
          continue;
        }

        if (resolution.action === "update_existing") {
          const allowed = item.conflict_candidates.includes(resolution.tradeId);
          if (!allowed) {
            unresolvedConflicts.push({
              preview_id: item.preview_id,
              ticker: item.trade.ticker,
              reason: `Trade #${resolution.tradeId} is not a valid conflict candidate`,
            });
            continue;
          }

          plannedOperations.push({ kind: "update_existing", item, tradeId: resolution.tradeId });
          continue;
        }
      }

      unresolvedConflicts.push({
        preview_id: item.preview_id,
        ticker: item.trade.ticker,
        reason: "Conflict requires explicit resolution",
      });
    }

    if (unresolvedConflicts.length > 0) {
      return NextResponse.json(
        {
          error: "Import has unresolved conflicts. Choose Ignore or Solve before finalizing.",
          preview,
          unresolvedConflicts,
        },
        { status: 409 },
      );
    }

    const applied: Array<{ action: "created" | "updated" | "unchanged" | "ignored"; tradeId: number | null; ticker: string }> = [];

    for (const operation of plannedOperations) {
      if (operation.kind === "ignore") {
        applied.push({ action: "ignored", tradeId: null, ticker: operation.item.trade.ticker });
        continue;
      }

      if (operation.kind === "create_new") {
        const created = await createTrade(operation.item.trade);
        applied.push({ action: "created", tradeId: created.id, ticker: created.ticker });
        continue;
      }

      if (operation.kind === "update_existing") {
        const updated = await applyImportPayloadToTradeId(operation.tradeId, operation.item.trade);
        applied.push({ action: "updated", tradeId: updated.id, ticker: updated.ticker });
        continue;
      }

      const merged = await upsertTradeByImportMatch(operation.item.trade);
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
      unchangedCount: applied.filter((item) => item.action === "unchanged").length,
      ignoredCount: applied.filter((item) => item.action === "ignored").length,
      skippedConflicts: 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
