import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildIbkrLiveModel } from "./ibkr-transform.ts";

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
  it("derives positions from IBKR option legs without inflated values", () => {
    const model = buildIbkrLiveModel(makeSnapshot());
    assert.equal(model.openPositions.length, 1);
    const derived = model.openPositions[0];
    assert.equal(model.meta.matchedTrades, 0);
    assert.equal(model.meta.derivedTrades, 1);
    assert.equal(derived.strategy, "Iron Condor");
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
          availablefunds: { amount: 1450.25, value: null },
          MAINT_MARGIN_REQ: "900.25",
          initmarginreq: { amount: 920.5, value: null },
          ExcessLiquidity: "2300.20",
          grosspositionvalue: { amount: 24071.03, value: null },
          leverage: { amount: 0, value: "2.92" },
          cushion: { amount: 0, value: "0.190969" },
        },
      }),
    );

    assert.equal(model.accountSummary.netLiq, 8000.5);
    assert.equal(model.accountSummary.cash, -250.75);
    assert.equal(model.accountSummary.marginDebt, 250.75);
    assert.equal(model.accountSummary.buyingPower, 12000);
    assert.equal(model.accountSummary.availableFunds, 1450.25);
    assert.equal(model.accountSummary.initMarginReq, 920.5);
    assert.equal(model.accountSummary.maintenanceMargin, 900.25);
    assert.equal(model.accountSummary.excessLiquidity, 2300.2);
    assert.equal(model.accountSummary.grossPositionValue, 24071.03);
    assert.equal(model.accountSummary.leverage, 2.92);
    assert.equal(model.accountSummary.cushion, 0.190969);
  });
});
