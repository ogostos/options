"use client";

import { useMemo, useState } from "react";

import { RuleCheck } from "@/components/RuleCheck";
import { Card, Pill } from "@/components/ui/primitives";
import { DESIGN, formatMoney, formatSigned } from "@/lib/design";
import { TRADE_AUTOPSY_REFERENCE } from "@/lib/seed-data";
import type { AccountSnapshot, PortfolioRuleChecks, Rule, RuleCheckResult, Trade } from "@/lib/types";

type SectionKey =
  | "rulecheck"
  | "overview"
  | "autopsy"
  | "patterns"
  | "sins"
  | "rules"
  | "identity"
  | "recovery";

function Section({
  title,
  icon,
  accent,
  children,
}: {
  title: string;
  icon: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <div
        style={{
          fontSize: "14px",
          fontWeight: 700,
          color: accent,
          marginBottom: "10px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <span>{icon}</span> {title}
      </div>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  return (
    <div style={{ padding: "10px 14px", borderRadius: "6px", background: DESIGN.card, border: `1px solid ${DESIGN.cardBorder}` }}>
      <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{ fontSize: "16px", fontWeight: 700, color, fontFamily: DESIGN.mono }}>{value}</div>
      {sub && <div style={{ fontSize: "10px", color: DESIGN.muted, marginTop: "2px" }}>{sub}</div>}
    </div>
  );
}

function BarRow({
  label,
  value,
  pct,
  color,
  maxPct = 100,
}: {
  label: string;
  value: string;
  pct: number;
  color: string;
  maxPct?: number;
}) {
  return (
    <div style={{ marginBottom: "6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "3px" }}>
        <span style={{ color: DESIGN.muted }}>{label}</span>
        <span style={{ color, fontFamily: DESIGN.mono, fontWeight: 600 }}>{value}</span>
      </div>
      <div style={{ height: "6px", background: "rgba(255,255,255,0.04)", borderRadius: "3px", overflow: "hidden" }}>
        <div
          style={{
            width: `${Math.min(100, (pct / maxPct) * 100)}%`,
            height: "100%",
            borderRadius: "3px",
            background: color,
          }}
        />
      </div>
    </div>
  );
}

export function AnalysisTab({
  account,
  trades,
  openTrades,
  rules,
  ruleChecks,
  portfolioChecks,
  overallScore,
}: {
  account: AccountSnapshot;
  trades: Trade[];
  openTrades: Trade[];
  rules: Rule[];
  ruleChecks: RuleCheckResult[];
  portfolioChecks: PortfolioRuleChecks;
  overallScore: number;
}) {
  const [section, setSection] = useState<SectionKey>("rulecheck");
  const [expandedAutopsy, setExpandedAutopsy] = useState<string | null>(null);

  const closedTrades = useMemo(
    () => trades.filter((trade) => trade.position_type === "option" && trade.status !== "OPEN"),
    [trades],
  );

  const closedWins = closedTrades.filter((trade) => trade.status === "WIN");
  const closedLosses = closedTrades.filter((trade) => trade.status === "LOSS" || trade.status === "EXPIRED");
  const totalClosedPl = closedTrades.reduce((sum, trade) => sum + (trade.realized_pl ?? 0), 0);

  const strategyBuckets = useMemo(() => {
    const map = new Map<string, { wins: number; losses: number; net: number }>();
    for (const trade of closedTrades) {
      const key = trade.strategy;
      const current = map.get(key) ?? { wins: 0, losses: 0, net: 0 };
      current.net += trade.realized_pl ?? 0;
      if (trade.status === "WIN") current.wins += 1;
      if (trade.status === "LOSS" || trade.status === "EXPIRED") current.losses += 1;
      map.set(key, current);
    }
    return [...map.entries()].map(([name, value]) => ({ name, ...value }));
  }, [closedTrades]);

  const directionBuckets = useMemo(() => {
    const map = new Map<string, { wins: number; losses: number; net: number }>();
    for (const trade of closedTrades) {
      const key = trade.direction;
      const current = map.get(key) ?? { wins: 0, losses: 0, net: 0 };
      current.net += trade.realized_pl ?? 0;
      if (trade.status === "WIN") current.wins += 1;
      if (trade.status === "LOSS" || trade.status === "EXPIRED") current.losses += 1;
      map.set(key, current);
    }
    return [...map.entries()].map(([dir, value]) => ({ dir, ...value }));
  }, [closedTrades]);

  const navSections: Array<[SectionKey, string]> = [
    ["rulecheck", "⚖️ Rule Check"],
    ["overview", "Overview"],
    ["autopsy", "Trade Autopsy"],
    ["patterns", "Patterns"],
    ["sins", "5 Deadly Sins"],
    ["rules", "Discipline Code"],
    ["identity", "Identity"],
    ["recovery", "Recovery"],
  ];

  const grinderProjection = account.end_nav * Math.pow(1.04, 12);
  const hybridProjection = account.end_nav * Math.pow(1.06, 12);
  const catalystProjection = account.end_nav * Math.pow(1.1, 12);

  return (
    <div>
      <div style={{ display: "flex", gap: "3px", marginBottom: "16px", overflowX: "auto", paddingBottom: "4px" }}>
        {navSections.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            style={{
              padding: "5px 12px",
              borderRadius: "4px",
              border: `1px solid ${section === key ? `${DESIGN.purple}55` : DESIGN.cardBorder}`,
              background: section === key ? `${DESIGN.purple}12` : "transparent",
              color: section === key ? DESIGN.purple : DESIGN.muted,
              fontSize: "11px",
              fontWeight: section === key ? 700 : 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "rulecheck" && (
        <RuleCheck
          openTrades={openTrades}
          results={ruleChecks}
          portfolio={portfolioChecks}
          overallScore={overallScore}
          nav={account.end_nav}
        />
      )}

      {section === "overview" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px", marginBottom: "16px" }}>
            <Stat label="Record" value={`${closedWins.length}W / ${closedLosses.length}L`} color={DESIGN.red} sub={`${((closedWins.length / Math.max(closedTrades.length, 1)) * 100).toFixed(0)}% win rate`} />
            <Stat label="Net Closed P/L" value={formatSigned(totalClosedPl)} color={totalClosedPl >= 0 ? DESIGN.green : DESIGN.red} />
            <Stat label="Profit Factor" value={(closedWins.reduce((sum, trade) => sum + (trade.realized_pl ?? 0), 0) / Math.max(1, Math.abs(closedLosses.reduce((sum, trade) => sum + (trade.realized_pl ?? 0), 0)))).toFixed(2)} color={DESIGN.yellow} />
            <Stat label="Avg Winner" value={formatSigned(closedWins.reduce((sum, trade) => sum + (trade.realized_pl ?? 0), 0) / Math.max(closedWins.length, 1))} color={DESIGN.green} />
            <Stat label="Avg Loser" value={formatSigned(closedLosses.reduce((sum, trade) => sum + (trade.realized_pl ?? 0), 0) / Math.max(closedLosses.length, 1))} color={DESIGN.red} />
            <Stat label="Expired Worthless" value={`${closedTrades.filter((trade) => (trade.return_pct ?? 0) <= -99).length} / ${closedTrades.length}`} color={DESIGN.red} />
          </div>

          <Section title="Strategy Performance" icon="📊" accent={DESIGN.blue}>
            {strategyBuckets.map((strategy) => (
              <BarRow
                key={strategy.name}
                label={`${strategy.name} (${strategy.wins}W/${strategy.losses}L)`}
                value={formatSigned(strategy.net)}
                pct={Math.abs(strategy.net)}
                color={strategy.net >= 0 ? DESIGN.green : DESIGN.red}
                maxPct={4000}
              />
            ))}
          </Section>

          <Section title="Direction Bias" icon="🧭" accent={DESIGN.yellow}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
              {directionBuckets.map((row) => (
                <Card key={row.dir} style={{ textAlign: "center", borderColor: row.net >= 0 ? `${DESIGN.green}30` : `${DESIGN.red}30` }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: DESIGN.bright, marginBottom: "3px" }}>{row.dir}</div>
                  <div style={{ fontSize: "11px", color: DESIGN.muted, marginBottom: "4px" }}>{row.wins}W / {row.losses}L</div>
                  <div style={{ fontSize: "15px", fontWeight: 700, fontFamily: DESIGN.mono, color: row.net >= 0 ? DESIGN.green : DESIGN.red }}>{formatSigned(row.net)}</div>
                </Card>
              ))}
            </div>
          </Section>
        </div>
      )}

      {section === "autopsy" && (
        <div>
          <div style={{ fontSize: "12px", color: DESIGN.muted, marginBottom: "12px", lineHeight: 1.5 }}>
            Click each trade for a full breakdown: what happened, what worked, and the lesson.
          </div>
          {TRADE_AUTOPSY_REFERENCE.map((trade) => {
            const key = `${trade.ticker}-${trade.days}`;
            const expanded = expandedAutopsy === key;
            return (
              <div
                key={key}
                onClick={() => setExpandedAutopsy((current) => (current === key ? null : key))}
                style={{
                  padding: "10px 14px",
                  borderRadius: "6px",
                  marginBottom: "4px",
                  cursor: "pointer",
                  background: expanded ? "rgba(255,255,255,0.04)" : DESIGN.card,
                  border: `1px solid ${expanded ? `${DESIGN.blue}33` : trade.status === "WIN" ? `${DESIGN.green}15` : Math.abs(trade.pl) > 500 ? `${DESIGN.red}20` : DESIGN.cardBorder}`,
                  transition: "all 0.15s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: DESIGN.bright }}>{trade.ticker}</span>
                    <span style={{ fontSize: "11px", color: DESIGN.muted }}>{trade.strategy}</span>
                    <span style={{ fontSize: "10px", color: DESIGN.muted }}>{trade.days}d</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, fontFamily: DESIGN.mono, color: trade.pl >= 0 ? DESIGN.green : DESIGN.red }}>
                      {formatSigned(trade.pl)}
                    </span>
                    <Pill color={trade.status === "WIN" ? DESIGN.green : DESIGN.red} background={trade.status === "WIN" ? `${DESIGN.green}18` : `${DESIGN.red}18`}>
                      {trade.status}
                    </Pill>
                  </div>
                </div>

                {expanded && (
                  <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${DESIGN.cardBorder}` }}>
                    <div style={{ fontSize: "12px", color: DESIGN.text, lineHeight: 1.6, marginBottom: "8px" }}>{trade.detail}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px", fontSize: "12px" }}>
                      <div>
                        <span style={{ color: DESIGN.muted }}>Risk:</span>{" "}
                        <span style={{ fontFamily: DESIGN.mono, color: DESIGN.text }}>{formatMoney(trade.risk)}</span>
                      </div>
                      <div>
                        <span style={{ color: DESIGN.muted }}>Return:</span>{" "}
                        <span style={{ fontFamily: DESIGN.mono, color: trade.ret >= 0 ? DESIGN.green : DESIGN.red }}>
                          {trade.ret >= 0 ? "+" : ""}
                          {trade.ret}%
                        </span>
                      </div>
                    </div>
                    {trade.good !== "Nothing." && trade.good !== "Absolutely nothing." && (
                      <div style={{ padding: "8px 10px", borderRadius: "5px", background: `${DESIGN.green}06`, border: `1px solid ${DESIGN.green}15`, fontSize: "11px", color: DESIGN.text, marginBottom: "6px", lineHeight: 1.4 }}>
                        <span style={{ color: DESIGN.green, fontWeight: 700 }}>What worked: </span>
                        {trade.good}
                      </div>
                    )}
                    <div
                      style={{
                        padding: "8px 10px",
                        borderRadius: "5px",
                        fontSize: "12px",
                        color: DESIGN.text,
                        lineHeight: 1.5,
                        background: trade.lesson.startsWith("✅")
                          ? `${DESIGN.green}08`
                          : trade.lesson.startsWith("⚠")
                            ? `${DESIGN.yellow}08`
                            : `${DESIGN.red}08`,
                        border: `1px solid ${trade.lesson.startsWith("✅") ? `${DESIGN.green}25` : trade.lesson.startsWith("⚠") ? `${DESIGN.yellow}25` : `${DESIGN.red}25`}`,
                      }}
                    >
                      {trade.lesson}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {section === "patterns" && (
        <div>
          <Section title="Hold Duration Analysis" icon="⏱" accent={DESIGN.blue}>
            {[
              { label: "1-day holds", net: 1718, detail: "Fast entries/exits produced most gains." },
              { label: "2–3 day holds", net: -1277, detail: "Mixed quality around earnings volatility." },
              { label: "6+ day holds", net: -5112, detail: "Long holds concentrated losses." },
            ].map((row) => (
              <div key={row.label} style={{ marginBottom: "8px" }}>
                <BarRow label={row.label} value={formatSigned(row.net)} pct={Math.abs(row.net)} color={row.net >= 0 ? DESIGN.green : DESIGN.red} maxPct={5500} />
                <div style={{ fontSize: "10px", color: DESIGN.muted, marginLeft: "8px" }}>{row.detail}</div>
              </div>
            ))}
          </Section>

          <Section title="Expired Worthless Bonfire" icon="🔥" accent={DESIGN.red}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "6px" }}>
              {closedTrades
                .filter((trade) => (trade.return_pct ?? 0) <= -99)
                .map((trade) => (
                  <Card key={trade.id} style={{ textAlign: "center", borderColor: `${DESIGN.red}20` }}>
                    <div style={{ fontWeight: 700, color: DESIGN.bright }}>{trade.ticker}</div>
                    <div style={{ fontFamily: DESIGN.mono, color: DESIGN.red, fontWeight: 700 }}>
                      {formatSigned(trade.realized_pl ?? 0)}
                    </div>
                    <div style={{ fontSize: "10px", color: DESIGN.muted }}>Expired worthless</div>
                  </Card>
                ))}
            </div>
          </Section>

          <Section title="Sizing + Impulsive Entry Patterns" icon="⚡" accent={DESIGN.yellow}>
            <Card style={{ marginBottom: "6px" }}>
              <div style={{ fontSize: "12px", color: DESIGN.text, lineHeight: 1.5 }}>
                Oversized entries correlate directly with your largest drawdowns. Multi-lot earnings bets and same-day additions consistently underperform.
              </div>
            </Card>
            <Card>
              <div style={{ fontSize: "12px", color: DESIGN.text, lineHeight: 1.5 }}>
                Enforce 24-hour lockout after entry and block adding to losers. Keep default size at 1 contract.
              </div>
            </Card>
          </Section>
        </div>
      )}

      {section === "sins" && (
        <div>
          {[
            { title: "Oversizing", cost: 4000, desc: "AMZN, GOOGL, COIN consumed outsized NAV in single events." },
            { title: "Averaging Into Losers", cost: 2000, desc: "Adding after adverse move amplified losses." },
            { title: "Holding to Zero", cost: 1100, desc: "Expired options burned recoverable premium." },
            { title: "Wrong Direction", cost: 5000, desc: "Bearish bias conflicted with tape and reduced edge." },
            { title: "No Exit Plan", cost: null, desc: "Winners had exits; losers drifted without predefined stops." },
          ].map((sin, index) => (
            <Card key={sin.title} style={{ marginBottom: "8px", borderColor: `${DESIGN.red}20`, background: `${DESIGN.red}04` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <div style={{ fontSize: "14px", fontWeight: 800, color: DESIGN.red }}>Sin #{index + 1}: {sin.title}</div>
                {sin.cost != null && <span style={{ fontFamily: DESIGN.mono, fontWeight: 700, color: DESIGN.red, fontSize: "14px" }}>~-{formatMoney(sin.cost)}</span>}
              </div>
              <div style={{ fontSize: "12px", color: DESIGN.text, lineHeight: 1.6 }}>{sin.desc}</div>
            </Card>
          ))}
        </div>
      )}

      {section === "rules" && (
        <div>
          <div style={{ fontSize: "12px", color: DESIGN.muted, marginBottom: "12px", lineHeight: 1.5 }}>
            Rules are loaded from the database and scored live against open positions.
          </div>
          {rules
            .sort((a, b) => a.rule_number - b.rule_number)
            .map((rule) => {
              const color =
                rule.severity === "critical"
                  ? DESIGN.red
                  : rule.severity === "high"
                    ? "#f97316"
                    : rule.severity === "medium"
                      ? DESIGN.yellow
                      : DESIGN.blue;

              return (
                <Card key={rule.id} style={{ marginBottom: "6px", borderColor: `${color}20`, background: `${color}06` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 800, color, fontFamily: DESIGN.mono }}>#{rule.rule_number}</span>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: DESIGN.bright }}>{rule.title}</span>
                    <Pill color={color} background={`${color}18`}>{rule.severity.toUpperCase()}</Pill>
                  </div>
                  <div style={{ fontSize: "12px", color: DESIGN.text, lineHeight: 1.6 }}>{rule.description}</div>
                </Card>
              );
            })}
        </div>
      )}

      {section === "identity" && (
        <div>
          <Section title="What You Are" icon="🎯" accent={DESIGN.green}>
            <Card style={{ borderColor: `${DESIGN.green}25`, marginBottom: "8px" }}>
              <div style={{ fontSize: "13px", color: DESIGN.text, lineHeight: 1.7 }}>
                A directional earnings trader with strongest edge in defined-risk bullish spreads and post-earnings neutral premium plays.
              </div>
            </Card>
          </Section>
          <Section title="What You Are NOT" icon="🚫" accent={DESIGN.red}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "6px" }}>
              {[
                "A bearish trader against regime",
                "A multi-lot concentration trader",
                "A hold-and-hope trader",
                "A no-plan discretionary chaser",
              ].map((text) => (
                <Card key={text} style={{ borderColor: `${DESIGN.red}20`, background: `${DESIGN.red}04` }}>
                  <div style={{ fontSize: "12px", color: DESIGN.text, lineHeight: 1.4 }}>{text}</div>
                </Card>
              ))}
            </div>
          </Section>
        </div>
      )}

      {section === "recovery" && (
        <div>
          <Section title="Where You Are" icon="📍" accent={DESIGN.red}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px", marginBottom: "8px" }}>
              <Stat label="Current NAV" value={formatMoney(account.end_nav)} color={DESIGN.red} />
              <Stat label="Margin Debt" value={formatMoney(Math.abs(account.cash_end))} color={DESIGN.red} sub={`${(Math.abs(account.cash_end) / account.end_nav * 100).toFixed(0)}% of NAV`} />
              <Stat label="To Breakeven" value={formatMoney(account.start_nav - account.end_nav)} color={DESIGN.yellow} sub="+125% needed" />
              <Stat label="Open Risk" value={formatMoney(openTrades.reduce((sum, trade) => sum + trade.max_risk, 0))} color={DESIGN.yellow} />
            </div>
          </Section>

          <Section title="3 Recovery Strategies" icon="🗺" accent={DESIGN.purple}>
            <Card style={{ borderColor: `${DESIGN.purple}25`, marginBottom: "10px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: DESIGN.purple, marginBottom: "10px" }}>
                📊 12-MONTH PROJECTION (dynamic)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                {[
                  { name: "🛡 Grinder", rate: "+4%", y1: grinderProjection, dd: "-5%" },
                  { name: "⚖️ Hybrid", rate: "+6%", y1: hybridProjection, dd: "-10%" },
                  { name: "🔥 Catalyst", rate: "+10%", y1: catalystProjection, dd: "-20%" },
                ].map((strategy) => (
                  <div key={strategy.name} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: DESIGN.bright, marginBottom: "6px" }}>{strategy.name}</div>
                    <div style={{ fontSize: "20px", fontWeight: 800, fontFamily: DESIGN.mono, color: DESIGN.green }}>{formatMoney(strategy.y1)}</div>
                    <div style={{ fontSize: "10px", color: DESIGN.muted }}>{strategy.rate}/month · Max DD: {strategy.dd}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card style={{ borderColor: "rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.03)" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: DESIGN.red, marginBottom: "10px" }}>🚨 THIS WEEK (Immediate)</div>
              {[
                "Close binary earnings trades morning-after; do not hold to expiry.",
                "Apply hard stop protocol on all underwater options.",
                "Reduce open risk below 5% NAV before adding trades.",
                "Journal every new trade before execution.",
                "Take a one-week reset after current earnings cycle.",
              ].map((action, index) => (
                <div key={action} style={{ display: "flex", gap: "10px", padding: "8px 0", borderBottom: index < 4 ? `1px solid ${DESIGN.cardBorder}` : "none" }}>
                  <span style={{ fontSize: "14px", fontWeight: 800, fontFamily: DESIGN.mono, color: DESIGN.red, minWidth: "20px" }}>{index + 1}</span>
                  <span style={{ fontSize: "12px", color: DESIGN.text, lineHeight: 1.5 }}>{action}</span>
                </div>
              ))}
            </Card>
          </Section>
        </div>
      )}
    </div>
  );
}
