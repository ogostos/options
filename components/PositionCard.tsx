"use client";

import { BreakevenBar } from "@/components/BreakevenBar";
import { Card, Dots, Pill } from "@/components/ui/primitives";
import { computeDTE, DESIGN, formatMoney, formatSigned } from "@/lib/design";
import type { Trade } from "@/lib/types";

function calcRisk(position: Trade, price: number | null) {
  if (!price || !position.expiry_date || position.breakeven == null) {
    return { level: 3, label: "—", color: DESIGN.muted };
  }

  const dte = computeDTE(position.expiry_date);
  const be = position.breakeven;
  const dist = ((be - price) / price) * 100;
  const absDist = Math.abs(dist);

  if (price >= be) return { level: 1, label: "SAFE", color: DESIGN.green };
  if (absDist < 3 && dte > 5) return { level: 2, label: "NEAR", color: DESIGN.green };
  if (absDist < 5 && dte > 3) return { level: 3, label: "CAUTION", color: DESIGN.yellow };
  if (absDist < 10 && dte > 2) return { level: 4, label: "AT RISK", color: "#f97316" };
  return { level: 5, label: "CRITICAL", color: "#ef4444" };
}

function estimateSpreadPnL(position: Trade, price: number | null) {
  if (price == null || position.strike_long == null) return null;

  if (position.strategy === "Long Call" || position.strategy === "Long Call (ex-diagonal)") {
    return Math.max(0, (price - position.strike_long) * 100) - position.cost_basis;
  }

  if (position.strategy === "Long Put") {
    return Math.max(0, (position.strike_long - price) * 100) - position.cost_basis;
  }

  if (position.strike_short == null) return null;

  const width = Math.abs(position.strike_short - position.strike_long);
  const intrinsic = Math.max(0, price - position.strike_long) * 100;
  const maxValue = width * 100;
  return Math.min(maxValue, intrinsic) - position.cost_basis;
}

function catalystColor(catalyst: string) {
  return catalyst === "Earnings" ? DESIGN.purple : DESIGN.green;
}

export function PositionCard({
  position,
  price,
  expanded,
  onToggle,
}: {
  position: Trade;
  price: number | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const dte = computeDTE(position.expiry_date);
  const urgency = position.urgency ?? 1;
  const risk = calcRisk(position, price);
  const currentValue = estimateSpreadPnL(position, price) ?? position.unrealized_pl;

  return (
    <div
      onClick={onToggle}
      style={{
        background: expanded ? "rgba(255,255,255,0.04)" : DESIGN.card,
        borderRadius: "8px",
        padding: "14px 16px",
        border: `1px solid ${expanded ? `${DESIGN.blue}44` : urgency >= 4 ? "rgba(239,68,68,0.15)" : DESIGN.cardBorder}`,
        marginBottom: "6px",
        cursor: "pointer",
        transition: "all 0.2s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div>
            <span style={{ fontSize: "16px", fontWeight: 700, color: DESIGN.bright }}>{position.ticker}</span>
            <span style={{ fontSize: "11px", color: DESIGN.muted, marginLeft: "8px" }}>{position.strategy}</span>
          </div>
          <Pill
            color={urgency >= 4 ? DESIGN.red : urgency >= 3 ? DESIGN.yellow : DESIGN.green}
            background={
              urgency >= 4
                ? `${DESIGN.red}18`
                : urgency >= 3
                  ? `${DESIGN.yellow}18`
                  : `${DESIGN.green}18`
            }
          >
            {dte} DTE
          </Pill>
          <Dots level={urgency} />
        </div>

        <div style={{ display: "flex", gap: "16px", fontSize: "12px", fontFamily: DESIGN.mono }}>
          {price != null && <span style={{ color: DESIGN.text }}>@{price.toFixed(2)}</span>}
          <span style={{ color: risk.color, fontWeight: 600 }}>{risk.label}</span>
          {currentValue != null && (
            <span style={{ color: currentValue >= 0 ? DESIGN.green : DESIGN.red, fontWeight: 700 }}>
              {formatSigned(currentValue)}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "16px", marginTop: "8px", fontSize: "11px", color: DESIGN.muted, flexWrap: "wrap" }}>
        <span>{position.legs}</span>
        <span>Risk: {formatMoney(position.max_risk)}</span>
        <span>Max: {position.max_profit != null ? formatMoney(position.max_profit) : "∞"}</span>
        <span>θ: {position.theta_per_day ?? "—"}/day</span>
        {position.catalyst && (
          <Pill color={catalystColor(position.catalyst)} background={`${catalystColor(position.catalyst)}15`}>
            {position.catalyst}
          </Pill>
        )}
      </div>

      <BreakevenBar
        price={price}
        breakeven={position.breakeven}
        stopLoss={position.stop_loss}
        strikeLong={position.strike_long}
        strikeShort={position.strike_short}
      />

      {expanded && (
        <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: `1px solid ${DESIGN.cardBorder}` }}>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "6px",
              background: `${DESIGN.blue}08`,
              border: `1px solid ${DESIGN.blue}20`,
              marginBottom: "10px",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                color: DESIGN.blue,
                fontWeight: 700,
                textTransform: "uppercase",
                marginBottom: "4px",
              }}
            >
              Hold Advice
            </div>
            <div style={{ fontSize: "12px", color: DESIGN.text, lineHeight: 1.5 }}>{position.hold_advice}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
            <div
              style={{
                padding: "8px 10px",
                borderRadius: "6px",
                background: `${DESIGN.yellow}08`,
                border: `1px solid ${DESIGN.yellow}15`,
              }}
            >
              <div style={{ fontSize: "10px", color: DESIGN.yellow, fontWeight: 700, marginBottom: "3px" }}>
                EXIT TRIGGER
              </div>
              <div style={{ fontSize: "11px", color: DESIGN.text, lineHeight: 1.4 }}>{position.exit_trigger}</div>
            </div>
            <div
              style={{
                padding: "8px 10px",
                borderRadius: "6px",
                background: `${DESIGN.green}08`,
                border: `1px solid ${DESIGN.green}15`,
              }}
            >
              <div style={{ fontSize: "10px", color: DESIGN.green, fontWeight: 700, marginBottom: "3px" }}>
                BEST CASE
              </div>
              <div style={{ fontSize: "11px", color: DESIGN.text, lineHeight: 1.4 }}>{position.best_case}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
            {[
              { key: "conservative", icon: "🛡", text: position.exit_conservative, color: DESIGN.blue },
              { key: "balanced", icon: "⚖️", text: position.exit_balanced, color: DESIGN.yellow },
              { key: "aggressive", icon: "🔥", text: position.exit_aggressive, color: DESIGN.red },
            ].map((item) => (
              <Card
                key={item.key}
                style={{
                  padding: "8px",
                  borderRadius: "6px",
                  background: `${item.color}06`,
                  border: `1px solid ${item.color}18`,
                }}
              >
                <div style={{ fontSize: "10px", fontWeight: 700, color: item.color, marginBottom: "3px" }}>
                  {item.icon} {item.key.toUpperCase()}
                </div>
                <div style={{ fontSize: "11px", color: DESIGN.text, lineHeight: 1.4 }}>{item.text}</div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
