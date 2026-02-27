"use client";

import { useState } from "react";

import { BreakevenBar } from "@/components/BreakevenBar";
import { Card, Dots, Pill } from "@/components/ui/primitives";
import { computeDTE, DESIGN, formatMoney, formatSigned } from "@/lib/design";
import { buildPositionGuidance } from "@/lib/live-guidance";
import { buildLiveOptionSnapshot, getRiskSnapshot, type OptionQuoteMap } from "@/lib/live-position-metrics";
import type { Trade } from "@/lib/types";

function isCreditStrategy(strategy: string) {
  return strategy === "Bull Put Spread" || strategy === "Bear Call Spread" || strategy === "Iron Condor";
}

function urgencyTitle(level: number | null) {
  const value = level ?? 0;
  if (value <= 1) return "Urgency 1/5: low pressure, time cushion.";
  if (value === 2) return "Urgency 2/5: monitor, no immediate pressure.";
  if (value === 3) return "Urgency 3/5: active management required.";
  if (value === 4) return "Urgency 4/5: elevated pressure, manage tightly.";
  return "Urgency 5/5: highest pressure, near-term decisions required.";
}

function safeText(value: string | null | undefined, fallback: string) {
  if (value == null) return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
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
  optionQuotes,
  expanded,
  onToggle,
}: {
  position: Trade;
  price: number | null;
  optionQuotes: OptionQuoteMap;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [detailTab, setDetailTab] = useState<"action" | "plan">("action");
  const [showLegPrices, setShowLegPrices] = useState(false);
  const dte = computeDTE(position.expiry_date);
  const urgency = position.urgency ?? 1;
  const risk = getRiskSnapshot(position, price);
  const live = buildLiveOptionSnapshot(position, optionQuotes);
  const guidance = buildPositionGuidance(position, price);
  const guidanceTone = toneByLevel(guidance.level);
  const recommendedPlan = playbookText(position, guidance.recommendedPlaybook);
  const entryPerContract =
    position.contracts > 0 ? position.cost_basis / (position.contracts * 100) : null;
  const profitCaptureColor =
    live.profitCapturePct == null
      ? DESIGN.muted
      : live.profitCapturePct >= 40 && live.profitCapturePct <= 70
        ? DESIGN.green
        : live.profitCapturePct > 70
          ? DESIGN.yellow
          : DESIGN.blue;
  const holdAdviceText = safeText(
    position.hold_advice,
    safeText(position.notes, "No original hold plan was saved for this trade."),
  );
  const exitTriggerText = safeText(
    position.exit_trigger,
    "No explicit exit trigger was saved. Use stop and breakeven rules from Action Guide.",
  );
  const bestCaseText = safeText(
    position.best_case,
    position.max_profit != null
      ? `Target max profit potential is ${formatMoney(position.max_profit)}.`
      : "No explicit best-case scenario was saved.",
  );

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
          <span title={urgencyTitle(urgency)} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <Dots level={urgency} />
          </span>
        </div>

        <div style={{ display: "flex", gap: "16px", fontSize: "12px", fontFamily: DESIGN.mono }}>
          {price != null && (
            <span style={{ color: DESIGN.text }} title="Current underlying stock price">
              Current: ${price.toFixed(2)}
            </span>
          )}
          <span style={{ color: risk.color, fontWeight: 600 }} title={risk.detail}>
            {risk.label}
          </span>
          {live.livePnl != null && (
            <span
              style={{ color: live.livePnl >= 0 ? DESIGN.green : DESIGN.red, fontWeight: 700 }}
              title="Live option P/L from option mark quotes"
            >
              {formatSigned(live.livePnl)}
            </span>
          )}
          {live.livePnl == null && live.markValue != null && (
            <span style={{ color: DESIGN.blue, fontWeight: 700 }} title="Live option position mark value">
              Mark {formatMoney(live.markValue)}
            </span>
          )}
          {live.livePnl == null && live.markValue == null && (
            <span style={{ color: DESIGN.muted, fontWeight: 700 }} title="Needs option quote data for all legs">
              Live P/L —
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "16px", marginTop: "8px", fontSize: "11px", color: DESIGN.muted, flexWrap: "wrap" }}>
        <span>{position.legs}</span>
        <span>
          Risk: <span style={{ color: DESIGN.red, fontFamily: DESIGN.mono, fontWeight: 700 }}>{formatMoney(position.max_risk)}</span>
        </span>
        <span>
          Max Profit:{" "}
          <span style={{ color: DESIGN.green, fontFamily: DESIGN.mono, fontWeight: 700 }}>
            {position.max_profit != null ? formatMoney(position.max_profit) : "∞"}
          </span>
        </span>
        <span title="Net position entry cost/credit per contract">
          Entry {isCreditStrategy(position.strategy) ? "Credit" : "Debit"}:{" "}
          <span style={{ color: DESIGN.text, fontFamily: DESIGN.mono, fontWeight: 700 }}>
            {entryPerContract != null ? `$${entryPerContract.toFixed(2)}/contract` : "—"}
          </span>
        </span>
        {(position.close_price_long != null || position.close_price_short != null) && (
          <span title="Saved leg prices from your trade data">
            Leg Px:{" "}
            <span style={{ color: DESIGN.text, fontFamily: DESIGN.mono, fontWeight: 700 }}>
              {position.close_price_long != null ? `L ${position.close_price_long.toFixed(2)}` : "L —"} /{" "}
              {position.close_price_short != null ? `S ${position.close_price_short.toFixed(2)}` : "S —"}
            </span>
          </span>
        )}
        <span>θ: {position.theta_per_day ?? "—"}/day</span>
        {live.profitCapturePct != null && (
          <span title="Current live P/L as % of max profit target">
            Capture:{" "}
            <span style={{ color: profitCaptureColor, fontFamily: DESIGN.mono, fontWeight: 700 }}>
              {live.profitCapturePct.toFixed(1)}%
            </span>
          </span>
        )}
        {position.catalyst && (
          <Pill color={catalystColor(position.catalyst)} background={`${catalystColor(position.catalyst)}15`}>
            {position.catalyst}
          </Pill>
        )}
        {live.legs.length > 0 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowLegPrices((current) => !current);
            }}
            style={{
              border: `1px solid ${DESIGN.cardBorder}`,
              background: showLegPrices ? `${DESIGN.blue}16` : "transparent",
              color: showLegPrices ? DESIGN.blue : DESIGN.muted,
              fontSize: "10px",
              borderRadius: "4px",
              padding: "2px 8px",
              cursor: "pointer",
            }}
            title="Show or hide leg-level entry/live prices"
          >
            {showLegPrices ? "Hide Leg Prices" : "Show Leg Prices"}
          </button>
        )}
      </div>

      {showLegPrices && live.legs.length > 0 && (
        <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
          {live.legs.map((leg) => (
            <span
              key={leg.symbol}
              title={leg.symbol}
              style={{
                fontSize: "10px",
                fontFamily: DESIGN.mono,
                color: leg.side === "LONG" ? DESIGN.green : DESIGN.red,
                background: "rgba(255,255,255,0.02)",
                border: `1px solid ${DESIGN.cardBorder}`,
                borderRadius: "4px",
                padding: "2px 6px",
              }}
            >
              {leg.side === "LONG" ? "B" : "S"} {leg.strike}
              {leg.optionType} {leg.mark != null ? `@ ${leg.mark.toFixed(2)}` : "@ —"}
            </span>
          ))}
        </div>
      )}

      <BreakevenBar
        price={price}
        strategy={position.strategy}
        legs={position.legs}
        contracts={position.contracts}
        maxProfit={position.max_profit}
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

              <Card style={{ padding: "10px 12px", borderRadius: "6px", marginBottom: "10px" }}>
                <div style={{ fontSize: "10px", color: DESIGN.blue, fontWeight: 700, textTransform: "uppercase", marginBottom: "6px" }}>
                  Live Position Readout
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                    gap: "8px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "10px", color: DESIGN.muted, marginBottom: "2px", textTransform: "uppercase" }}>Live P/L</div>
                    <div
                      style={{
                        fontFamily: DESIGN.mono,
                        fontSize: "13px",
                        fontWeight: 700,
                        color:
                          live.livePnl == null
                            ? DESIGN.muted
                            : live.livePnl >= 0
                              ? DESIGN.green
                              : DESIGN.red,
                      }}
                    >
                      {live.livePnl != null ? formatSigned(live.livePnl) : "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: DESIGN.muted, marginBottom: "2px", textTransform: "uppercase" }}>Live Mark</div>
                    <div style={{ fontFamily: DESIGN.mono, fontSize: "13px", fontWeight: 700, color: DESIGN.text }}>
                      {live.markValue != null ? formatMoney(live.markValue) : "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: DESIGN.muted, marginBottom: "2px", textTransform: "uppercase" }}>Progress</div>
                    <div
                      style={{
                        fontFamily: DESIGN.mono,
                        fontSize: "13px",
                        fontWeight: 700,
                        color:
                          live.profitCapturePct != null
                            ? live.profitCapturePct >= 40 && live.profitCapturePct <= 70
                              ? DESIGN.green
                              : DESIGN.yellow
                            : live.riskConsumedPct != null
                              ? DESIGN.red
                              : DESIGN.muted,
                      }}
                    >
                      {live.profitCapturePct != null
                        ? `${live.profitCapturePct.toFixed(1)}% of max`
                        : live.riskConsumedPct != null
                          ? `${live.riskConsumedPct.toFixed(1)}% risk used`
                          : "—"}
                    </div>
                  </div>
                </div>
              </Card>

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
                <div style={{ fontSize: "12px", color: DESIGN.text, lineHeight: 1.5 }}>{holdAdviceText}</div>
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
                  <div style={{ fontSize: "11px", color: DESIGN.text, lineHeight: 1.4 }}>{exitTriggerText}</div>
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
                  <div style={{ fontSize: "11px", color: DESIGN.text, lineHeight: 1.4 }}>{bestCaseText}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
                {[
                  {
                    key: "conservative",
                    label: "Conservative",
                    text: safeText(position.exit_conservative, "No conservative plan saved."),
                    color: DESIGN.blue,
                  },
                  {
                    key: "balanced",
                    label: "Balanced",
                    text: safeText(position.exit_balanced, "No balanced plan saved."),
                    color: DESIGN.yellow,
                  },
                  {
                    key: "aggressive",
                    label: "Aggressive",
                    text: safeText(position.exit_aggressive, "No aggressive plan saved."),
                    color: DESIGN.red,
                  },
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
                      {item.label.toUpperCase()}
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
