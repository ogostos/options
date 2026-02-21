"use client";

import { Pill } from "@/components/ui/primitives";
import { DESIGN, formatMoney, formatPct, formatSigned } from "@/lib/design";
import type { Trade } from "@/lib/types";

export function TradeCard({
  trade,
  expanded,
  onToggle,
  maxAbsPnl,
}: {
  trade: Trade;
  expanded: boolean;
  onToggle: () => void;
  maxAbsPnl: number;
}) {
  const pl = trade.status === "OPEN" ? (trade.unrealized_pl ?? 0) : (trade.realized_pl ?? 0);
  const plPct = Math.min((Math.abs(pl) / Math.max(maxAbsPnl, 1)) * 100, 100);
  const isPos = pl >= 0;

  const lessonTone = trade.lesson.startsWith("✅")
    ? DESIGN.green
    : trade.lesson.startsWith("❌")
      ? DESIGN.red
      : DESIGN.yellow;

  return (
    <div
      onClick={onToggle}
      style={{
        background: expanded ? "rgba(255,255,255,0.04)" : DESIGN.card,
        borderRadius: "6px",
        padding: "10px 14px",
        border: `1px solid ${expanded ? `${DESIGN.blue}33` : trade.status === "OPEN" ? `${DESIGN.yellow}15` : DESIGN.cardBorder}`,
        marginBottom: "4px",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 180px 60px", alignItems: "center", gap: "12px" }}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: DESIGN.bright }}>{trade.ticker}</div>
          <div style={{ fontSize: "10px", color: DESIGN.muted }}>{trade.strategy}</div>
        </div>

        <div style={{ display: "flex", gap: "14px", fontSize: "11px", color: DESIGN.muted, flexWrap: "wrap" }}>
          <span>{trade.legs}</span>
          <span style={{ color: trade.direction === "Bullish" ? DESIGN.green : trade.direction === "Bearish" ? DESIGN.red : DESIGN.yellow }}>
            {trade.direction === "Bullish" ? "▲" : trade.direction === "Bearish" ? "▼" : "◆"} {trade.direction}
          </span>
          <span>{trade.entry_date} → {trade.exit_date ?? "OPEN"}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ flex: 1, height: "6px", background: "rgba(255,255,255,0.04)", borderRadius: "3px", overflow: "hidden" }}>
            <div
              style={{
                width: `${plPct}%`,
                height: "100%",
                borderRadius: "3px",
                background: isPos
                  ? "linear-gradient(90deg, #065f46, #10b981)"
                  : "linear-gradient(90deg, #991b1b, #ef4444)",
              }}
            />
          </div>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 700,
              fontFamily: DESIGN.mono,
              minWidth: "80px",
              textAlign: "right",
              color: isPos ? DESIGN.green : DESIGN.red,
            }}
          >
            {formatSigned(pl)}
          </span>
        </div>

        <div style={{ textAlign: "right" }}>
          <Pill
            color={trade.status === "WIN" ? DESIGN.green : trade.status === "LOSS" || trade.status === "EXPIRED" ? DESIGN.red : DESIGN.yellow}
            background={
              trade.status === "WIN"
                ? `${DESIGN.green}18`
                : trade.status === "LOSS" || trade.status === "EXPIRED"
                  ? `${DESIGN.red}18`
                  : `${DESIGN.yellow}18`
            }
          >
            {trade.status}
          </Pill>
        </div>
      </div>

      {expanded && (
        <div
          style={{
            marginTop: "10px",
            paddingTop: "10px",
            borderTop: `1px solid ${DESIGN.cardBorder}`,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
          }}
        >
          <div style={{ fontSize: "12px" }}>
            {[
              ["Capital / Risk", formatMoney(trade.cost_basis || trade.max_risk)],
              ["P/L", formatSigned(pl)],
              ["Return", formatPct(trade.return_pct)],
              ["Commissions", formatMoney(trade.commissions)],
              ["Contracts", String(trade.contracts)],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "3px 0",
                  borderBottom: `1px solid ${DESIGN.cardBorder}`,
                }}
              >
                <span style={{ color: DESIGN.muted }}>{label}</span>
                <span style={{ fontFamily: DESIGN.mono, fontWeight: 600, color: DESIGN.text }}>{value}</span>
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontSize: "12px", color: DESIGN.muted, lineHeight: 1.5, marginBottom: "8px" }}>{trade.notes}</div>
            {trade.lesson && (
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: "5px",
                  fontSize: "11px",
                  color: DESIGN.text,
                  lineHeight: 1.4,
                  background: `${lessonTone}08`,
                  border: `1px solid ${lessonTone}25`,
                }}
              >
                {trade.lesson}
              </div>
            )}
            {trade.catalyst && (
              <div style={{ marginTop: "6px" }}>
                <Pill
                  color={trade.catalyst === "Earnings" ? DESIGN.purple : DESIGN.green}
                  background={trade.catalyst === "Earnings" ? `${DESIGN.purple}15` : `${DESIGN.green}15`}
                >
                  {trade.catalyst}
                </Pill>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
