"use client";

import { useState } from "react";

import { BreakevenBar } from "@/components/BreakevenBar";
import { Card, Dots, Pill } from "@/components/ui/primitives";
import { computeDTE, DESIGN, formatMoney, formatSigned } from "@/lib/design";
import { buildPositionGuidance } from "@/lib/live-guidance";
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

function toneByLevel(level: "critical" | "defensive" | "watch" | "offensive") {
  if (level === "critical") {
    return {
      color: DESIGN.red,
      background: `${DESIGN.red}10`,
      border: `${DESIGN.red}33`,
      label: "CRITICAL ACTION",
    };
  }

  if (level === "defensive") {
    return {
      color: DESIGN.yellow,
      background: `${DESIGN.yellow}10`,
      border: `${DESIGN.yellow}33`,
      label: "DEFENSIVE ACTION",
    };
  }

  if (level === "offensive") {
    return {
      color: DESIGN.green,
      background: `${DESIGN.green}10`,
      border: `${DESIGN.green}33`,
      label: "OFFENSIVE ACTION",
    };
  }

  return {
    color: DESIGN.blue,
    background: `${DESIGN.blue}10`,
    border: `${DESIGN.blue}33`,
    label: "WATCH ACTION",
  };
}

function formatPct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function playbookText(position: Trade, playbook: "conservative" | "balanced" | "aggressive") {
  if (playbook === "conservative") {
    return position.exit_conservative || "Preserve capital first.";
  }
  if (playbook === "aggressive") {
    return position.exit_aggressive || "Press only with predefined risk.";
  }
  return position.exit_balanced || "Scale decisions around risk/reward balance.";
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
  const [detailTab, setDetailTab] = useState<"action" | "plan">("action");
  const dte = computeDTE(position.expiry_date);
  const urgency = position.urgency ?? 1;
  const risk = calcRisk(position, price);
  const currentValue = estimateSpreadPnL(position, price) ?? position.unrealized_pl;
  const guidance = buildPositionGuidance(position, price);
  const guidanceTone = toneByLevel(guidance.level);
  const recommendedPlan = playbookText(position, guidance.recommendedPlaybook);

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
        <div
          onClick={(event) => event.stopPropagation()}
          style={{ marginTop: "14px", paddingTop: "12px", borderTop: `1px solid ${DESIGN.cardBorder}` }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button
                onClick={() => setDetailTab("action")}
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: `1px solid ${detailTab === "action" ? `${DESIGN.blue}55` : DESIGN.cardBorder}`,
                  background: detailTab === "action" ? `${DESIGN.blue}15` : "transparent",
                  color: detailTab === "action" ? DESIGN.blue : DESIGN.muted,
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.4px",
                  cursor: "pointer",
                }}
              >
                Action Guide
              </button>
              <button
                onClick={() => setDetailTab("plan")}
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: `1px solid ${detailTab === "plan" ? `${DESIGN.blue}55` : DESIGN.cardBorder}`,
                  background: detailTab === "plan" ? `${DESIGN.blue}15` : "transparent",
                  color: detailTab === "plan" ? DESIGN.blue : DESIGN.muted,
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.4px",
                  cursor: "pointer",
                }}
              >
                Original Plan
              </button>
            </div>
            <span style={{ fontSize: "10px", color: DESIGN.muted }}>
              Recommended: <span style={{ color: guidanceTone.color, fontWeight: 700 }}>{guidance.recommendedPlaybook.toUpperCase()}</span>
            </span>
          </div>

          {detailTab === "action" ? (
            <>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "6px",
                  background: guidanceTone.background,
                  border: `1px solid ${guidanceTone.border}`,
                  marginBottom: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "4px", flexWrap: "wrap" }}>
                  <div
                    style={{
                      fontSize: "10px",
                      color: guidanceTone.color,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {guidanceTone.label}
                  </div>
                  <Pill color={guidanceTone.color} background={`${guidanceTone.color}18`}>
                    {guidance.confidence}% confidence
                  </Pill>
                </div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: DESIGN.bright, marginBottom: "4px" }}>{guidance.title}</div>
                <div style={{ fontSize: "11px", color: DESIGN.text, lineHeight: 1.5 }}>{guidance.summary}</div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "6px",
                  marginBottom: "10px",
                }}
              >
                <Card style={{ padding: "8px 10px", borderRadius: "6px" }}>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, marginBottom: "2px", textTransform: "uppercase", fontWeight: 700 }}>Edge vs BE</div>
                  <div
                    style={{
                      fontFamily: DESIGN.mono,
                      fontSize: "13px",
                      fontWeight: 700,
                      color:
                        guidance.metrics.edgeVsBreakevenPct == null
                          ? DESIGN.muted
                          : guidance.metrics.edgeVsBreakevenPct >= 0
                            ? DESIGN.green
                            : DESIGN.red,
                    }}
                  >
                    {formatPct(guidance.metrics.edgeVsBreakevenPct)}
                  </div>
                </Card>
                <Card style={{ padding: "8px 10px", borderRadius: "6px" }}>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, marginBottom: "2px", textTransform: "uppercase", fontWeight: 700 }}>Stop Buffer</div>
                  <div
                    style={{
                      fontFamily: DESIGN.mono,
                      fontSize: "13px",
                      fontWeight: 700,
                      color:
                        guidance.metrics.stopBufferPct == null
                          ? DESIGN.muted
                          : guidance.metrics.stopBufferPct > 0
                            ? DESIGN.yellow
                            : DESIGN.red,
                    }}
                  >
                    {formatPct(guidance.metrics.stopBufferPct)}
                  </div>
                </Card>
                <Card style={{ padding: "8px 10px", borderRadius: "6px" }}>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, marginBottom: "2px", textTransform: "uppercase", fontWeight: 700 }}>Distance to Max</div>
                  <div
                    style={{
                      fontFamily: DESIGN.mono,
                      fontSize: "13px",
                      fontWeight: 700,
                      color:
                        guidance.metrics.targetGapPct == null
                          ? DESIGN.muted
                          : guidance.metrics.targetGapPct <= 1.5
                            ? DESIGN.green
                            : DESIGN.text,
                    }}
                  >
                    {formatPct(guidance.metrics.targetGapPct)}
                  </div>
                </Card>
                <Card style={{ padding: "8px 10px", borderRadius: "6px" }}>
                  <div style={{ fontSize: "10px", color: DESIGN.muted, marginBottom: "2px", textTransform: "uppercase", fontWeight: 700 }}>Time</div>
                  <div
                    style={{
                      fontFamily: DESIGN.mono,
                      fontSize: "13px",
                      fontWeight: 700,
                      color: guidance.metrics.dte <= 3 ? DESIGN.red : guidance.metrics.dte <= 7 ? DESIGN.yellow : DESIGN.green,
                    }}
                  >
                    {guidance.metrics.dte} DTE
                  </div>
                </Card>
              </div>

              <Card style={{ padding: "10px 12px", borderRadius: "6px", marginBottom: "10px" }}>
                <div style={{ fontSize: "10px", color: DESIGN.blue, fontWeight: 700, textTransform: "uppercase", marginBottom: "6px" }}>
                  Immediate Steps
                </div>
                <div style={{ display: "grid", gap: "6px" }}>
                  {guidance.nextSteps.map((step, index) => (
                    <div key={step} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                      <span
                        style={{
                          width: "15px",
                          height: "15px",
                          borderRadius: "50%",
                          background: `${DESIGN.blue}18`,
                          border: `1px solid ${DESIGN.blue}33`,
                          color: DESIGN.blue,
                          fontSize: "10px",
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: "1px",
                        }}
                      >
                        {index + 1}
                      </span>
                      <span style={{ fontSize: "11px", color: DESIGN.text, lineHeight: 1.45 }}>{step}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                  gap: "6px",
                }}
              >
                {guidance.triggers.map((trigger) => {
                  const stateColor =
                    trigger.state === "missing"
                      ? DESIGN.muted
                      : trigger.state === "hit"
                        ? trigger.id === "stop" || trigger.id === "time"
                          ? DESIGN.red
                          : DESIGN.green
                        : DESIGN.blue;

                  return (
                    <Card
                      key={trigger.id}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "6px",
                        background: `${stateColor}08`,
                        border: `1px solid ${stateColor}25`,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginBottom: "3px" }}>
                        <span style={{ fontSize: "10px", color: stateColor, fontWeight: 700, textTransform: "uppercase" }}>{trigger.label}</span>
                        <span style={{ fontSize: "10px", color: DESIGN.text, fontFamily: DESIGN.mono }}>{trigger.target}</span>
                      </div>
                      <div style={{ fontSize: "11px", color: DESIGN.muted, lineHeight: 1.35 }}>{trigger.detail}</div>
                    </Card>
                  );
                })}
              </div>

              <Card
                style={{
                  marginTop: "10px",
                  padding: "9px 10px",
                  borderRadius: "6px",
                  background: `${guidanceTone.color}08`,
                  border: `1px solid ${guidanceTone.color}20`,
                }}
              >
                <div style={{ fontSize: "10px", color: guidanceTone.color, fontWeight: 700, marginBottom: "3px", textTransform: "uppercase" }}>
                  Recommended Playbook ({guidance.recommendedPlaybook})
                </div>
                <div style={{ fontSize: "11px", color: DESIGN.text, lineHeight: 1.4 }}>{recommendedPlan}</div>
              </Card>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
