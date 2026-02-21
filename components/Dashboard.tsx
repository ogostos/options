"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { AccountTab } from "@/components/AccountTab";
import { AnalysisTab } from "@/components/AnalysisTab";
import { HistoryTab } from "@/components/HistoryTab";
import { LiveTab } from "@/components/LiveTab";
import { DESIGN, formatMoney } from "@/lib/design";
import type {
  AccountSnapshot,
  DashboardSettings,
  JournalEntry,
  PortfolioRuleChecks,
  Rule,
  RuleCheckResult,
  StockPosition,
  Trade,
} from "@/lib/types";

type DashboardPayload = {
  account: AccountSnapshot;
  settings: DashboardSettings;
  stocks: StockPosition[];
  trades: Trade[];
  rules: Rule[];
  journals: JournalEntry[];
  scoring: {
    perPosition: RuleCheckResult[];
    portfolio: PortfolioRuleChecks;
    overallScore: number;
  };
};

export function Dashboard() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [tab, setTab] = useState<"account" | "live" | "history" | "analysis">("live");
  const [assetFilter, setAssetFilter] = useState<"options" | "stocks" | "all">("options");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/dashboard", { cache: "no-store" });
      const data = (await resp.json()) as DashboardPayload & { error?: string };
      if (!resp.ok) {
        throw new Error(data.error ?? "Failed to load dashboard");
      }
      setPayload(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  const openTrades = useMemo(
    () => payload?.trades.filter((trade) => trade.position_type === "option" && trade.status === "OPEN") ?? [],
    [payload],
  );

  const closedTrades = useMemo(
    () => payload?.trades.filter((trade) => trade.position_type === "option" && trade.status !== "OPEN") ?? [],
    [payload],
  );

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: DESIGN.bg,
          color: DESIGN.text,
          fontFamily: DESIGN.sans,
          display: "grid",
          placeItems: "center",
        }}
      >
        <div style={{ fontSize: "12px", color: DESIGN.muted }}>Loading dashboard…</div>
      </main>
    );
  }

  if (error || !payload) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: DESIGN.bg,
          color: DESIGN.text,
          fontFamily: DESIGN.sans,
          display: "grid",
          placeItems: "center",
          padding: "20px",
        }}
      >
        <div
          style={{
            background: DESIGN.card,
            border: `1px solid ${DESIGN.cardBorder}`,
            borderRadius: "8px",
            padding: "16px",
            maxWidth: "700px",
            width: "100%",
          }}
        >
          <div style={{ fontSize: "14px", fontWeight: 700, color: DESIGN.red, marginBottom: "8px" }}>Dashboard error</div>
          <div style={{ fontSize: "12px", color: DESIGN.muted, lineHeight: 1.5 }}>{error ?? "Unknown error"}</div>
          <button
            onClick={() => void loadDashboard()}
            style={{
              marginTop: "12px",
              padding: "6px 12px",
              borderRadius: "4px",
              border: `1px solid ${DESIGN.blue}44`,
              background: `${DESIGN.blue}18`,
              color: DESIGN.blue,
              fontSize: "11px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: DESIGN.bg,
        color: DESIGN.text,
        fontFamily: DESIGN.sans,
        padding: "20px",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1
            style={{
              fontSize: "20px",
              fontWeight: 700,
              color: DESIGN.bright,
              margin: "0 0 3px 0",
              letterSpacing: "-0.5px",
            }}
          >
            Trading Dashboard
          </h1>
          <p style={{ fontSize: "11px", color: DESIGN.muted, margin: 0 }}>
            {payload.settings.account_id} · {payload.account.period_start} – {payload.account.period_end} · NAV:{" "}
            <span style={{ color: payload.account.twr >= 0 ? DESIGN.green : DESIGN.red, fontFamily: DESIGN.mono }}>
              {formatMoney(payload.account.end_nav)} ({payload.account.twr.toFixed(2)}%)
            </span>
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
          <div style={{ display: "flex", gap: "6px" }}>
            {[
              ["/trades/new", "+ Add Trade"],
              ["/import", "Import PDF"],
              ["/settings", "Settings"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                style={{
                  padding: "4px 10px",
                  borderRadius: "4px",
                  border: `1px solid ${DESIGN.cardBorder}`,
                  color: DESIGN.muted,
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                {label}
              </Link>
            ))}
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
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
                fontSize: "11px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {label}
            </button>
          ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "2px", marginBottom: "16px", background: "rgba(255,255,255,0.02)", borderRadius: "6px", padding: "3px", border: `1px solid ${DESIGN.cardBorder}` }}>
        {([
          ["account", "📊 Account"],
          ["live", `⚡ Live (${openTrades.length})`],
          ["history", `📋 History (${payload.trades.length})`],
          ["analysis", "🔬 Analysis"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1,
              padding: "8px 16px",
              borderRadius: "4px",
              border: "none",
              background: tab === key ? `${DESIGN.blue}15` : "transparent",
              color: tab === key ? DESIGN.blue : DESIGN.muted,
              fontSize: "12px",
              cursor: "pointer",
              fontWeight: tab === key ? 700 : 500,
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "account" && <AccountTab account={payload.account} closedTrades={closedTrades} openTrades={openTrades} />}
      {tab === "live" && <LiveTab openPositions={openTrades} stocks={payload.stocks} assetFilter={assetFilter} />}
      {tab === "history" && <HistoryTab trades={payload.trades} stocks={payload.stocks} assetFilter={assetFilter} />}
      {tab === "analysis" && (
        <AnalysisTab
          account={payload.account}
          trades={payload.trades}
          openTrades={openTrades}
          rules={payload.rules}
          ruleChecks={payload.scoring.perPosition}
          portfolioChecks={payload.scoring.portfolio}
          overallScore={payload.scoring.overallScore}
        />
      )}

      <p style={{ fontSize: "10px", color: "#334155", marginTop: "20px", textAlign: "center" }}>
        Data from IB Activity Statement · {payload.account.period_start} – {payload.account.period_end} · Generated {new Date().toLocaleDateString()}
      </p>
    </div>
  );
}
