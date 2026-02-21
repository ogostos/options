import { NextRequest, NextResponse } from "next/server";

import { getTradeById, updateTrade } from "@/lib/db";
import type { TradeInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(id: string): number {
  const parsed = Number(id);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Invalid trade id");
  }
  return parsed;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const trade = await getTradeById(parseId(id));
    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }
    return NextResponse.json({ trade });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch trade";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = (await request.json()) as Partial<TradeInput>;
    const trade = await updateTrade(parseId(id), payload);
    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }
    return NextResponse.json({ trade });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update trade";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
