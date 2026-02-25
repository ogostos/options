export interface IronCondorZone {
  lowerWing: number;
  lowerShort: number;
  upperShort: number;
  upperWing: number;
  lowerBreakeven: number;
  upperBreakeven: number;
  creditPerShare: number;
  width: number;
}

type ParsedLegToken = {
  strike: number;
  optionType: "C" | "P";
};

function parseLegTokens(legs: string): ParsedLegToken[] {
  const matches = [...legs.matchAll(/(\d+(?:\.\d+)?)\s*([CP])/gi)];
  return matches
    .map((match) => ({
      strike: Number(match[1]),
      optionType: match[2].toUpperCase() as "C" | "P",
    }))
    .filter((token) => Number.isFinite(token.strike));
}

function firstPositiveWithinWidth(values: Array<number | null | undefined>, width: number): number | null {
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) continue;
    if (value > 0 && value < width) return value;
  }
  return null;
}

export function getIronCondorZone({
  strategy,
  legs,
  breakeven,
  maxProfit,
  contracts,
}: {
  strategy: string;
  legs: string;
  breakeven: number | null;
  maxProfit: number | null;
  contracts: number;
}): IronCondorZone | null {
  if (strategy !== "Iron Condor") return null;

  const tokens = parseLegTokens(legs);
  if (tokens.length < 4) return null;

  const putStrikes = tokens
    .filter((token) => token.optionType === "P")
    .map((token) => token.strike)
    .sort((a, b) => a - b);
  const callStrikes = tokens
    .filter((token) => token.optionType === "C")
    .map((token) => token.strike)
    .sort((a, b) => a - b);

  if (putStrikes.length < 2 || callStrikes.length < 2) return null;

  const lowerWing = putStrikes[0];
  const lowerShort = putStrikes[putStrikes.length - 1];
  const upperShort = callStrikes[0];
  const upperWing = callStrikes[callStrikes.length - 1];

  if (!(lowerWing < lowerShort && lowerShort < upperShort && upperShort < upperWing)) {
    return null;
  }

  const widthLower = lowerShort - lowerWing;
  const widthUpper = upperWing - upperShort;
  const width = Math.min(widthLower, widthUpper);
  if (!Number.isFinite(width) || width <= 0) return null;

  const normalizedContracts = Math.max(contracts || 1, 1);
  const creditFromProfit =
    maxProfit != null && Number.isFinite(maxProfit)
      ? maxProfit / (100 * normalizedContracts)
      : null;
  const creditFromBreakeven =
    breakeven != null && Number.isFinite(breakeven)
      ? lowerShort - breakeven
      : null;

  const creditPerShare =
    firstPositiveWithinWidth([creditFromProfit, creditFromBreakeven], width) ??
    Number((width * 0.2).toFixed(4));

  const lowerBreakeven = Number((lowerShort - creditPerShare).toFixed(4));
  const upperBreakeven = Number((upperShort + creditPerShare).toFixed(4));

  return {
    lowerWing,
    lowerShort,
    upperShort,
    upperWing,
    lowerBreakeven,
    upperBreakeven,
    creditPerShare,
    width,
  };
}

export type IronCondorPriceZone =
  | "max_loss_low"
  | "recover_low"
  | "profit_low"
  | "max_profit_core"
  | "profit_high"
  | "recover_high"
  | "max_loss_high";

export function classifyIronCondorPriceZone(price: number, zone: IronCondorZone): IronCondorPriceZone {
  if (price <= zone.lowerWing) return "max_loss_low";
  if (price < zone.lowerBreakeven) return "recover_low";
  if (price < zone.lowerShort) return "profit_low";
  if (price <= zone.upperShort) return "max_profit_core";
  if (price <= zone.upperBreakeven) return "profit_high";
  if (price < zone.upperWing) return "recover_high";
  return "max_loss_high";
}

export function estimateIronCondorPnLAtExpiry(
  price: number,
  zone: IronCondorZone,
  contracts: number,
): number {
  const positionCount = Math.max(contracts || 1, 1);
  const putSideLoss = Math.max(0, Math.min(zone.width, zone.lowerShort - price));
  const callSideLoss = Math.max(0, Math.min(zone.width, price - zone.upperShort));
  const plPerShare = zone.creditPerShare - putSideLoss - callSideLoss;
  return Number((plPerShare * 100 * positionCount).toFixed(2));
}
