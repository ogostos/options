import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildIbkrLiveModel } from "./ibkr-transform.ts";

function makeOpenTrade(overrides = {}) {
  return {
    id: 101,
    created_at: "2026-02-20T00:00:00.000Z",
    updated_at: "2026-02-20T00:00:00.000Z",
    ticker: "CRM",
    strategy: "Iron Condor",
    legs: "160P / 165P / 205C / 210C",
    direction: "Neutral",
    entry_date: "2026-02-20",
    exit_date: null,
    expiry_date: "2026-02-27",
    status: "OPEN",
    position_type: "option",
    cost_basis: 141.8,
    max_risk: 141.8,
    max_profit: 358.2,
    realized_pl: 0,
    unrealized_pl: 0,
    return_pct: null,
    commissions: 0,
    contracts: 1,
    catalyst: "None",
    notes: "",
    lesson: "",
    breakeven: 161.42,
    stop_loss: null,
    strike_long: null,
    strike_short: null,
    close_price_long: 1.36,
    close_price_short: 2.12,
    theta_per_day: null,
    urgency: 4,
    peak_window: "",
    hold_advice: "",
    exit_trigger: "",
    best_case: "",
    exit_conservative: "",
    exit_balanced: "",
    exit_aggressive: "",
    source: "import",
    ib_symbols: [
      "CRM 27FEB26 160 P",
      "CRM 27FEB26 165 P",
      "CRM 27FEB26 205 C",
      "CRM 27FEB26 210 C",
    ],
    ...overrides,
  };
}

function makeSnapshot(overrides = {}) {
  return {
    id: 1,
    created_at: "2026-02-28T08:00:00.000Z",
    account_id: "U18542108",
    source: "cpgw-local",
    fetched_at: "2026-02-28T08:00:00.000Z",
    summary: {
      NetLiquidation: "7744.43",
      TotalCashValue: "-1200.25",
    },
    positions: [
      {
        symbol: "CRM 260227P00160000",
        contract: "OPT CRM 260227P00160000",
        conid: 1,
        quantity: 1,
        market_price: 0.6,
        market_value: 60,
        average_cost: 134.55,
        unrealized_pl: -20,
        realized_pl: 0,
        currency: "USD",
        raw: {},
      },
      {
        symbol: "CRM 260227P00165000",
        contract: "OPT CRM 260227P00165000",
        conid: 2,
        quantity: -1,
        market_price: 1.2,
        market_value: -120,
        average_cost: 205.45,
        unrealized_pl: 30,
        realized_pl: 0,
        currency: "USD",
        raw: {},
      },
      {
        symbol: "CRM 260227C00205000",
        contract: "OPT CRM 260227C00205000",
        conid: 3,
        quantity: -1,
        market_price: 1.1,
        market_value: -110,
        average_cost: 205.45,
        unrealized_pl: 40,
        realized_pl: 0,
        currency: "USD",
        raw: {},
      },
      {
        symbol: "CRM 260227C00210000",
        contract: "OPT CRM 260227C00210000",
        conid: 4,
        quantity: 1,
        market_price: 0.5,
        market_value: 50,
        average_cost: 134.55,
        unrealized_pl: -10,
        realized_pl: 0,
        currency: "USD",
        raw: {},
      },
    ],
    trades: [],
    notes: [],
    ...overrides,
  };
}

describe("buildIbkrLiveModel", () => {
  it("uses baseline open trade economics when ib_symbols fully match", () => {
    const baseline = makeOpenTrade();
    const model = buildIbkrLiveModel(makeSnapshot(), {
      baselineOpenTrades: [baseline],
    });

    assert.equal(model.openPositions.length, 1);
    assert.equal(model.meta.matchedTrades, 1);
    assert.equal(model.meta.derivedTrades, 0);
    assert.equal(model.openPositions[0].strategy, "Iron Condor");
    assert.equal(model.openPositions[0].max_risk, 141.8);
    assert.equal(model.openPositions[0].max_profit, 358.2);
    assert.equal(model.openPositions[0].cost_basis, 141.8);
    assert.equal(model.openPositions[0].close_price_long, 1.36);
    assert.equal(model.openPositions[0].close_price_short, 2.12);
  });

  it("derives fallback positions from unmatched legs without inflated values", () => {
    const model = buildIbkrLiveModel(makeSnapshot(), {
      baselineOpenTrades: [],
    });
    assert.equal(model.openPositions.length, 1);
    const derived = model.openPositions[0];
    assert.equal(model.meta.matchedTrades, 0);
    assert.equal(model.meta.derivedTrades, 1);
    assert.ok(derived.max_risk >= 0);
    assert.ok(derived.max_risk < 5000);
    assert.ok(derived.max_profit == null || derived.max_profit < 5000);
  });

  it("maps summary keys and values robustly for account metrics", () => {
    const model = buildIbkrLiveModel(
      makeSnapshot({
        summary: {
          "Net Liquidation": { value: "8000.50" },
          total_cash_value: "-250.75",
          buying_power: "12000",
          MAINT_MARGIN_REQ: "900.25",
          ExcessLiquidity: "2300.20",
        },
      }),
      { baselineOpenTrades: [makeOpenTrade()] },
    );

    assert.equal(model.accountSummary.netLiq, 8000.5);
    assert.equal(model.accountSummary.cash, -250.75);
    assert.equal(model.accountSummary.marginDebt, 250.75);
    assert.equal(model.accountSummary.buyingPower, 12000);
    assert.equal(model.accountSummary.maintenanceMargin, 900.25);
    assert.equal(model.accountSummary.excessLiquidity, 2300.2);
  });
});
