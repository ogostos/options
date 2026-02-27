import { computeDTE } from "@/lib/design";
import { classifyIronCondorPriceZone, getIronCondorZone } from "@/lib/options-zones";
import type { Trade } from "@/lib/types";

export interface OptionQuote {
  mark: number;
  bid: number | null;
  ask: number | null;
  last: number | null;
  source: string;
  updatedAt: string;
}

export type OptionQuoteMap = Record<string, OptionQuote>;

interface ParsedLegSymbol {
  symbol: string;
  ticker: string;
  expiry: string;
  strike: number;
  optionType: "C" | "P";
}

export interface PositionLegLive {
  symbol: string;
  strike: number;
  optionType: "C" | "P";
  expiry: string;
  side: "LONG" | "SHORT";
  mark: number | null;
  source: string | null;
  updatedAt: string | null;
}

export interface LiveOptionSnapshot {
  legs: PositionLegLive[];
  hasAllQuotes: boolean;
  markValue: number | null;
  livePnl: number | null;
  profitCapturePct: number | null;
  riskConsumedPct: number | null;
}

export interface RiskSnapshot {
  level: number;
  label: string;
  color: string;
  detail: string;
}

const MONTHS: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

function parseDateCode(code: string): string | null {
  const match = code.match(/^(\d{2})([A-Z]{3})(\d{2})$/);
  if (!match) return null;
  const [, dd, mon, yy] = match;
  const mm = MONTHS[mon];
  if (!mm) return null;
  return `20${yy}-${mm}-${dd}`;
}

function parseIBSymbol(symbol: string): ParsedLegSymbol | null {
  const normalized = symbol.trim().toUpperCase();
  const match = normalized.match(/^([A-Z.]+)\s+(\d{2}[A-Z]{3}\d{2})\s+(\d+(?:\.\d+)?)\s+([CP])$/);
  if (!match) return null;
  const [, ticker, dateCode, strikeRaw, optionType] = match;
  const expiry = parseDateCode(dateCode);
  const strike = Number(strikeRaw);
  if (!expiry || !Number.isFinite(strike)) return null;
  return {
    symbol: normalized,
    ticker,
    expiry,
    strike,
    optionType: optionType as "C" | "P",
  };
}

function strategyCredit(strategy: string): boolean {
  return strategy === "Bull Put Spread" || strategy === "Bear Call Spread" || strategy === "Iron Condor";
}

function inferSides(strategy: string, parsed: ParsedLegSymbol[]): Map<string, "LONG" | "SHORT"> {
  const sideBySymbol = new Map<string, "LONG" | "SHORT">();

  const calls = parsed.filter((leg) => leg.optionType === "C").sort((a, b) => a.strike - b.strike);
  const puts = parsed.filter((leg) => leg.optionType === "P").sort((a, b) => a.strike - b.strike);

  if (strategy === "Bull Call Spread" && calls.length >= 2) {
    sideBySymbol.set(calls[0].symbol, "LONG");
    sideBySymbol.set(calls[calls.length - 1].symbol, "SHORT");
    return sideBySymbol;
  }

  if (strategy === "Bear Call Spread" && calls.length >= 2) {
    sideBySymbol.set(calls[0].symbol, "SHORT");
    sideBySymbol.set(calls[calls.length - 1].symbol, "LONG");
    return sideBySymbol;
  }

  if (strategy === "Bull Put Spread" && puts.length >= 2) {
    sideBySymbol.set(puts[0].symbol, "LONG");
    sideBySymbol.set(puts[puts.length - 1].symbol, "SHORT");
    return sideBySymbol;
  }

  if (strategy === "Bear Put Spread" && puts.length >= 2) {
    sideBySymbol.set(puts[0].symbol, "SHORT");
    sideBySymbol.set(puts[puts.length - 1].symbol, "LONG");
    return sideBySymbol;
  }

  if (strategy === "Iron Condor" && puts.length >= 2 && calls.length >= 2) {
    sideBySymbol.set(puts[0].symbol, "LONG");
    sideBySymbol.set(puts[puts.length - 1].symbol, "SHORT");
    sideBySymbol.set(calls[0].symbol, "SHORT");
    sideBySymbol.set(calls[calls.length - 1].symbol, "LONG");
    return sideBySymbol;
  }

  if (strategy === "Diagonal") {
    const sortedByExpiry = [...parsed].sort((a, b) =>
      `${a.expiry}|${a.strike}`.localeCompare(`${b.expiry}|${b.strike}`),
    );
    if (sortedByExpiry.length >= 2) {
      const near = sortedByExpiry[0];
      const far = sortedByExpiry[sortedByExpiry.length - 1];
      sideBySymbol.set(near.symbol, "SHORT");
      sideBySymbol.set(far.symbol, "LONG");
      return sideBySymbol;
    }
  }

  if (strategy.startsWith("Long")) {
    for (const leg of parsed) {
      sideBySymbol.set(leg.symbol, "LONG");
    }
    return sideBySymbol;
  }

  // Fallback: treat first half as long, second half as short only for 2+ legs.
  const ordered = [...parsed].sort((a, b) => a.strike - b.strike);
  if (ordered.length === 1) {
    sideBySymbol.set(ordered[0].symbol, "LONG");
    return sideBySymbol;
  }

  for (let i = 0; i < ordered.length; i += 1) {
    sideBySymbol.set(ordered[i].symbol, i < Math.ceil(ordered.length / 2) ? "LONG" : "SHORT");
  }
  return sideBySymbol;
}

function estimateEntryCashflow(position: Trade): number {
  if (strategyCredit(position.strategy)) {
    if (position.max_profit != null && Number.isFinite(position.max_profit)) {
      return position.max_profit;
    }
    return position.cost_basis;
  }
  return -position.cost_basis;
}

function estimateEntryCashflowFromLegPrices(
  position: Trade,
  legs: Array<{ side: "LONG" | "SHORT" }>,
): number | null {
  if (legs.length === 0) return null;
  const longEntry = position.close_price_long;
  const shortEntry = position.close_price_short;
  if (longEntry == null && shortEntry == null) return null;

  const contracts = Math.max(position.contracts || 1, 1);
  let cashflow = 0;
  for (const leg of legs) {
    if (leg.side === "LONG") {
      if (longEntry == null) return null;
      cashflow += -longEntry * 100 * contracts;
    } else {
      if (shortEntry == null) return null;
      cashflow += shortEntry * 100 * contracts;
    }
  }

  return Number(cashflow.toFixed(2));
}

export function buildLiveOptionSnapshot(position: Trade, optionQuotes: OptionQuoteMap): LiveOptionSnapshot {
  const parsed = position.ib_symbols
    .map((symbol) => parseIBSymbol(symbol))
    .filter((value): value is ParsedLegSymbol => Boolean(value));

  if (parsed.length === 0) {
    return {
      legs: [],
      hasAllQuotes: false,
      markValue: null,
      livePnl: null,
      profitCapturePct: null,
      riskConsumedPct: null,
    };
  }

  const sideBySymbol = inferSides(position.strategy, parsed);
  const contracts = Math.max(position.contracts || 1, 1);

  let hasAllQuotes = true;
  let markValue = 0;

  const legs: PositionLegLive[] = parsed.map((leg) => {
    const side = sideBySymbol.get(leg.symbol) ?? "LONG";
    const quote = optionQuotes[leg.symbol];
    const mark = quote?.mark ?? null;
    if (mark == null || !Number.isFinite(mark)) {
      hasAllQuotes = false;
    } else {
      const mult = side === "LONG" ? 1 : -1;
      markValue += mult * mark * 100 * contracts;
    }

    return {
      symbol: leg.symbol,
      strike: leg.strike,
      optionType: leg.optionType,
      expiry: leg.expiry,
      side,
      mark,
      source: quote?.source ?? null,
      updatedAt: quote?.updatedAt ?? null,
    };
  });

  if (!hasAllQuotes) {
    return {
      legs,
      hasAllQuotes: false,
      markValue: null,
      livePnl: null,
      profitCapturePct: null,
      riskConsumedPct: null,
    };
  }

  const entryCashflow =
    estimateEntryCashflowFromLegPrices(position, legs) ?? estimateEntryCashflow(position);
  const livePnl = Number((markValue + entryCashflow).toFixed(2));

  const profitCapturePct =
    livePnl > 0 && position.max_profit != null && position.max_profit > 0
      ? Number(((livePnl / position.max_profit) * 100).toFixed(1))
      : null;
  const riskConsumedPct =
    livePnl < 0 && position.max_risk > 0
      ? Number(((Math.abs(livePnl) / position.max_risk) * 100).toFixed(1))
      : null;

  return {
    legs,
    hasAllQuotes: true,
    markValue: Number(markValue.toFixed(2)),
    livePnl,
    profitCapturePct,
    riskConsumedPct,
  };
}

export function getRiskSnapshot(position: Trade, price: number | null): RiskSnapshot {
  if (!price || !position.expiry_date) {
    return {
      level: 3,
      label: "—",
      color: "#64748b",
      detail: "Risk status needs current underlying price and expiry data.",
    };
  }

  const condor = getIronCondorZone({
    strategy: position.strategy,
    legs: position.legs,
    breakeven: position.breakeven,
    maxProfit: position.max_profit,
    contracts: position.contracts,
  });

  if (condor) {
    const dte = computeDTE(position.expiry_date);
    const zone = classifyIronCondorPriceZone(price, condor);
    if (zone === "max_profit_core") {
      return {
        level: 1,
        label: "SAFE",
        color: "#4ade80",
        detail: "Price is inside the max-profit core between short strikes.",
      };
    }
    if (zone === "profit_low" || zone === "profit_high") {
      return {
        level: dte > 3 ? 1 : 2,
        label: "SAFE",
        color: "#4ade80",
        detail: "Price is inside breakeven range but outside max-profit core.",
      };
    }
    if (zone === "recover_low" || zone === "recover_high") {
      return {
        level: dte > 5 ? 3 : 4,
        label: dte > 5 ? "CAUTION" : "AT RISK",
        color: dte > 5 ? "#fbbf24" : "#f97316",
        detail: "Price is outside breakeven and needs recovery to avoid loss at expiry.",
      };
    }
    return {
      level: 5,
      label: "CRITICAL",
      color: "#ef4444",
      detail: "Price is in max-loss wing zone for this condor structure.",
    };
  }

  if (position.breakeven == null) {
    return {
      level: 3,
      label: "—",
      color: "#64748b",
      detail: "Breakeven is not set for this position.",
    };
  }

  const dte = computeDTE(position.expiry_date);
  const be = position.breakeven;
  const dist = ((be - price) / price) * 100;
  const absDist = Math.abs(dist);

  if (price >= be) {
    return {
      level: 1,
      label: "SAFE",
      color: "#4ade80",
      detail: "Underlying is above breakeven.",
    };
  }
  if (absDist < 3 && dte > 5) {
    return {
      level: 2,
      label: "NEAR",
      color: "#4ade80",
      detail: "Underlying is slightly below breakeven with time cushion.",
    };
  }
  if (absDist < 5 && dte > 3) {
    return {
      level: 3,
      label: "CAUTION",
      color: "#fbbf24",
      detail: "Below breakeven with moderate time pressure.",
    };
  }
  if (absDist < 10 && dte > 2) {
    return {
      level: 4,
      label: "AT RISK",
      color: "#f97316",
      detail: "Far below breakeven and close to expiry risk window.",
    };
  }
  return {
    level: 5,
    label: "CRITICAL",
    color: "#ef4444",
    detail: "Deep below breakeven with severe time pressure.",
  };
}
