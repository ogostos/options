import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { scoreOpenPositions } from "./scoring.ts";

function makeAccount(overrides = {}) {
  return {
    id: 1,
    created_at: "2026-02-22T00:00:00.000Z",
    period_start: "2026-01-01",
    period_end: "2026-02-22",
    start_nav: 10000,
    end_nav: 10000,
    twr: 0,
    cash_start: 0,
    cash_end: 0,
    cash_settled: 0,
    stock_long: 0,
    stock_short: 0,
    stock_total: 0,
    options_long: 0,
    options_short: 0,
    options_total: 0,
    interest_accrued: 0,
    interest_rate_est: 0,
    commissions_total: 0,
    margin_debt: 0,
    mtm: 0,
    trades_sales: 0,
    trades_purchase: 0,
    ...overrides,
  };
}

function makeTrade(overrides = {}) {
  return {
    id: 1,
    created_at: "2026-02-22T00:00:00.000Z",
    updated_at: "2026-02-22T00:00:00.000Z",
    ticker: "NVDA",
    strategy: "Bull Call Spread",
    legs: "130C/140C",
    direction: "Bullish",
    entry_date: "2026-02-20",
    exit_date: null,
    expiry_date: "2026-03-20",
    status: "OPEN",
    position_type: "option",
    cost_basis: 120,
    max_risk: 120,
    max_profit: 880,
    realized_pl: null,
    unrealized_pl: -999,
    return_pct: null,
    commissions: 2,
    contracts: 1,
    catalyst: "None",
    notes: "",
    lesson: "",
    breakeven: 131.2,
    stop_loss: 124,
    strike_long: 130,
    strike_short: 140,
    close_price_long: null,
    close_price_short: null,
    theta_per_day: -8,
    urgency: 2,
    peak_window: "",
    hold_advice: "",
    exit_trigger: "Close if long strike breaks",
    best_case: "",
    exit_conservative: "",
    exit_balanced: "",
    exit_aggressive: "",
    source: "manual",
    ib_symbols: ["NVDA 20MAR26 130 C", "NVDA 20MAR26 140 C"],
    ...overrides,
  };
}

function makeRules(overrides = {}) {
  const base = [
    { id: 1, rule_number: 1, title: "2% Wall", description: "", severity: "critical", enabled: true },
    { id: 2, rule_number: 2, title: "50% Stop", description: "", severity: "critical", enabled: true },
    { id: 3, rule_number: 3, title: "Not Banned", description: "", severity: "critical", enabled: true },
    { id: 4, rule_number: 4, title: "Approved Strategy", description: "", severity: "high", enabled: true },
    { id: 5, rule_number: 5, title: "24hr Lockout", description: "", severity: "high", enabled: true },
    { id: 6, rule_number: 6, title: "Weekly Risk Budget", description: "", severity: "high", enabled: true },
    { id: 7, rule_number: 7, title: "Direction Match", description: "", severity: "medium", enabled: true },
    { id: 8, rule_number: 8, title: "Pre-Trade Checklist", description: "", severity: "medium", enabled: true },
    { id: 9, rule_number: 9, title: "Win Protocol", description: "", severity: "info", enabled: true },
    { id: 10, rule_number: 10, title: "Journal", description: "", severity: "info", enabled: true },
  ];

  return base.map((rule) => {
    if (rule.rule_number === overrides.rule_number) {
      return { ...rule, ...overrides };
    }
    return rule;
  });
}

function makeJournal(overrides = {}) {
  return {
    id: 1,
    trade_id: 1,
    created_at: "2026-02-22T00:00:00.000Z",
    type: "pre_trade",
    thesis: "test",
    emotional_state: "calm",
    plan_adherence_score: 4,
    notes: "",
    ...overrides,
  };
}

describe("scoreOpenPositions", () => {
  it("excludes rule #9 from active per-position scoring", () => {
    const openTrade = makeTrade({ unrealized_pl: -5000 });
    const result = scoreOpenPositions({
      openTrades: [openTrade],
      allTrades: [openTrade],
      account: makeAccount(),
      journals: [makeJournal({ trade_id: openTrade.id })],
      rules: makeRules(),
    });

    const checks = result.perPosition[0].checks.map((check) => check.ruleNumber);
    assert.deepEqual(checks, [1, 2, 3, 4, 5, 7, 10]);
    assert.equal(checks.includes(9), false);
  });

  it("honors DB enabled flag for supported rules", () => {
    const openTrade = makeTrade({ exit_trigger: "" });
    const result = scoreOpenPositions({
      openTrades: [openTrade],
      allTrades: [openTrade],
      account: makeAccount(),
      journals: [makeJournal({ trade_id: openTrade.id })],
      rules: makeRules({ rule_number: 2, enabled: false }),
    });

    const check2 = result.perPosition[0].checks.find((check) => check.ruleNumber === 2);
    assert.ok(check2);
    assert.equal(check2.pass, true);
    assert.equal(check2.detail, "Rule disabled");
  });

  it("computes portfolio-level checks deterministically", () => {
    const tradeA = makeTrade({ id: 1, max_risk: 300, catalyst: "Earnings", ticker: "CEG" });
    const tradeB = makeTrade({
      id: 2,
      max_risk: 300,
      catalyst: "Earnings",
      ticker: "NVDA",
      ib_symbols: ["NVDA 20MAR26 130 C"],
    });

    const result = scoreOpenPositions({
      openTrades: [tradeA, tradeB],
      allTrades: [tradeA, tradeB],
      account: makeAccount({ end_nav: 10000 }),
      journals: [makeJournal({ trade_id: 1 }), makeJournal({ id: 2, trade_id: 2 })],
      rules: makeRules(),
    });

    assert.equal(result.portfolio.totalRiskAmount, 600);
    assert.ok(Math.abs(result.portfolio.totalRiskPct - 6) < 1e-9);
    assert.equal(result.portfolio.totalRiskBudgetPass, false);
    assert.equal(result.portfolio.positionCount, 2);
    assert.equal(result.portfolio.positionCountPass, true);
    assert.equal(result.portfolio.earningsCount, 2);
    assert.equal(result.portfolio.earningsConcentrationPass, false);
  });
});
