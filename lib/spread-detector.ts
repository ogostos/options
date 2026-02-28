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

function sameStrike(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 0.0001;
}

export function detectSpreadFromLegs(legs: ParsedLeg[]): DetectedSpread {
  const sorted = [...legs].sort((a, b) => (a.strike ?? 0) - (b.strike ?? 0));
  const uniqueExpiries = new Set(sorted.map((leg) => leg.expiry ?? "unknown"));
  const calls = sorted.filter((leg) => leg.optionType === "C");
  const puts = sorted.filter((leg) => leg.optionType === "P");
  const contracts = Math.max(...sorted.map((leg) => Math.abs(leg.quantity)), 1);

  if (uniqueExpiries.size > 1) {
    if (sorted.length === 2) {
      const [a, b] = sorted;
      if (
        a.optionType != null &&
        a.optionType === b.optionType &&
        a.side !== b.side &&
        sameStrike(a.strike, b.strike)
      ) {
        return {
          strategy: "Calendar",
          direction: "Neutral",
          legs: sorted.map((leg) => normalizeLegLabel(leg)).join(" / "),
          contracts,
        };
      }
    }
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
    const [putLow, putHigh] = puts;
    const [callLow, callHigh] = calls;
    const isCreditWing =
      putLow.side === "BUY" &&
      putHigh.side === "SELL" &&
      callLow.side === "SELL" &&
      callHigh.side === "BUY";
    const isDebitWing =
      putLow.side === "SELL" &&
      putHigh.side === "BUY" &&
      callLow.side === "BUY" &&
      callHigh.side === "SELL";

    if (isCreditWing || isDebitWing) {
      if (sameStrike(putHigh.strike, callLow.strike)) {
        return {
          strategy: "Iron Butterfly",
          direction: "Neutral",
          legs: sorted.map((leg) => normalizeLegLabel(leg)).join(" / "),
          contracts,
        };
      }
      return {
        strategy: "Iron Condor",
        direction: "Neutral",
        legs: sorted.map((leg) => normalizeLegLabel(leg)).join(" / "),
        contracts,
      };
    }

    return {
      strategy: "Iron Condor",
      direction: "Neutral",
      legs: sorted.map((leg) => normalizeLegLabel(leg)).join(" / "),
      contracts,
    };
  }

  if (calls.length === 3 && puts.length === 0) {
    const [low, mid, high] = calls;
    const butterflyShape =
      low.strike != null &&
      mid.strike != null &&
      high.strike != null &&
      low.strike < mid.strike &&
      mid.strike < high.strike &&
      low.side === high.side &&
      mid.side !== low.side &&
      low.quantity === high.quantity &&
      mid.quantity === low.quantity + high.quantity;
    if (butterflyShape) {
      return {
        strategy: "Call Butterfly",
        direction: "Neutral",
        legs: sorted.map((leg) => normalizeLegLabel(leg)).join(" / "),
        contracts,
      };
    }
  }

  if (puts.length === 3 && calls.length === 0) {
    const [low, mid, high] = puts;
    const butterflyShape =
      low.strike != null &&
      mid.strike != null &&
      high.strike != null &&
      low.strike < mid.strike &&
      mid.strike < high.strike &&
      low.side === high.side &&
      mid.side !== low.side &&
      low.quantity === high.quantity &&
      mid.quantity === low.quantity + high.quantity;
    if (butterflyShape) {
      return {
        strategy: "Put Butterfly",
        direction: "Neutral",
        legs: sorted.map((leg) => normalizeLegLabel(leg)).join(" / "),
        contracts,
      };
    }
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
