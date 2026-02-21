import { NextRequest, NextResponse } from "next/server";

import { getSettings, updateSettings } from "@/lib/db";
import type { DashboardSettings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = (await request.json()) as Partial<DashboardSettings>;
    const settings = await updateSettings(payload);
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
