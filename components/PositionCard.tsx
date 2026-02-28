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

function catalystColor(catalyst: string) {
  return catalyst === "Earnings" ? DESIGN.purple : DESIGN.green;
}

function sourceLabel(source: string | null) {
  if (!source) return "—";
  if (source === "massive-options") return "Massive";
  if (source === "yahoo-options") return "Yahoo";
  if (source === "manual") return "Manual";
  return source;
}

function sourceColor(source: string | null) {
  if (source === "massive-options") return DESIGN.blue;
  if (source === "yahoo-options") return DESIGN.yellow;
  if (source === "manual") return DESIGN.purple;
  return DESIGN.muted;
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

export function PositionCard({
  position,
  price,
  optionQuotes,
  livePnlOverride,
  livePnlMode = "derived",
  expanded,
  onToggle,
}: {
  position: Trade;
  price: number | null;
  optionQuotes: OptionQuoteMap;
  livePnlOverride?: number | null;
  livePnlMode?: "derived" | "ibkr-native";
  expanded: boolean;
  onToggle: () => void;
}) {
  const [showLegPrices, setShowLegPrices] = useState(false);
  const dte = computeDTE(position.expiry_date);
  const urgency = position.urgency ?? 1;
  const risk = getRiskSnapshot(position, price);
  const live = buildLiveOptionSnapshot(position, optionQuotes);
  const guidance = buildPositionGuidance(position, price);
  const guidanceTone = toneByLevel(guidance.level);
  const entryPerContract =
    position.contracts > 0 ? position.cost_basis / (position.contracts * 100) : null;
  const displayLivePnl = livePnlOverride ?? null;
  const capturePct =
    displayLivePnl != null && displayLivePnl > 0 && position.max_profit != null && position.max_profit > 0
      ? Number(((displayLivePnl / position.max_profit) * 100).toFixed(1))
      : live.profitCapturePct;
  const profitCaptureColor =
    capturePct == null
      ? DESIGN.muted
      : capturePct >= 40 && capturePct <= 70
        ? DESIGN.green
        : capturePct > 70
          ? DESIGN.yellow
          : DESIGN.blue;
  const legSources = Array.from(
    new Set(live.legs.map((leg) => leg.source).filter((value): value is string => Boolean(value))),
  );
  const legMarkSummary =
    legSources.length === 0
      ? "missing"
      : legSources.length === 1
        ? sourceLabel(legSources[0])
        : `mixed (${legSources.map((value) => sourceLabel(value)).join(" / ")})`;
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
            <span style={{ fontSize: "18px", fontWeight: 700, color: DESIGN.bright }}>{position.ticker}</span>
            <span style={{ fontSize: "12px", color: DESIGN.muted, marginLeft: "8px" }}>{position.strategy}</span>
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

        <div style={{ display: "flex", gap: "16px", fontSize: "13px", fontFamily: DESIGN.mono }}>
          {price != null && (
            <span style={{ color: DESIGN.text }} title="Current underlying stock price">
              Current: ${price.toFixed(2)}
            </span>
          )}
          <span style={{ color: risk.color, fontWeight: 600 }} title={risk.detail}>
            {risk.label}
          </span>
          {displayLivePnl != null && (
            <span
              style={{ color: displayLivePnl >= 0 ? DESIGN.green : DESIGN.red, fontWeight: 700 }}
              title={
                livePnlMode === "ibkr-native"
                  ? "IBKR native unrealized P/L from synced positions"
                  : "Live option P/L from option mark quotes"
              }
            >
              {formatSigned(displayLivePnl)}
            </span>
          )}
          {displayLivePnl == null && live.markValue != null && (
            <span style={{ color: DESIGN.blue, fontWeight: 700 }} title="Live option position mark value">
              Mark {formatMoney(live.markValue)}
            </span>
          )}
          {displayLivePnl == null && live.markValue == null && (
            <span style={{ color: DESIGN.muted, fontWeight: 700 }} title="Needs option quote data for all legs">
              Live P/L —
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "16px", marginTop: "10px", fontSize: "12px", color: DESIGN.muted, flexWrap: "wrap" }}>
        <span style={{ color: DESIGN.text }}>{position.legs}</span>
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
        {position.theta_per_day != null && (
          <span>Theta/day: {position.theta_per_day}</span>
        )}
        {capturePct != null && (
          <span title="Current live P/L as % of max profit target">
            Capture:{" "}
            <span style={{ color: profitCaptureColor, fontFamily: DESIGN.mono, fontWeight: 700 }}>
              {capturePct.toFixed(1)}%
            </span>
          </span>
        )}
        <span title="Live option leg mark source used for live P/L">
          Leg marks:{" "}
          <span
            style={{
              color: legSources.length === 1 ? sourceColor(legSources[0]) : DESIGN.muted,
              fontFamily: DESIGN.mono,
              fontWeight: 700,
            }}
          >
            {legMarkSummary}
          </span>
        </span>
        {position.catalyst && position.catalyst !== "None" && (
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
              {leg.optionType} {leg.mark != null ? `@ ${leg.mark.toFixed(2)}` : "@ —"} ·{" "}
              <span style={{ color: sourceColor(leg.source) }}>{sourceLabel(leg.source)}</span>
            </span>
          ))}
        </div>
      )}

      <BreakevenBar
        price={price}
        strategy={position.strategy}
        legs={position.legs}
        contracts={position.contracts}
        maxRisk={position.max_risk}
        maxProfit={position.max_profit}
        breakeven={position.breakeven}
        stopLoss={position.stop_loss}
        strikeLong={position.strike_long}
        strikeShort={position.strike_short}
      />

      <div
        style={{
          marginTop: "8px",
          padding: "8px 10px",
          borderRadius: "6px",
          background: `${guidanceTone.color}0f`,
          border: `1px solid ${guidanceTone.border}`,
          display: "flex",
          justifyContent: "space-between",
          gap: "10px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: "12px", color: DESIGN.text }}>
          <span style={{ color: guidanceTone.color, fontWeight: 700, marginRight: "6px" }}>{guidance.title}</span>
          {guidance.nextSteps[0]}
        </div>
        <span style={{ fontSize: "11px", color: DESIGN.muted }}>
          Confidence: <span style={{ color: guidanceTone.color, fontWeight: 700 }}>{guidance.confidence}%</span>
        </span>
      </div>

      {expanded && (
        <div
          onClick={(event) => event.stopPropagation()}
          style={{ marginTop: "14px", paddingTop: "12px", borderTop: `1px solid ${DESIGN.cardBorder}` }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "12px", color: DESIGN.blue, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Action Guide
            </div>
            <span style={{ fontSize: "11px", color: DESIGN.muted }}>
              Playbook: <span style={{ color: guidanceTone.color, fontWeight: 700 }}>{guidance.recommendedPlaybook.toUpperCase()}</span>
            </span>
          </div>

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
                  fontSize: "11px",
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
            <div style={{ fontSize: "14px", fontWeight: 700, color: DESIGN.bright, marginBottom: "4px" }}>{guidance.title}</div>
            <div style={{ fontSize: "12px", color: DESIGN.text, lineHeight: 1.5 }}>{guidance.summary}</div>
          </div>

          <Card style={{ padding: "10px 12px", borderRadius: "6px", marginBottom: "10px" }}>
            <div style={{ fontSize: "11px", color: DESIGN.blue, fontWeight: 700, textTransform: "uppercase", marginBottom: "6px" }}>
              Immediate Steps
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              {guidance.nextSteps.slice(0, 3).map((step, index) => (
                <div key={step} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                  <span
                    style={{
                      width: "16px",
                      height: "16px",
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
                  <span style={{ fontSize: "12px", color: DESIGN.text, lineHeight: 1.45 }}>{step}</span>
                </div>
              ))}
            </div>
          </Card>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "8px",
            }}
          >
            {guidance.triggers.slice(0, 3).map((trigger) => {
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
                    padding: "9px 10px",
                    borderRadius: "6px",
                    background: `${stateColor}08`,
                    border: `1px solid ${stateColor}25`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginBottom: "3px" }}>
                    <span style={{ fontSize: "11px", color: stateColor, fontWeight: 700, textTransform: "uppercase" }}>{trigger.label}</span>
                    <span style={{ fontSize: "11px", color: DESIGN.text, fontFamily: DESIGN.mono }}>{trigger.target}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: DESIGN.muted, lineHeight: 1.35 }}>{trigger.detail}</div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
