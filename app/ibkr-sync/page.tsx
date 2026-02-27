"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Card } from "@/components/ui/primitives";
import { DESIGN } from "@/lib/design";

type SyncStatusPayload = {
  snapshot?: {
    id: number;
    created_at: string;
    account_id: string;
    source: string;
    fetched_at: string;
    position_count: number;
    trade_count: number;
    notes: string[];
  } | null;
  error?: string;
};

export default function IbkrSyncPage() {
  const [status, setStatus] = useState<SyncStatusPayload["snapshot"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  async function loadStatus(silent = false) {
    if (!silent) setLoading(true);
    try {
      const resp = await fetch("/api/ibkr-sync", { cache: "no-store" });
      const data = (await resp.json()) as SyncStatusPayload;
      if (!resp.ok) {
        throw new Error(data.error ?? "Failed to load IBKR sync status");
      }
      setStatus(data.snapshot ?? null);
      setError(null);
      setLastCheckedAt(new Date().toISOString());
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Failed to load IBKR sync status");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
    const timer = setInterval(() => {
      void loadStatus(true);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: DESIGN.bg, color: DESIGN.text, fontFamily: DESIGN.sans, padding: "20px" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
          <h1 style={{ margin: 0, fontSize: "20px", color: DESIGN.bright }}>IBKR Sync Status</h1>
          <div style={{ display: "flex", gap: "8px" }}>
            <Link href="/ibkr" style={{ fontSize: "11px", color: DESIGN.blue }}>IBKR Live View</Link>
            <Link href="/" style={{ fontSize: "11px", color: DESIGN.blue }}>Back to Dashboard</Link>
          </div>
        </div>

        <Card style={{ marginBottom: "10px" }}>
          <div style={{ fontSize: "12px", color: DESIGN.muted, marginBottom: "8px", lineHeight: 1.5 }}>
            Run the local IBKR control panel on your machine, authenticate CPGW, fetch preview, then sync to DB.
          </div>
          <div style={{ fontSize: "12px", color: DESIGN.text, fontFamily: DESIGN.mono, marginBottom: "8px" }}>
            npm run ibkr:panel
          </div>
          <div style={{ fontSize: "11px", color: DESIGN.muted }}>
            Default local panel URL: <span style={{ color: DESIGN.blue, fontFamily: DESIGN.mono }}>http://localhost:8913</span>
          </div>
          <div style={{ marginTop: "6px", fontSize: "11px", color: DESIGN.yellow }}>
            This page auto-refreshes status every 10 seconds. Fetch and sync actions happen in the local panel.
          </div>
        </Card>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
            <div style={{ fontSize: "13px", color: DESIGN.blue, fontWeight: 700 }}>Latest Sync Snapshot</div>
            <button
              onClick={() => void loadStatus()}
              style={{
                padding: "5px 10px",
                borderRadius: "4px",
                border: `1px solid ${DESIGN.cardBorder}`,
                background: "transparent",
                color: DESIGN.muted,
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              Reload Now
            </button>
          </div>

          {lastCheckedAt && (
            <div style={{ fontSize: "10px", color: DESIGN.muted, marginBottom: "6px" }}>
              Last checked: {new Date(lastCheckedAt).toLocaleTimeString()}
            </div>
          )}

          {loading && <div style={{ fontSize: "12px", color: DESIGN.muted }}>Loading…</div>}
          {!loading && error && <div style={{ fontSize: "12px", color: DESIGN.red }}>{error}</div>}

          {!loading && !error && !status && (
            <div style={{ fontSize: "12px", color: DESIGN.muted }}>
              No IBKR snapshot yet. Run local panel, fetch preview, then click sync.
            </div>
          )}

          {!loading && status && (
            <div style={{ fontSize: "12px", color: DESIGN.text, lineHeight: 1.6 }}>
              <div>Account: <span style={{ color: DESIGN.bright, fontFamily: DESIGN.mono }}>{status.account_id}</span></div>
              <div>Source: <span style={{ color: DESIGN.bright, fontFamily: DESIGN.mono }}>{status.source}</span></div>
              <div>Synced at: <span style={{ color: DESIGN.bright, fontFamily: DESIGN.mono }}>{new Date(status.created_at).toLocaleString()}</span></div>
              <div>Fetched at: <span style={{ color: DESIGN.bright, fontFamily: DESIGN.mono }}>{new Date(status.fetched_at).toLocaleString()}</span></div>
              <div>Positions: <span style={{ color: DESIGN.bright, fontFamily: DESIGN.mono }}>{status.position_count}</span></div>
              <div>Trades: <span style={{ color: DESIGN.bright, fontFamily: DESIGN.mono }}>{status.trade_count}</span></div>
              {status.notes.length > 0 && (
                <div style={{ marginTop: "8px", color: DESIGN.yellow }}>
                  Notes: {status.notes.join(" | ")}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
