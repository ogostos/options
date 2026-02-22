import { Card, Pill } from "@/components/ui/primitives";
import { computeDTE, DESIGN, formatMoney } from "@/lib/design";
import { SCORING_EXCLUDED_RULES } from "@/lib/scoring";
import type { PortfolioRuleChecks, RuleCheckResult, Trade } from "@/lib/types";

function byId(openTrades: Trade[]) {
  return new Map(openTrades.map((trade) => [trade.id, trade]));
}

export function RuleCheck({
  openTrades,
  results,
  portfolio,
  overallScore,
  nav,
}: {
  openTrades: Trade[];
  results: RuleCheckResult[];
  portfolio: PortfolioRuleChecks;
  overallScore: number;
  nav: number;
}) {
  const openById = byId(openTrades);

  const portfolioChecks = [
    {
      rule: "#6 Weekly Risk Budget (max 5% NAV)",
      pass: portfolio.totalRiskBudgetPass,
      value: `${formatMoney(portfolio.totalRiskAmount)} at risk = ${portfolio.totalRiskPct.toFixed(1)}% of NAV`,
      detail: portfolio.totalRiskBudgetPass
        ? "Within budget"
        : `${(portfolio.totalRiskPct / 5).toFixed(1)}x over limit. Max allowed: ${formatMoney(nav * 0.05)}`,
    },
    {
      rule: "Position Count (max 3 open positions)",
      pass: portfolio.positionCountPass,
      value: `${portfolio.positionCount} positions open`,
      detail: portfolio.positionCountPass
        ? "Within limit"
        : `${portfolio.positionCount - 3} positions over limit. Close weakest before opening new.`,
    },
    {
      rule: "Earnings Concentration",
      pass: portfolio.earningsConcentrationPass,
      value: `${portfolio.earningsCount} earnings plays active`,
      detail: portfolio.earningsConcentrationPass
        ? "Acceptable"
        : `${portfolio.earningsCount} binary bets running simultaneously.`,
    },
  ];

  return (
    <div>
      <div style={{ fontSize: "12px", color: DESIGN.muted, marginBottom: "12px", lineHeight: 1.5 }}>
        Each open position is scored against your discipline rules. Red = violation, green = compliant.
      </div>
      {SCORING_EXCLUDED_RULES.length > 0 && (
        <Card style={{ marginBottom: "10px", borderColor: `${DESIGN.yellow}25`, background: `${DESIGN.yellow}06` }}>
          <div style={{ fontSize: "10px", color: DESIGN.yellow, fontWeight: 700, marginBottom: "4px", textTransform: "uppercase" }}>
            Excluded From Scoring
          </div>
          <div style={{ display: "grid", gap: "4px" }}>
            {SCORING_EXCLUDED_RULES.map((rule) => (
              <div key={rule.ruleNumber} style={{ fontSize: "11px", color: DESIGN.text, lineHeight: 1.4 }}>
                #{rule.ruleNumber} {rule.title}: <span style={{ color: DESIGN.muted }}>{rule.reason}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card
        style={{
          marginBottom: "14px",
          borderColor: portfolioChecks.some((check) => !check.pass)
            ? "rgba(239,68,68,0.25)"
            : "rgba(74,222,128,0.25)",
        }}
      >
        <div style={{ fontSize: "13px", fontWeight: 700, color: DESIGN.purple, marginBottom: "10px" }}>
          📋 PORTFOLIO-LEVEL CHECKS
        </div>
        {portfolioChecks.map((check) => (
          <div
            key={check.rule}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 0",
              borderBottom: `1px solid ${DESIGN.cardBorder}`,
            }}
          >
            <div>
              <div style={{ fontSize: "12px", color: DESIGN.text, fontWeight: 600 }}>{check.rule}</div>
              <div style={{ fontSize: "11px", color: DESIGN.muted }}>{check.detail}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "11px", fontFamily: DESIGN.mono, fontWeight: 600, color: check.pass ? DESIGN.green : DESIGN.red }}>
                {check.value}
              </span>
              <span style={{ fontSize: "16px" }}>{check.pass ? "✅" : "❌"}</span>
            </div>
          </div>
        ))}
      </Card>

      {results.map((result) => {
        const position = openById.get(result.tradeId);
        const dte = computeDTE(position?.expiry_date);
        const urgency = position?.urgency ?? 1;
        const scoreColor =
          result.criticalViolations > 0
            ? DESIGN.red
            : result.score >= 80
              ? DESIGN.green
              : result.score >= 60
                ? DESIGN.yellow
                : DESIGN.red;

        return (
          <Card key={result.tradeId} style={{ marginBottom: "8px", borderColor: `${scoreColor}25` }}>
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "16px", fontWeight: 700, color: DESIGN.bright }}>{result.ticker}</span>
                <span style={{ fontSize: "11px", color: DESIGN.muted }}>{position?.strategy}</span>
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
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ fontSize: "24px", fontWeight: 800, fontFamily: DESIGN.mono, color: scoreColor }}>
                  {result.score}
                </div>
                <div style={{ fontSize: "10px", color: DESIGN.muted, lineHeight: 1.2 }}>
                  <div>/100</div>
                  <div>{result.checks.filter((check) => check.pass).length}/{result.checks.length}</div>
                </div>
              </div>
            </div>

            <div
              style={{
                height: "4px",
                background: "rgba(255,255,255,0.04)",
                borderRadius: "2px",
                marginBottom: "10px",
                overflow: "hidden",
              }}
            >
              <div style={{ width: `${result.score}%`, height: "100%", borderRadius: "2px", background: scoreColor }} />
            </div>

            <div style={{ display: "grid", gap: "4px" }}>
              {result.checks.map((check) => (
                <div
                  key={`${result.tradeId}-${check.ruleNumber}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "5px 8px",
                    borderRadius: "4px",
                    background: check.pass ? "rgba(74,222,128,0.03)" : "rgba(239,68,68,0.05)",
                    border: `1px solid ${check.pass ? "rgba(74,222,128,0.08)" : "rgba(239,68,68,0.12)"}`,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: check.pass ? DESIGN.green : DESIGN.red,
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      {check.pass ? "✅" : "❌"} #{check.ruleNumber} · {check.title}
                      {check.severity === "critical" && !check.pass && (
                        <Pill color={DESIGN.red} background={`${DESIGN.red}25`}>
                          CRITICAL
                        </Pill>
                      )}
                    </div>
                    <div style={{ fontSize: "10px", color: DESIGN.muted, marginTop: "2px" }}>{check.detail}</div>
                  </div>
                </div>
              ))}
            </div>

            {result.criticalViolations > 0 && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "8px 10px",
                  borderRadius: "5px",
                  background: `${DESIGN.red}08`,
                  border: `1px solid ${DESIGN.red}20`,
                  fontSize: "12px",
                  color: DESIGN.text,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: DESIGN.red, fontWeight: 700 }}>
                  ⚠ {result.criticalViolations} critical violation{result.criticalViolations > 1 ? "s" : ""}.
                </span>
              </div>
            )}
          </Card>
        );
      })}

      <Card
        style={{
          marginTop: "12px",
          borderColor: overallScore >= 70 ? `${DESIGN.green}25` : `${DESIGN.yellow}25`,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase", marginBottom: "4px" }}>
          Portfolio Discipline Score
        </div>
        <div
          style={{
            fontSize: "32px",
            fontWeight: 800,
            fontFamily: DESIGN.mono,
            color: overallScore >= 80 ? DESIGN.green : overallScore >= 60 ? DESIGN.yellow : DESIGN.red,
          }}
        >
          {overallScore}
        </div>
        <div style={{ fontSize: "11px", color: DESIGN.muted }}>
          {overallScore >= 80
            ? "Good discipline - execute the plan"
            : overallScore >= 60
              ? "Moderate - fix critical violations before next trade"
              : "Poor - reduce positions until rules are met"}
        </div>
      </Card>
    </div>
  );
}
