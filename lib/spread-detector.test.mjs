import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectSpreadFromLegs } from "./spread-detector.ts";

describe("detectSpreadFromLegs", () => {
  it("detects bull call spread", () => {
    const result = detectSpreadFromLegs([
      { ticker: "CEG", expiry: "2026-04-17", strike: 290, optionType: "C", side: "BUY", quantity: 1 },
      { ticker: "CEG", expiry: "2026-04-17", strike: 320, optionType: "C", side: "SELL", quantity: 1 },
    ]);
    assert.equal(result.strategy, "Bull Call Spread");
    assert.equal(result.direction, "Bullish");
  });

  it("detects iron condor", () => {
    const result = detectSpreadFromLegs([
      { ticker: "CRM", expiry: "2026-02-27", strike: 160, optionType: "P", side: "BUY", quantity: 1 },
      { ticker: "CRM", expiry: "2026-02-27", strike: 165, optionType: "P", side: "SELL", quantity: 1 },
      { ticker: "CRM", expiry: "2026-02-27", strike: 205, optionType: "C", side: "SELL", quantity: 1 },
      { ticker: "CRM", expiry: "2026-02-27", strike: 210, optionType: "C", side: "BUY", quantity: 1 },
    ]);
    assert.equal(result.strategy, "Iron Condor");
    assert.equal(result.direction, "Neutral");
  });

  it("detects iron butterfly", () => {
    const result = detectSpreadFromLegs([
      { ticker: "SPY", expiry: "2026-03-20", strike: 570, optionType: "P", side: "BUY", quantity: 1 },
      { ticker: "SPY", expiry: "2026-03-20", strike: 575, optionType: "P", side: "SELL", quantity: 1 },
      { ticker: "SPY", expiry: "2026-03-20", strike: 575, optionType: "C", side: "SELL", quantity: 1 },
      { ticker: "SPY", expiry: "2026-03-20", strike: 580, optionType: "C", side: "BUY", quantity: 1 },
    ]);
    assert.equal(result.strategy, "Iron Butterfly");
    assert.equal(result.direction, "Neutral");
  });

  it("detects call butterfly", () => {
    const result = detectSpreadFromLegs([
      { ticker: "AAPL", expiry: "2026-06-19", strike: 190, optionType: "C", side: "BUY", quantity: 1 },
      { ticker: "AAPL", expiry: "2026-06-19", strike: 200, optionType: "C", side: "SELL", quantity: 2 },
      { ticker: "AAPL", expiry: "2026-06-19", strike: 210, optionType: "C", side: "BUY", quantity: 1 },
    ]);
    assert.equal(result.strategy, "Call Butterfly");
    assert.equal(result.direction, "Neutral");
  });

  it("detects diagonal", () => {
    const result = detectSpreadFromLegs([
      { ticker: "HOOD", expiry: "2026-03-27", strike: 85, optionType: "C", side: "BUY", quantity: 1 },
      { ticker: "HOOD", expiry: "2026-02-27", strike: 95, optionType: "C", side: "SELL", quantity: 1 },
    ]);
    assert.equal(result.strategy, "Diagonal");
  });

  it("detects calendar", () => {
    const result = detectSpreadFromLegs([
      { ticker: "MSFT", expiry: "2026-03-20", strike: 450, optionType: "C", side: "BUY", quantity: 1 },
      { ticker: "MSFT", expiry: "2026-02-20", strike: 450, optionType: "C", side: "SELL", quantity: 1 },
    ]);
    assert.equal(result.strategy, "Calendar");
  });
});
