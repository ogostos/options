import { NextRequest, NextResponse } from "next/server";

import { clearIbkrSyncSnapshots, getLatestIbkrSyncSnapshot, insertIbkrSyncSnapshot } from "@/lib/db";
import type { IbkrSyncPayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readToken(request: NextRequest): string {
  const bearer = request.headers.get("authorization");
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }
  return request.headers.get("x-ibkr-sync-token")?.trim() ?? "";
}

function sanitizePayload(raw: Partial<IbkrSyncPayload>): IbkrSyncPayload {
  const accountId = String(raw.account_id ?? "").trim();
  const source = String(raw.source ?? "cpgw-local").trim() || "cpgw-local";
  const fetchedAt = String(raw.fetched_at ?? new Date().toISOString()).trim();
  const summary = raw.summary && typeof raw.summary === "object" ? raw.summary : {};
  const positions = Array.isArray(raw.positions) ? raw.positions : [];
  const trades = Array.isArray(raw.trades) ? raw.trades : [];
  const notes = Array.isArray(raw.notes) ? raw.notes.map((item) => String(item)) : [];

  return {
    account_id: accountId,
    source,
    fetched_at: fetchedAt,
    summary,
    positions,
    trades,
    notes,
  };
}

export async function GET() {
  try {
    const latest = await getLatestIbkrSyncSnapshot();
    if (!latest) {
      return NextResponse.json({ snapshot: null });
    }

    return NextResponse.json({
      snapshot: {
        id: latest.id,
        created_at: latest.created_at,
        account_id: latest.account_id,
        source: latest.source,
        fetched_at: latest.fetched_at,
        position_count: latest.positions.length,
        trade_count: latest.trades.length,
        notes: latest.notes,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load IBKR sync status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const expected = process.env.IBKR_SYNC_TOKEN?.trim() ?? "";
    if (!expected) {
      return NextResponse.json(
        { error: "IBKR_SYNC_TOKEN is not configured on the app." },
        { status: 500 },
      );
    }

    const provided = readToken(request);
    if (!provided || provided !== expected) {
      return NextResponse.json({ error: "Unauthorized sync token." }, { status: 401 });
    }

    const body = (await request.json()) as Partial<IbkrSyncPayload>;
    const payload = sanitizePayload(body);

    if (!payload.account_id) {
      return NextResponse.json({ error: "account_id is required." }, { status: 400 });
    }
    if (payload.positions.length > 5000 || payload.trades.length > 10000) {
      return NextResponse.json({ error: "Payload too large." }, { status: 400 });
    }

    let tradesToSave = payload.trades;
    const notesToSave = [...payload.notes];
    if (tradesToSave.length === 0) {
      const latest = await getLatestIbkrSyncSnapshot();
      if (latest && latest.account_id === payload.account_id && latest.trades.length > 0) {
        tradesToSave = latest.trades;
        notesToSave.push(`history_preserved=${latest.trades.length}`);
      }
    }

    const saved = await insertIbkrSyncSnapshot({
      ...payload,
      trades: tradesToSave,
      notes: notesToSave,
    });

    return NextResponse.json({
      ok: true,
      snapshot: {
        id: saved.id,
        created_at: saved.created_at,
        account_id: saved.account_id,
        source: saved.source,
        fetched_at: saved.fetched_at,
        position_count: saved.positions.length,
        trade_count: saved.trades.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "IBKR sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const expected = process.env.IBKR_SYNC_TOKEN?.trim() ?? "";
    if (!expected) {
      return NextResponse.json(
        { error: "IBKR_SYNC_TOKEN is not configured on the app." },
        { status: 500 },
      );
    }

    const provided = readToken(request);
    if (!provided || provided !== expected) {
      return NextResponse.json({ error: "Unauthorized sync token." }, { status: 401 });
    }

    const removed = await clearIbkrSyncSnapshots();
    return NextResponse.json({
      ok: true,
      removed,
      message: "Cleared ibkr_sync_snapshots only.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to clear IBKR snapshots";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
