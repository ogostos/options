import { NextResponse } from "next/server";

import { getLatestIbkrSyncSnapshot } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getLatestIbkrSyncSnapshot();
    if (!snapshot) {
      return NextResponse.json({ error: "No IBKR sync snapshot found yet." }, { status: 404 });
    }

    return NextResponse.json({
      snapshot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load IBKR dashboard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
