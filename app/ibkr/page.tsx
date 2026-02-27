"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Card } from "@/components/ui/primitives";
import { DESIGN, formatMoney } from "@/lib/design";
import type { IbkrSyncSnapshot } from "@/lib/types";

type IbkrDashboardPayload = {
  snapshot?: IbkrSyncSnapshot;
  error?: string;
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function summaryNumber(summary: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (key in summary) {
      const value = asNumber(summary[key]);
      if (value != null) return value;
    }
  }
  return null;
}

export default function IbkrPage() {
  const [snapshot, setSnapshot] = useState<IbkrSyncSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch("/api/ibkr-dashboard", { cache: "no-store" });
        const data = (await resp.json()) as IbkrDashboardPayload;
        if (!resp.ok || !data.snapshot) {
          throw new Error(data.error ?? "Failed to load IBKR snapshot");
        }
        setSnapshot(data.snapshot);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load IBKR snapshot");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const metrics = useMemo(() => {
    if (!snapshot) return null;
    const summary = snapshot.summary ?? {};
    return {
      netLiq: summaryNumber(summary, ["netLiquidation", "NetLiquidation", "net_liquidation"]),
      cash: summaryNumber(summary, ["totalCashValue", "TotalCashValue", "cashBalance", "cash"]),
      buyingPower: summaryNumber(summary, ["buyingPower", "BuyingPower"]),
      unrealized: summaryNumber(summary, ["unrealizedPnL", "UnrealizedPnL", "unrealized_pnl"]),
    };
  }, [snapshot]);

  return (
    <main style={{ minHeight: "100vh", background: DESIGN.bg, color: DESIGN.text, fontFamily: DESIGN.sans, padding: "20px" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
          <h1 style={{ margin: 0, fontSize: "20px", color: DESIGN.bright }}>IBKR Live View</h1>
          <div style={{ display: "flex", gap: "8px" }}>
            <Link href="/ibkr-sync" style={{ fontSize: "11px", color: DESIGN.blue }}>IBKR Sync</Link>
            <Link href="/" style={{ fontSize: "11px", color: DESIGN.blue }}>Back to Dashboard</Link>
          </div>
        </div>

        {loading && (
          <Card>
            <div style={{ fontSize: "12px", color: DESIGN.muted }}>Loading IBKR snapshot…</div>
          </Card>
        )}

        {!loading && error && (
          <Card>
            <div style={{ fontSize: "12px", color: DESIGN.red }}>{error}</div>
          </Card>
        )}

        {!loading && snapshot && (
          <>
            <Card style={{ marginBottom: "10px" }}>
              <div style={{ fontSize: "12px", color: DESIGN.muted }}>
                Account {snapshot.account_id} · Source {snapshot.source} · Fetched {new Date(snapshot.fetched_at).toLocaleString()}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px", marginTop: "8px" }}>
                <div>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Net Liq</div>
                  <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.bright }}>{metrics?.netLiq != null ? formatMoney(metrics.netLiq) : "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Cash</div>
                  <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.bright }}>{metrics?.cash != null ? formatMoney(metrics.cash) : "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Buying Power</div>
                  <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.bright }}>{metrics?.buyingPower != null ? formatMoney(metrics.buyingPower) : "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Unrealized</div>
                  <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: (metrics?.unrealized ?? 0) >= 0 ? DESIGN.green : DESIGN.red }}>
                    {metrics?.unrealized != null ? formatMoney(metrics.unrealized) : "—"}
                  </div>
                </div>
              </div>
            </Card>

            <Card style={{ marginBottom: "10px" }}>
              <div style={{ fontSize: "13px", color: DESIGN.blue, fontWeight: 700, marginBottom: "6px" }}>
                Live Positions ({snapshot.positions.length})
              </div>
              <div style={{ display: "grid", gap: "6px" }}>
                {snapshot.positions.map((position, index) => (
                  <div key={`${position.symbol}-${position.conid ?? index}`} style={{ border: `1px solid ${DESIGN.cardBorder}`, borderRadius: "6px", padding: "8px", background: "rgba(255,255,255,0.01)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                      <div style={{ fontSize: "13px", color: DESIGN.bright, fontWeight: 700 }}>{position.symbol || position.contract || "—"}</div>
                      <div style={{ fontSize: "12px", fontFamily: DESIGN.mono }}>
                        Qty <span style={{ color: DESIGN.bright }}>{position.quantity}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "14px", marginTop: "5px", flexWrap: "wrap", fontSize: "11px", color: DESIGN.muted }}>
                      <span>Mkt Px: <span style={{ color: DESIGN.text, fontFamily: DESIGN.mono }}>{position.market_price ?? "—"}</span></span>
                      <span>Value: <span style={{ color: DESIGN.text, fontFamily: DESIGN.mono }}>{position.market_value != null ? formatMoney(position.market_value) : "—"}</span></span>
                      <span>U P/L: <span style={{ color: (position.unrealized_pl ?? 0) >= 0 ? DESIGN.green : DESIGN.red, fontFamily: DESIGN.mono }}>{position.unrealized_pl != null ? formatMoney(position.unrealized_pl) : "—"}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: "13px", color: DESIGN.blue, fontWeight: 700, marginBottom: "6px" }}>
                Recent Trades ({snapshot.trades.length})
              </div>
              <div style={{ display: "grid", gap: "6px" }}>
                {snapshot.trades.slice(0, 120).map((trade, index) => (
                  <div key={`${trade.trade_id ?? "trade"}-${index}`} style={{ border: `1px solid ${DESIGN.cardBorder}`, borderRadius: "6px", padding: "8px", background: "rgba(255,255,255,0.01)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                      <div style={{ fontSize: "12px", color: DESIGN.bright, fontWeight: 700 }}>
                        {trade.symbol} {trade.side ? `(${trade.side})` : ""}
                      </div>
                      <div style={{ fontSize: "11px", color: DESIGN.muted }}>{trade.trade_time ?? "—"}</div>
                    </div>
                    <div style={{ display: "flex", gap: "14px", marginTop: "5px", flexWrap: "wrap", fontSize: "11px", color: DESIGN.muted }}>
                      <span>Qty: <span style={{ color: DESIGN.text, fontFamily: DESIGN.mono }}>{trade.quantity}</span></span>
                      <span>Price: <span style={{ color: DESIGN.text, fontFamily: DESIGN.mono }}>{trade.price ?? "—"}</span></span>
                      <span>Commission: <span style={{ color: DESIGN.text, fontFamily: DESIGN.mono }}>{trade.commission ?? "—"}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
