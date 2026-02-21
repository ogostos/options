import { NextResponse } from "next/server";

import { getLatestAccountSnapshot, listStockPositions, replaceAccountSnapshot } from "@/lib/db";
import type { AccountSnapshot } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [snapshot, stocks] = await Promise.all([getLatestAccountSnapshot(), listStockPositions()]);
    return NextResponse.json({ snapshot, stocks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as Partial<AccountSnapshot>;
    const snapshot = await replaceAccountSnapshot(payload);
    return NextResponse.json({ snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update account snapshot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
