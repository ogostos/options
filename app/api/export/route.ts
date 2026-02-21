import { NextResponse } from "next/server";

import { exportAllData } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await exportAllData();
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="trading-dashboard-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
