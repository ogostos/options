import type { TradeDirection } from "@/lib/types";

export interface ParsedLeg {
  ticker: string;
  expiry: string | null;
  strike: number | null;
  optionType: "C" | "P" | null;
  side: "BUY" | "SELL";
  quantity: number;
}

export interface DetectedSpread {
  strategy: string;
  direction: TradeDirection;
  legs: string;
  contracts: number;
}

function normalizeLegLabel(leg: ParsedLeg): string {
  const strike = leg.strike == null ? "?" : String(leg.strike);
  const suffix = leg.optionType ?? "?";
  return `${strike}${suffix}`;
}

export function detectSpreadFromLegs(legs: ParsedLeg[]): DetectedSpread {
  const sorted = [...legs].sort((a, b) => (a.strike ?? 0) - (b.strike ?? 0));
  const uniqueExpiries = new Set(sorted.map((leg) => leg.expiry ?? "unknown"));
  const calls = sorted.filter((leg) => leg.optionType === "C");
  const puts = sorted.filter((leg) => leg.optionType === "P");
  const contracts = Math.max(...sorted.map((leg) => Math.abs(leg.quantity)), 1);

  if (uniqueExpiries.size > 1) {
    return {
      strategy: "Diagonal",
      direction: "Neutral",
      legs: sorted.map((leg) => normalizeLegLabel(leg)).join(" / "),
      contracts,
    };
  }

  if (calls.length === 2 && puts.length === 0) {
    const [a, b] = calls;
    if (a.side === "BUY" && b.side === "SELL") {
      return {
        strategy: "Bull Call Spread",
        direction: "Bullish",
        legs: `${normalizeLegLabel(a)} / ${normalizeLegLabel(b)}`,
        contracts,
      };
    }
    if (a.side === "SELL" && b.side === "BUY") {
      return {
        strategy: "Bear Call Spread",
        direction: "Bearish",
        legs: `${normalizeLegLabel(a)} / ${normalizeLegLabel(b)}`,
        contracts,
      };
    }
  }

  if (puts.length === 2 && calls.length === 0) {
    const [a, b] = puts;
    if (a.side === "BUY" && b.side === "SELL") {
      return {
        strategy: "Bear Put Spread",
        direction: "Bearish",
        legs: `${normalizeLegLabel(a)} / ${normalizeLegLabel(b)}`,
        contracts,
      };
    }
    if (a.side === "SELL" && b.side === "BUY") {
      return {
        strategy: "Bull Put Spread",
        direction: "Bullish",
        legs: `${normalizeLegLabel(a)} / ${normalizeLegLabel(b)}`,
        contracts,
      };
    }
  }

  if (puts.length === 2 && calls.length === 2) {
    return {
      strategy: "Iron Condor",
      direction: "Neutral",
      legs: sorted.map((leg) => normalizeLegLabel(leg)).join(" / "),
      contracts,
    };
  }

  if (sorted.length === 1) {
    const only = sorted[0];
    if (only.optionType === "C") {
      return {
        strategy: "Long Call",
        direction: "Bullish",
        legs: normalizeLegLabel(only),
        contracts,
      };
    }
    if (only.optionType === "P") {
      return {
        strategy: "Long Put",
        direction: "Bearish",
        legs: normalizeLegLabel(only),
        contracts,
      };
    }
  }

  return {
    strategy: "Custom",
    direction: "Neutral",
    legs: sorted.map((leg) => normalizeLegLabel(leg)).join(" / "),
    contracts,
  };
}
