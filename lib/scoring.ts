import type {
  AccountSnapshot,
  JournalEntry,
  PortfolioRuleChecks,
  Rule,
  RuleCheckResult,
  Trade,
} from "@/lib/types";

function pct(value: number, base: number): number {
  if (!base) return 0;
  return (value / base) * 100;
}

function toDetails(openTrade: Trade, allTrades: Trade[], account: AccountSnapshot, journals: JournalEntry[]) {
  const sameDayOpenCount = allTrades.filter(
    (trade) => trade.id !== openTrade.id && trade.entry_date === openTrade.entry_date,
  ).length;

  const hasJournal = journals.some((entry) => entry.trade_id === openTrade.id);
  const currentNav = account.end_nav;

  const checks: RuleCheckResult["checks"] = [
    {
      ruleNumber: 1,
      title: "2% Wall",
      severity: "critical",
      pass: pct(openTrade.max_risk, currentNav) <= 2,
      detail: `${openTrade.max_risk.toFixed(2)} risk = ${pct(openTrade.max_risk, currentNav).toFixed(2)}% NAV`,
    },
    {
      ruleNumber: 2,
      title: "50% Stop",
      severity: "critical",
      pass: (openTrade.exit_trigger || "").trim().length > 0,
      detail:
        (openTrade.exit_trigger || "").trim().length > 0
          ? "Exit trigger present"
          : "Missing explicit exit trigger",
    },
    {
      ruleNumber: 3,
      title: "Not Banned",
      severity: "critical",
      pass: openTrade.direction !== "Bearish" && openTrade.contracts <= 1,
      detail:
        openTrade.direction === "Bearish"
          ? "Bearish direction is blocked"
          : openTrade.contracts > 1
            ? `Contracts ${openTrade.contracts} exceeds max 1`
            : "Direction and sizing pass",
    },
    {
      ruleNumber: 4,
      title: "Approved Strategy",
      severity: "high",
      pass:
        ["Bull Call Spread", "Iron Condor"].includes(openTrade.strategy) ||
        openTrade.max_risk < currentNav * 0.01,
      detail:
        ["Bull Call Spread", "Iron Condor"].includes(openTrade.strategy)
          ? `${openTrade.strategy} is approved`
          : openTrade.max_risk < currentNav * 0.01
            ? "Small-risk exception (<1% NAV)"
            : "Strategy not approved and risk too large",
    },
    {
      ruleNumber: 5,
      title: "24hr Lockout",
      severity: "high",
      pass: sameDayOpenCount === 0,
      detail:
        sameDayOpenCount === 0
          ? "No same-day additional entries"
          : `${sameDayOpenCount} other trades opened same day`,
    },
    {
      ruleNumber: 7,
      title: "Direction Match",
      severity: "medium",
      pass: openTrade.direction !== "Bearish",
      detail:
        openTrade.direction !== "Bearish"
          ? "Direction aligned"
          : "Bearish direction violates profile",
    },
    {
      ruleNumber: 9,
      title: "Win Protocol",
      severity: "info",
      pass: (openTrade.unrealized_pl ?? 0) > openTrade.max_risk * 0.3,
      detail:
        (openTrade.unrealized_pl ?? 0) > openTrade.max_risk * 0.3
          ? "At/above +30% trigger"
          : "Not yet at +30% trigger",
    },
    {
      ruleNumber: 10,
      title: "Journal",
      severity: "info",
      pass: hasJournal,
      detail: hasJournal ? "Journal entry exists" : "No journal entry found",
    },
  ];

  return checks;
}

export function scoreOpenPositions(params: {
  openTrades: Trade[];
  allTrades: Trade[];
  account: AccountSnapshot;
  journals: JournalEntry[];
  rules: Rule[];
}): {
  perPosition: RuleCheckResult[];
  portfolio: PortfolioRuleChecks;
  overallScore: number;
} {
  const { openTrades, allTrades, account, journals, rules } = params;
  const ruleMap = new Map(rules.map((rule) => [rule.rule_number, rule] as const));

  const perPosition = openTrades.map((trade) => {
    const baseChecks = toDetails(trade, allTrades, account, journals);
    const checks = baseChecks.map((check) => {
      const rule = ruleMap.get(check.ruleNumber);
      if (!rule) return check;

      if (!rule.enabled) {
        return {
          ...check,
          title: rule.title,
          severity: rule.severity,
          pass: true,
          detail: "Rule disabled",
        };
      }

      return {
        ...check,
        title: rule.title,
        severity: rule.severity,
      };
    });
    const passCount = checks.filter((check) => check.pass).length;
    const score = Math.round((passCount / checks.length) * 100);
    const criticalViolations = checks.filter(
      (check) => !check.pass && check.severity === "critical",
    ).length;

    return {
      tradeId: trade.id,
      ticker: trade.ticker,
      score,
      criticalViolations,
      checks,
    };
  });

  const totalRiskAmount = openTrades.reduce((sum, trade) => sum + trade.max_risk, 0);
  const totalRiskPct = pct(totalRiskAmount, account.end_nav);
  const positionCount = openTrades.length;
  const earningsCount = openTrades.filter((trade) => trade.catalyst === "Earnings").length;

  const portfolio: PortfolioRuleChecks = {
    totalRiskBudgetPass: totalRiskPct <= 5,
    totalRiskPct,
    totalRiskAmount,
    positionCountPass: positionCount <= 3,
    positionCount,
    earningsConcentrationPass: earningsCount <= 1,
    earningsCount,
  };

  const overallScore =
    perPosition.length > 0
      ? Math.round(perPosition.reduce((sum, row) => sum + row.score, 0) / perPosition.length)
      : 100;

  return {
    perPosition,
    portfolio,
    overallScore,
  };
}
