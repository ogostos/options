import { NextResponse } from "next/server";

import { resetAllData } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await resetAllData();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
