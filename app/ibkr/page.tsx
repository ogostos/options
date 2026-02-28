"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { LiveTab } from "@/components/LiveTab";
import { Card } from "@/components/ui/primitives";
import { DESIGN, formatMoney, formatSigned } from "@/lib/design";
import { buildIbkrLiveModel } from "@/lib/ibkr-transform";
import type { IbkrSyncSnapshot } from "@/lib/types";

type IbkrDashboardPayload = {
  snapshot?: IbkrSyncSnapshot;
  error?: string;
};

const REFRESH_STORAGE_KEY = "options-dashboard.ibkr-refresh.v1";
const REFRESH_OPTIONS = [
  { value: 3, label: "3s" },
  { value: 10, label: "10s" },
  { value: 30, label: "30s" },
  { value: 60, label: "1m" },
  { value: 300, label: "5m" },
  { value: 600, label: "10m" },
  { value: 3600, label: "1h" },
];

function formatPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const pct = value <= 1 ? value * 100 : value;
  return `${pct.toFixed(1)}%`;
}

export default function IbkrPage() {
  const [snapshot, setSnapshot] = useState<IbkrSyncSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assetFilter, setAssetFilter] = useState<"options" | "stocks" | "all">("options");
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [autoRefreshSeconds, setAutoRefreshSeconds] = useState(30);

  async function loadSnapshot(silent = false) {
    if (!silent) setLoading(true);
    try {
      const resp = await fetch("/api/ibkr-dashboard", { cache: "no-store" });
      const data = (await resp.json()) as IbkrDashboardPayload;
      if (!resp.ok || !data.snapshot) {
        throw new Error(data.error ?? "Failed to load IBKR snapshot");
      }
      setSnapshot(data.snapshot);
      setError(null);
      setLastLoadedAt(new Date().toISOString());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load IBKR snapshot");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadSnapshot();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REFRESH_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        enabled?: boolean;
        seconds?: number;
      };
      if (typeof parsed.enabled === "boolean") setAutoRefreshEnabled(parsed.enabled);
      if (typeof parsed.seconds === "number" && Number.isFinite(parsed.seconds)) {
        setAutoRefreshSeconds(parsed.seconds);
      }
    } catch {
      // ignore invalid persisted settings
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        REFRESH_STORAGE_KEY,
        JSON.stringify({ enabled: autoRefreshEnabled, seconds: autoRefreshSeconds }),
      );
    } catch {
      // ignore storage failures
    }
  }, [autoRefreshEnabled, autoRefreshSeconds]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const ms = Math.max(3, autoRefreshSeconds) * 1000;
    const timer = setInterval(() => {
      void loadSnapshot(true);
    }, ms);
    return () => clearInterval(timer);
  }, [autoRefreshEnabled, autoRefreshSeconds]);

  const model = useMemo(
    () => (snapshot ? buildIbkrLiveModel(snapshot) : null),
    [snapshot],
  );

  const liveTotals = useMemo(() => {
    if (!model) return null;
    const totalRisk = model.openPositions.reduce((sum, trade) => sum + trade.max_risk, 0);
    const totalMaxProfit = model.openPositions.reduce(
      (sum, trade) => sum + (trade.max_profit ?? 0),
      0,
    );
    const quotedCount = model.openPositions.filter((trade) => {
      const symbols = trade.ib_symbols ?? [];
      if (symbols.length === 0) return false;
      return symbols.every((symbol) => model.optionQuotes[symbol]?.mark != null);
    }).length;
    const totalLivePnl = model.openPositions.reduce(
      (sum, trade) => sum + (trade.unrealized_pl ?? 0),
      0,
    );
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
      riskPctOfNetLiq,
    };
  }, [model]);

  const executionTotals = useMemo(() => {
    if (!model) return null;
    let buyNotional = 0;
    let sellNotional = 0;
    let commissions = 0;
    for (const trade of model.recentTrades) {
      const px = trade.price ?? 0;
      const qty = trade.quantity ?? 0;
      const notional = px * qty * 100;
      const side = (trade.side ?? "").toUpperCase();
      if (side === "B" || side === "BUY") {
        buyNotional += notional;
      } else if (side === "S" || side === "SELL") {
        sellNotional += notional;
      }
      commissions += Math.abs(trade.commission ?? 0);
    }
    return {
      buyNotional,
      sellNotional,
      commissions,
      netFlow: sellNotional - buyNotional - commissions,
    };
  }, [model]);

  const sortedRecentTrades = useMemo(() => {
    if (!model) return [];
    const toTs = (value: string | null) => {
      if (!value) return 0;
      const match = value.match(/^(\d{4})(\d{2})(\d{2})-(\d{2}):(\d{2}):(\d{2})$/);
      if (!match) return 0;
      const [, yyyy, mm, dd, hh, min, ss] = match;
      const ts = Date.parse(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}Z`);
      return Number.isFinite(ts) ? ts : 0;
    };
    return [...model.recentTrades].sort((a, b) => toTs(b.trade_time) - toTs(a.trade_time));
  }, [model]);

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
            {model && (
              <div style={{ marginTop: "2px", fontSize: "11px", color: DESIGN.muted, fontFamily: DESIGN.mono }}>
                NetLiq {model.accountSummary.netLiq != null ? formatMoney(model.accountSummary.netLiq) : "—"} ·
                Cash {model.accountSummary.cash != null ? formatMoney(model.accountSummary.cash) : "—"} ·
                BuyingPower {model.accountSummary.buyingPower != null ? formatMoney(model.accountSummary.buyingPower) : "—"} ·
                AvFunds {model.accountSummary.availableFunds != null ? formatMoney(model.accountSummary.availableFunds) : "—"} ·
                Cushion {formatPct(model.accountSummary.cushion)}
              </div>
            )}
            {lastLoadedAt && (
              <div style={{ marginTop: "2px", fontSize: "11px", color: DESIGN.muted }}>
                UI refreshed {new Date(lastLoadedAt).toLocaleTimeString()}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/ibkr-sync" style={{ fontSize: "11px", color: DESIGN.blue }}>IBKR Sync</Link>
            <a href="/api/ibkr-debug" target="_blank" rel="noreferrer" style={{ fontSize: "11px", color: DESIGN.blue }}>
              IBKR Debug JSON
            </a>
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
                <div>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Available Funds</div>
                  <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.bright }}>
                    {model.accountSummary.availableFunds != null ? formatMoney(model.accountSummary.availableFunds) : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Init Margin Req</div>
                  <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.bright }}>
                    {model.accountSummary.initMarginReq != null ? formatMoney(model.accountSummary.initMarginReq) : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Gross Position</div>
                  <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.bright }}>
                    {model.accountSummary.grossPositionValue != null ? formatMoney(model.accountSummary.grossPositionValue) : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Leverage</div>
                  <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.bright }}>
                    {model.accountSummary.leverage != null ? `${model.accountSummary.leverage.toFixed(2)}x` : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Cushion</div>
                  <div style={{ fontSize: "15px", fontFamily: DESIGN.mono, color: DESIGN.bright }}>
                    {formatPct(model.accountSummary.cushion)}
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
                  <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>IBKR Live P/L</div>
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
                    <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Grouping Source</div>
                    <div style={{ fontSize: "12px", fontFamily: DESIGN.mono, color: model.meta.derivedTrades > 0 ? DESIGN.yellow : DESIGN.green }}>
                      IBKR-only · {model.meta.derivedTrades} grouped strategies
                    </div>
                  </div>
                </div>
                {model.meta.unmatchedLegs > 0 && (
                  <div style={{ marginTop: "8px", fontSize: "11px", color: DESIGN.yellow }}>
                    {model.meta.unmatchedLegs} option legs were grouped directly from raw IBKR positions.
                  </div>
                )}
              </Card>
            )}

            <Card style={{ marginBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontSize: "12px", color: DESIGN.text }}>
                  IBKR page auto-refresh from synced DB snapshot
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <button
                    onClick={() => void loadSnapshot()}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "4px",
                      border: `1px solid ${DESIGN.cardBorder}`,
                      background: "transparent",
                      color: DESIGN.muted,
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                  >
                    Refresh Now
                  </button>
                  <button
                    onClick={() => setAutoRefreshEnabled((value) => !value)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "4px",
                      border: `1px solid ${autoRefreshEnabled ? `${DESIGN.green}66` : DESIGN.cardBorder}`,
                      background: autoRefreshEnabled ? `${DESIGN.green}14` : "transparent",
                      color: autoRefreshEnabled ? DESIGN.green : DESIGN.muted,
                      fontSize: "11px",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {autoRefreshEnabled ? "Auto: ON" : "Auto: OFF"}
                  </button>
                  <select
                    value={autoRefreshSeconds}
                    onChange={(event) => setAutoRefreshSeconds(Number(event.target.value))}
                    style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      border: `1px solid ${DESIGN.cardBorder}`,
                      background: "rgba(255,255,255,0.02)",
                      color: DESIGN.text,
                      fontSize: "11px",
                    }}
                  >
                    {REFRESH_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </Card>

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
              allowExternalPriceFetch={false}
              livePnlMode="ibkr-native"
            />

            <Card style={{ marginTop: "10px" }}>
              <div style={{ fontSize: "13px", color: DESIGN.blue, fontWeight: 700, marginBottom: "8px" }}>
                Recent Executions ({model.recentTrades.length})
              </div>
              <div style={{ fontSize: "11px", color: DESIGN.muted, marginBottom: "8px" }}>
                This section uses the trades window fetched by the local panel (`Trades Days`). Open positions are always current.
              </div>
              {executionTotals && (
                <div style={{ display: "flex", gap: "16px", marginBottom: "10px", fontSize: "11px", color: DESIGN.muted, flexWrap: "wrap" }}>
                  <span>Buy Notional: <span style={{ color: DESIGN.red, fontFamily: DESIGN.mono }}>{formatMoney(executionTotals.buyNotional)}</span></span>
                  <span>Sell Notional: <span style={{ color: DESIGN.green, fontFamily: DESIGN.mono }}>{formatMoney(executionTotals.sellNotional)}</span></span>
                  <span>Commissions: <span style={{ color: DESIGN.text, fontFamily: DESIGN.mono }}>{formatMoney(executionTotals.commissions)}</span></span>
                  <span>Net Flow: <span style={{ color: executionTotals.netFlow >= 0 ? DESIGN.green : DESIGN.red, fontFamily: DESIGN.mono }}>{formatSigned(executionTotals.netFlow)}</span></span>
                </div>
              )}
              <div style={{ overflowX: "auto", border: `1px solid ${DESIGN.cardBorder}`, borderRadius: "6px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "980px", fontSize: "11px" }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.02)", color: DESIGN.muted, textAlign: "left" }}>
                      <th style={{ padding: "8px" }}>Time</th>
                      <th style={{ padding: "8px" }}>Symbol</th>
                      <th style={{ padding: "8px" }}>Side</th>
                      <th style={{ padding: "8px" }}>Qty</th>
                      <th style={{ padding: "8px" }}>Price</th>
                      <th style={{ padding: "8px" }}>Notional</th>
                      <th style={{ padding: "8px" }}>Commission</th>
                      <th style={{ padding: "8px" }}>Order Ref</th>
                      <th style={{ padding: "8px" }}>Exec ID</th>
                    </tr>
                  </thead>
                  <tbody>
                {sortedRecentTrades.map((trade, index) => {
                      const notional = (trade.price ?? 0) * (trade.quantity ?? 0) * 100;
                      const orderRef = typeof trade.raw?.order_ref === "string" ? trade.raw.order_ref : "—";
                      return (
                        <tr key={`${trade.trade_id ?? "trade"}-${index}`} style={{ borderTop: `1px solid ${DESIGN.cardBorder}` }}>
                          <td style={{ padding: "8px", color: DESIGN.muted, fontFamily: DESIGN.mono }}>{trade.trade_time ?? "—"}</td>
                          <td style={{ padding: "8px", color: DESIGN.bright, fontWeight: 600 }}>{trade.symbol || "—"}</td>
                          <td style={{ padding: "8px", color: DESIGN.text, fontFamily: DESIGN.mono }}>{trade.side ?? "—"}</td>
                          <td style={{ padding: "8px", color: DESIGN.text, fontFamily: DESIGN.mono }}>{trade.quantity}</td>
                          <td style={{ padding: "8px", color: DESIGN.text, fontFamily: DESIGN.mono }}>{trade.price != null ? trade.price.toFixed(4) : "—"}</td>
                          <td style={{ padding: "8px", color: DESIGN.text, fontFamily: DESIGN.mono }}>{formatMoney(notional)}</td>
                          <td style={{ padding: "8px", color: DESIGN.text, fontFamily: DESIGN.mono }}>{trade.commission != null ? formatMoney(trade.commission) : "—"}</td>
                          <td style={{ padding: "8px", color: DESIGN.muted, fontFamily: DESIGN.mono }}>{orderRef}</td>
                          <td style={{ padding: "8px", color: DESIGN.muted, fontFamily: DESIGN.mono }}>{trade.trade_id ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
