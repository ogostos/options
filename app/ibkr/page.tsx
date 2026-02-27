"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { LiveTab } from "@/components/LiveTab";
import { Card } from "@/components/ui/primitives";
import { DESIGN, formatMoney, formatSigned } from "@/lib/design";
import { buildIbkrLiveModel } from "@/lib/ibkr-transform";
import { buildLiveOptionSnapshot } from "@/lib/live-position-metrics";
import type { IbkrSyncSnapshot, Trade } from "@/lib/types";

type IbkrDashboardPayload = {
  snapshot?: IbkrSyncSnapshot;
  baselineOpenTrades?: Trade[];
  baselineOptionTradeCount?: number;
  error?: string;
};

export default function IbkrPage() {
  const [snapshot, setSnapshot] = useState<IbkrSyncSnapshot | null>(null);
  const [baselineOpenTrades, setBaselineOpenTrades] = useState<Trade[]>([]);
  const [baselineOptionTradeCount, setBaselineOptionTradeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assetFilter, setAssetFilter] = useState<"options" | "stocks" | "all">("options");

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
        setBaselineOpenTrades(data.baselineOpenTrades ?? []);
        setBaselineOptionTradeCount(data.baselineOptionTradeCount ?? 0);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load IBKR snapshot");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const model = useMemo(
    () =>
      snapshot
        ? buildIbkrLiveModel(snapshot, {
            baselineOpenTrades,
          })
        : null,
    [baselineOpenTrades, snapshot],
  );

  const liveTotals = useMemo(() => {
    if (!model) return null;
    const totalRisk = model.openPositions.reduce((sum, trade) => sum + trade.max_risk, 0);
    const totalMaxProfit = model.openPositions.reduce(
      (sum, trade) => sum + (trade.max_profit ?? 0),
      0,
    );
    const quoted = model.openPositions.map((trade) =>
      buildLiveOptionSnapshot(trade, model.optionQuotes),
    );
    const quotedCount = quoted.filter((item) => item.hasAllQuotes).length;
    const totalLivePnl = quoted.reduce(
      (sum, item) => sum + (item.livePnl ?? 0),
      0,
    );
    const activePct =
      baselineOptionTradeCount > 0
        ? (model.openPositions.length / baselineOptionTradeCount) * 100
        : null;
    const riskPctOfNetLiq =
      model.accountSummary.netLiq != null && model.accountSummary.netLiq > 0
        ? (totalRisk / model.accountSummary.netLiq) * 100
        : null;
    return {
      totalRisk,
      totalMaxProfit,
      totalLivePnl,
      quotedCount,
      quoteCoveragePct:
        model.openPositions.length > 0
          ? (quotedCount / model.openPositions.length) * 100
          : 0,
      activePct,
      riskPctOfNetLiq,
    };
  }, [baselineOptionTradeCount, model]);

  return (
    <main style={{ minHeight: "100vh", background: DESIGN.bg, color: DESIGN.text, fontFamily: DESIGN.sans, padding: "20px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "22px", color: DESIGN.bright }}>IBKR Live View</h1>
            <div style={{ marginTop: "4px", fontSize: "12px", color: DESIGN.muted }}>
              {snapshot
                ? `${snapshot.account_id} · fetched ${new Date(snapshot.fetched_at).toLocaleString()}`
                : "No snapshot loaded"}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
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

        {!loading && !error && model && (
          <>
            <Card style={{ marginBottom: "10px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: DESIGN.blue, marginBottom: "8px" }}>IBKR Account Metrics</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "8px" }}>
                <div>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Net Liq</div>
                  <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.bright }}>
                    {model.accountSummary.netLiq != null ? formatMoney(model.accountSummary.netLiq) : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Cash</div>
                  <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.bright }}>
                    {model.accountSummary.cash != null ? formatMoney(model.accountSummary.cash) : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Margin Debt</div>
                  <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: model.accountSummary.marginDebt && model.accountSummary.marginDebt > 0 ? DESIGN.red : DESIGN.green }}>
                    {model.accountSummary.marginDebt != null ? formatMoney(model.accountSummary.marginDebt) : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Buying Power</div>
                  <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.bright }}>
                    {model.accountSummary.buyingPower != null ? formatMoney(model.accountSummary.buyingPower) : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Maint. Margin</div>
                  <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.bright }}>
                    {model.accountSummary.maintenanceMargin != null ? formatMoney(model.accountSummary.maintenanceMargin) : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Excess Liquidity</div>
                  <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.bright }}>
                    {model.accountSummary.excessLiquidity != null ? formatMoney(model.accountSummary.excessLiquidity) : "—"}
                  </div>
                </div>
              </div>
            </Card>

            {liveTotals && (
              <Card style={{ marginBottom: "10px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: DESIGN.blue, marginBottom: "8px" }}>
                  IBKR Live Totals
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "8px" }}>
                  <div>
                    <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Open Option Trades</div>
                    <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.bright }}>
                      {model.openPositions.length}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Total Risk</div>
                    <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.red }}>
                      {formatMoney(liveTotals.totalRisk)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Total Max Profit</div>
                    <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.green }}>
                      {formatMoney(liveTotals.totalMaxProfit)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Quoted Live P/L</div>
                    <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: liveTotals.totalLivePnl >= 0 ? DESIGN.green : DESIGN.red }}>
                      {formatSigned(liveTotals.totalLivePnl)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Risk / Net Liq</div>
                    <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.bright }}>
                      {liveTotals.riskPctOfNetLiq != null ? `${liveTotals.riskPctOfNetLiq.toFixed(2)}%` : "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Quote Coverage</div>
                    <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.bright }}>
                      {liveTotals.quotedCount}/{model.openPositions.length} ({liveTotals.quoteCoveragePct.toFixed(0)}%)
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Active vs Option History</div>
                    <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.bright }}>
                      {liveTotals.activePct != null ? `${liveTotals.activePct.toFixed(1)}%` : "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Mapping Status</div>
                    <div style={{ fontSize: "12px", fontFamily: DESIGN.mono, color: model.meta.derivedTrades > 0 ? DESIGN.yellow : DESIGN.green }}>
                      matched {model.meta.matchedTrades} · derived {model.meta.derivedTrades}
                    </div>
                  </div>
                </div>
                {model.meta.unmatchedLegs > 0 && (
                  <div style={{ marginTop: "8px", fontSize: "11px", color: DESIGN.yellow }}>
                    {model.meta.unmatchedLegs} option legs were not mapped to existing dashboard trades and were derived from raw IBKR positions.
                  </div>
                )}
              </Card>
            )}

            <div style={{ display: "flex", gap: "4px", marginBottom: "10px", justifyContent: "flex-end", flexWrap: "wrap" }}>
              {([
                ["options", "Options Only"],
                ["stocks", "Stocks Only"],
                ["all", "All"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAssetFilter(key)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: "4px",
                    border: `1px solid ${assetFilter === key ? `${DESIGN.purple}66` : DESIGN.cardBorder}`,
                    background: assetFilter === key ? `${DESIGN.purple}15` : "transparent",
                    color: assetFilter === key ? DESIGN.purple : DESIGN.muted,
                    fontSize: "12px",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <LiveTab
              openPositions={model.openPositions}
              stocks={model.stocks}
              assetFilter={assetFilter}
              initialPrices={model.underlyingPrices}
              initialOptionQuotes={model.optionQuotes}
            />

            <Card style={{ marginTop: "10px" }}>
              <div style={{ fontSize: "13px", color: DESIGN.blue, fontWeight: 700, marginBottom: "8px" }}>
                Recent Executions ({model.recentTrades.length})
              </div>
              <div style={{ fontSize: "11px", color: DESIGN.muted, marginBottom: "8px" }}>
                This section uses the trades window fetched by the local panel (`Trades Days`). Open positions are always current.
              </div>
              <div style={{ display: "grid", gap: "6px" }}>
                {model.recentTrades.slice(0, 80).map((trade, index) => (
                  <div key={`${trade.trade_id ?? "trade"}-${index}`} style={{ border: `1px solid ${DESIGN.cardBorder}`, borderRadius: "6px", padding: "8px", background: "rgba(255,255,255,0.01)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                      <div style={{ fontSize: "12px", color: DESIGN.bright, fontWeight: 700 }}>
                        {trade.symbol || "—"} {trade.side ? `(${trade.side})` : ""}
                      </div>
                      <div style={{ fontSize: "11px", color: DESIGN.muted }}>{trade.trade_time ?? "—"}</div>
                    </div>
                    <div style={{ display: "flex", gap: "14px", marginTop: "5px", flexWrap: "wrap", fontSize: "11px", color: DESIGN.muted }}>
                      <span>Qty: <span style={{ color: DESIGN.text, fontFamily: DESIGN.mono }}>{trade.quantity}</span></span>
                      <span>Price: <span style={{ color: DESIGN.text, fontFamily: DESIGN.mono }}>{trade.price ?? "—"}</span></span>
                      <span>Commission: <span style={{ color: DESIGN.text, fontFamily: DESIGN.mono }}>{trade.commission != null ? formatSigned(-trade.commission) : "—"}</span></span>
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
