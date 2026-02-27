import { detectSpreadFromLegs, type ParsedLeg } from "./spread-detector.ts";
import type { OptionQuoteMap } from "./live-position-metrics.ts";
import type { IbkrPositionRecord, IbkrSyncSnapshot, IbkrTradeRecord, StockPosition, Trade } from "./types.ts";

type ParsedOptionLeg = {
  ticker: string;
  expiryDate: string;
  strike: number;
  optionType: "C" | "P";
  quantity: number;
  avgCost: number | null;
  marketPrice: number | null;
  marketValue: number | null;
  unrealized: number | null;
  realized: number | null;
  conid: number | null;
  ibSymbol: string;
};

export interface IbkrLiveModel {
  accountSummary: {
    netLiq: number | null;
    cash: number | null;
    buyingPower: number | null;
    maintenanceMargin: number | null;
    excessLiquidity: number | null;
    marginDebt: number | null;
  };
  openPositions: Trade[];
  stocks: StockPosition[];
  optionQuotes: OptionQuoteMap;
  underlyingPrices: Record<string, number>;
  recentTrades: IbkrTradeRecord[];
  meta: {
    matchedTrades: number;
    derivedTrades: number;
    unmatchedLegs: number;
    baselineOpenTrades: number;
  };
}

interface BuildIbkrLiveModelOptions {
  baselineOpenTrades?: Trade[];
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

function toNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const n = Number(match[0]);
    if (Number.isFinite(n)) return n;
  }
  if (value && typeof value === "object") {
    const candidate =
      toNum((value as Record<string, unknown>).value) ??
      toNum((value as Record<string, unknown>).amount) ??
      toNum((value as Record<string, unknown>).val);
    if (candidate != null) return candidate;
  }
  return null;
}

function normalizeSummaryKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildSummaryLookup(summary: Record<string, unknown>): Map<string, number> {
  const map = new Map<string, number>();
  for (const [key, raw] of Object.entries(summary)) {
    const numeric = toNum(raw);
    if (numeric == null) continue;
    map.set(normalizeSummaryKey(key), numeric);
  }
  return map;
}

function pickSummary(summary: Record<string, unknown>, lookup: Map<string, number>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNum(summary[key]);
    if (value != null) return value;
    const normalized = lookup.get(normalizeSummaryKey(key));
    if (normalized != null) return normalized;
  }
  return null;
}

function yymmddToDate(value: string): string | null {
  if (!/^\d{6}$/.test(value)) return null;
  const yy = Number(value.slice(0, 2));
  const mm = Number(value.slice(2, 4));
  const dd = Number(value.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `20${String(yy).padStart(2, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function dateToIbCode(isoDate: string): string | null {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, yyyy, mmRaw, dd] = match;
  const mm = Number(mmRaw);
  const mon = MONTHS[mm - 1];
  if (!mon) return null;
  return `${dd}${mon}${yyyy.slice(-2)}`;
}

function cleanStrike(value: number): string {
  const rounded = Number(value.toFixed(4));
  if (Number.isInteger(rounded)) return String(Math.trunc(rounded));
  return String(rounded).replace(/0+$/, "").replace(/\.$/, "");
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\s+/g, " ");
}

function parseOptionLeg(row: IbkrPositionRecord): ParsedOptionLeg | null {
  const combined = `${row.symbol ?? ""} ${row.contract ?? ""}`.toUpperCase();
  const match = combined.match(/([A-Z.]+)\s+(\d{6})([CP])(\d{8})/);
  if (!match) return null;

  const [, tickerRaw, yymmdd, cp, strikeRaw] = match;
  const expiryDate = yymmddToDate(yymmdd);
  if (!expiryDate) return null;
  const strike = Number(strikeRaw) / 1000;
  if (!Number.isFinite(strike)) return null;

  const ibCode = dateToIbCode(expiryDate);
  if (!ibCode) return null;
  const ticker = tickerRaw.toUpperCase();
  const optionType = cp as "C" | "P";
  const ibSymbol = normalizeSymbol(`${ticker} ${ibCode} ${cleanStrike(strike)} ${optionType}`);

  return {
    ticker,
    expiryDate,
    strike,
    optionType,
    quantity: row.quantity,
    avgCost: row.average_cost,
    marketPrice: row.market_price,
    marketValue: row.market_value,
    unrealized: row.unrealized_pl,
    realized: row.realized_pl,
    conid: row.conid,
    ibSymbol,
  };
}

function inferStockTicker(row: IbkrPositionRecord): string | null {
  const candidate = String(row.symbol ?? row.contract ?? "").trim().toUpperCase();
  if (!candidate) return null;
  const first = candidate.split(/\s+/)[0];
  if (!/^[A-Z.]{1,10}$/.test(first)) return null;
  return first;
}

function average(values: Array<number | null>): number | null {
  const clean = values.filter((item): item is number => item != null && Number.isFinite(item));
  if (clean.length === 0) return null;
  return clean.reduce((sum, item) => sum + item, 0) / clean.length;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function sortUniqueSymbols(symbols: string[]): string[] {
  return [...new Set(symbols.map((symbol) => normalizeSymbol(symbol)).filter(Boolean))].sort();
}

function normalizeAverageCost(avgCost: number | null, marketPrice: number | null): number | null {
  if (avgCost == null || !Number.isFinite(avgCost)) return null;
  if (marketPrice != null && marketPrice > 0) {
    const ratio = avgCost / marketPrice;
    if (ratio > 20 && ratio < 200) return avgCost / 100;
  }
  if (avgCost > 1000) return avgCost / 100;
  return avgCost;
}

function deriveEntryDate(snapshot: IbkrSyncSnapshot, legs: ParsedOptionLeg[]): string {
  const conids = new Set(legs.map((leg) => leg.conid).filter((item): item is number => item != null));
  const tickerSet = new Set(legs.map((leg) => leg.ticker));
  const matching = snapshot.trades
    .filter((trade) => {
      if (trade.conid != null && conids.has(trade.conid)) return true;
      if (trade.symbol) {
        const upper = trade.symbol.toUpperCase();
        return [...tickerSet].some((ticker) => upper.includes(ticker));
      }
      return false;
    })
    .map((trade) => trade.trade_time)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (matching.length > 0) {
    return matching[0].toISOString().slice(0, 10);
  }
  return snapshot.fetched_at.slice(0, 10);
}

function computeUrgency(expiryDate: string | null): number {
  if (!expiryDate) return 3;
  const expiry = new Date(`${expiryDate}T00:00:00Z`);
  if (Number.isNaN(expiry.getTime())) return 3;
  const dte = Math.ceil((expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (dte <= 3) return 5;
  if (dte <= 7) return 4;
  if (dte <= 21) return 3;
  if (dte <= 60) return 2;
  return 1;
}

function strategyDirectionFromSingle(optionType: "C" | "P", qty: number): { strategy: string; direction: Trade["direction"] } {
  if (qty > 0) {
    return {
      strategy: optionType === "C" ? "Long Call" : "Long Put",
      direction: optionType === "C" ? "Bullish" : "Bearish",
    };
  }
  return {
    strategy: "Custom",
    direction: "Neutral",
  };
}

function inferLegEntryFlows(legs: ParsedOptionLeg[]) {
  const fromMarketAndUnrealized = legs.reduce((sum, leg) => {
    const marketValue =
      leg.marketValue ??
      (leg.marketPrice != null ? leg.marketPrice * 100 * leg.quantity : null);
    const unrealized = leg.unrealized;
    if (marketValue == null || unrealized == null) return sum;
    return sum + (marketValue - unrealized);
  }, 0);

  const completeMarket = legs.every((leg) => {
    const marketValue =
      leg.marketValue ??
      (leg.marketPrice != null ? leg.marketPrice * 100 * leg.quantity : null);
    return marketValue != null && leg.unrealized != null;
  });

  if (completeMarket && Number.isFinite(fromMarketAndUnrealized)) {
    return {
      debit: Math.max(fromMarketAndUnrealized, 0),
      credit: Math.max(-fromMarketAndUnrealized, 0),
    };
  }

  const longCost = legs
    .filter((leg) => leg.quantity > 0)
    .reduce((sum, leg) => {
      const entry = normalizeAverageCost(leg.avgCost, leg.marketPrice);
      if (entry == null) return sum;
      return sum + Math.abs(leg.quantity) * entry * 100;
    }, 0);
  const shortCredit = legs
    .filter((leg) => leg.quantity < 0)
    .reduce((sum, leg) => {
      const entry = normalizeAverageCost(leg.avgCost, leg.marketPrice);
      if (entry == null) return sum;
      return sum + Math.abs(leg.quantity) * entry * 100;
    }, 0);

  return {
    debit: Math.max(longCost - shortCredit, 0),
    credit: Math.max(shortCredit - longCost, 0),
  };
}

function buildTradeFromLegGroup(snapshot: IbkrSyncSnapshot, legs: ParsedOptionLeg[], idSeed: number): Trade {
  const first = legs[0];
  const calls = legs.filter((leg) => leg.optionType === "C").sort((a, b) => a.strike - b.strike);
  const puts = legs.filter((leg) => leg.optionType === "P").sort((a, b) => a.strike - b.strike);
  const maxAbsQty = Math.max(...legs.map((leg) => Math.abs(leg.quantity)), 1);

  let strategy = "Custom";
  let direction: Trade["direction"] = "Neutral";
  if (legs.length === 1) {
    const single = strategyDirectionFromSingle(legs[0].optionType, legs[0].quantity);
    strategy = single.strategy;
    direction = single.direction;
  } else {
    const parsedForDetector: ParsedLeg[] = legs.map((leg) => ({
      ticker: leg.ticker,
      expiry: leg.expiryDate,
      strike: leg.strike,
      optionType: leg.optionType,
      side: leg.quantity >= 0 ? "BUY" : "SELL",
      quantity: Math.abs(leg.quantity),
    }));
    const detected = detectSpreadFromLegs(parsedForDetector);
    strategy = detected.strategy;
    direction = detected.direction;
  }

  const { debit, credit } = inferLegEntryFlows(legs);

  let maxRisk = debit > 0 ? debit : Math.max(credit, 0);
  let maxProfit: number | null = null;
  let breakeven: number | null = null;

  const single = legs.length === 1 ? legs[0] : null;
  if (single) {
    if (single.optionType === "C" && single.quantity > 0) {
      breakeven = single.strike + debit / (100 * maxAbsQty);
      maxRisk = debit;
      maxProfit = null;
    } else if (single.optionType === "P" && single.quantity > 0) {
      breakeven = single.strike - debit / (100 * maxAbsQty);
      maxRisk = debit;
      maxProfit = null;
    } else {
      breakeven = null;
      maxRisk = Math.max(credit, debit);
      maxProfit = credit > 0 ? credit : null;
    }
  } else if (strategy === "Bull Call Spread" || strategy === "Bear Put Spread") {
    const width = legs.length >= 2 ? Math.abs(legs[0].strike - legs[1].strike) * 100 * maxAbsQty : 0;
    maxRisk = debit > 0 ? debit : Math.max(width - credit, 0);
    maxProfit = width > 0 ? Math.max(width - maxRisk, 0) : null;
    const longStrike = strategy === "Bull Call Spread" ? calls[0]?.strike : puts[puts.length - 1]?.strike;
    if (longStrike != null) {
      breakeven = strategy === "Bull Call Spread"
        ? longStrike + (maxRisk / (100 * maxAbsQty))
        : longStrike - (maxRisk / (100 * maxAbsQty));
    }
  } else if (strategy === "Bull Put Spread" || strategy === "Bear Call Spread") {
    const width = legs.length >= 2 ? Math.abs(legs[0].strike - legs[1].strike) * 100 * maxAbsQty : 0;
    maxProfit = credit > 0 ? credit : null;
    maxRisk = width > 0 ? Math.max(width - credit, 0) : Math.max(debit, credit);
    const shortStrike = strategy === "Bull Put Spread" ? puts[puts.length - 1]?.strike : calls[0]?.strike;
    if (shortStrike != null && maxProfit != null) {
      breakeven = strategy === "Bull Put Spread"
        ? shortStrike - (maxProfit / (100 * maxAbsQty))
        : shortStrike + (maxProfit / (100 * maxAbsQty));
    }
  } else if (strategy === "Iron Condor" && puts.length >= 2 && calls.length >= 2) {
    const putWidth = Math.abs(puts[puts.length - 1].strike - puts[0].strike) * 100 * maxAbsQty;
    const callWidth = Math.abs(calls[calls.length - 1].strike - calls[0].strike) * 100 * maxAbsQty;
    const width = Math.min(putWidth, callWidth);
    maxProfit = credit > 0 ? credit : null;
    maxRisk = width > 0 ? Math.max(width - credit, 0) : Math.max(debit, credit);
    const shortPut = puts[puts.length - 1]?.strike;
    if (shortPut != null && maxProfit != null) {
      breakeven = shortPut - maxProfit / (100 * maxAbsQty);
    }
  } else {
    maxRisk = Math.max(debit, credit, 0);
    maxProfit = credit > 0 ? credit : null;
  }

  const longStrikes = legs.filter((leg) => leg.quantity > 0).map((leg) => leg.strike).sort((a, b) => a - b);
  const shortStrikes = legs.filter((leg) => leg.quantity < 0).map((leg) => leg.strike).sort((a, b) => a - b);
  const closeLong = average(
    legs
      .filter((leg) => leg.quantity > 0)
      .map((leg) => normalizeAverageCost(leg.avgCost, leg.marketPrice)),
  );
  const closeShort = average(
    legs
      .filter((leg) => leg.quantity < 0)
      .map((leg) => normalizeAverageCost(leg.avgCost, leg.marketPrice)),
  );
  const unrealized = round2(legs.reduce((sum, leg) => sum + (leg.unrealized ?? 0), 0));
  const realized = round2(legs.reduce((sum, leg) => sum + (leg.realized ?? 0), 0));
  const entryDate = deriveEntryDate(snapshot, legs);
  const legsLabel = legs
    .slice()
    .sort((a, b) => a.strike - b.strike)
    .map((leg) => `${cleanStrike(leg.strike)}${leg.optionType}`)
    .join(" / ");

  return {
    id: idSeed,
    created_at: snapshot.created_at,
    updated_at: snapshot.created_at,
    ticker: first.ticker,
    strategy,
    legs: legsLabel,
    direction,
    entry_date: entryDate,
    exit_date: null,
    expiry_date: first.expiryDate,
    status: "OPEN",
    position_type: "option",
    cost_basis: round2(strategy === "Bull Put Spread" || strategy === "Bear Call Spread" || strategy === "Iron Condor" ? credit : maxRisk),
    max_risk: round2(Math.max(maxRisk, 0)),
    max_profit: maxProfit == null ? null : round2(Math.max(maxProfit, 0)),
    realized_pl: realized,
    unrealized_pl: unrealized,
    return_pct: null,
    commissions: 0,
    contracts: maxAbsQty,
    catalyst: "None",
    notes: "Synced from IBKR local gateway snapshot.",
    lesson: "",
    breakeven: breakeven == null ? null : Number(breakeven.toFixed(4)),
    stop_loss: null,
    strike_long: strategy === "Iron Condor" ? null : longStrikes[0] ?? null,
    strike_short: strategy === "Iron Condor" ? null : shortStrikes[shortStrikes.length - 1] ?? null,
    close_price_long: closeLong == null ? null : Number(closeLong.toFixed(4)),
    close_price_short: closeShort == null ? null : Number(closeShort.toFixed(4)),
    theta_per_day: null,
    urgency: computeUrgency(first.expiryDate),
    peak_window: "",
    hold_advice: "IBKR live sync position. Use card guidance with current marks and risk status.",
    exit_trigger: "",
    best_case: "",
    exit_conservative: "",
    exit_balanced: "",
    exit_aggressive: "",
    source: "import",
    ib_symbols: sortUniqueSymbols(legs.map((leg) => leg.ibSymbol)),
  };
}

function buildTradeFromBaseline(snapshot: IbkrSyncSnapshot, baseline: Trade, legs: ParsedOptionLeg[]): Trade {
  const contractsFromLegs = Math.max(...legs.map((leg) => Math.abs(leg.quantity)), baseline.contracts, 1);
  const unrealized = round2(legs.reduce((sum, leg) => sum + (leg.unrealized ?? 0), 0));
  const realized = round2(legs.reduce((sum, leg) => sum + (leg.realized ?? 0), 0));
  return {
    ...baseline,
    updated_at: snapshot.created_at,
    status: "OPEN",
    contracts: contractsFromLegs,
    expiry_date: legs[0]?.expiryDate ?? baseline.expiry_date,
    unrealized_pl: Number.isFinite(unrealized) ? unrealized : baseline.unrealized_pl,
    realized_pl: baseline.realized_pl ?? realized,
    ib_symbols: sortUniqueSymbols(baseline.ib_symbols ?? []),
  };
}

function groupUnmatchedLegs(legs: ParsedOptionLeg[]) {
  const grouped = new Map<string, ParsedOptionLeg[]>();
  for (const leg of legs) {
    const key = `${leg.ticker}|${leg.expiryDate}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(leg);
    grouped.set(key, bucket);
  }
  return grouped;
}

export function buildIbkrLiveModel(
  snapshot: IbkrSyncSnapshot,
  options?: BuildIbkrLiveModelOptions,
): IbkrLiveModel {
  const baselineOpenTrades = options?.baselineOpenTrades ?? [];
  const parsedOptionLegs: ParsedOptionLeg[] = [];
  const stocks: StockPosition[] = [];
  const optionQuotes: OptionQuoteMap = {};
  const underlyingPrices: Record<string, number> = {};

  let stockId = 1;
  for (const row of snapshot.positions) {
    const parsed = parseOptionLeg(row);
    if (parsed) {
      parsedOptionLegs.push(parsed);

      if (parsed.marketPrice != null) {
        optionQuotes[parsed.ibSymbol] = {
          mark: Number(parsed.marketPrice.toFixed(4)),
          bid: null,
          ask: null,
          last: Number(parsed.marketPrice.toFixed(4)),
          source: "ibkr-local",
          updatedAt: snapshot.fetched_at,
        };
      }
      continue;
    }

    const ticker = inferStockTicker(row);
    if (!ticker) continue;
    const shares = row.quantity;
    const costPrice = row.average_cost ?? 0;
    const closePrice = row.market_price ?? costPrice;
    stocks.push({
      id: stockId++,
      created_at: snapshot.created_at,
      ticker,
      shares,
      cost_basis: Number((costPrice * shares).toFixed(2)),
      cost_price: Number(costPrice.toFixed(4)),
      close_price: Number(closePrice.toFixed(4)),
      unrealized_pl: Number((row.unrealized_pl ?? 0).toFixed(2)),
      notes: "Synced from IBKR local gateway snapshot.",
    });
    if (row.market_price != null && Number.isFinite(row.market_price)) {
      underlyingPrices[ticker] = Number(row.market_price.toFixed(4));
    }
  }

  const legBySymbol = new Map<string, ParsedOptionLeg>();
  for (const leg of parsedOptionLegs) {
    legBySymbol.set(leg.ibSymbol, leg);
  }

  const consumedSymbols = new Set<string>();
  const matchedPositions: Trade[] = [];
  for (const baseline of baselineOpenTrades) {
    const required = sortUniqueSymbols(baseline.ib_symbols ?? []);
    if (required.length === 0) continue;
    if (required.some((symbol) => consumedSymbols.has(symbol))) continue;
    const legs = required
      .map((symbol) => legBySymbol.get(symbol))
      .filter((value): value is ParsedOptionLeg => Boolean(value));
    if (legs.length !== required.length) continue;
    for (const symbol of required) consumedSymbols.add(symbol);
    matchedPositions.push(buildTradeFromBaseline(snapshot, baseline, legs));
  }

  const unmatchedLegs = parsedOptionLegs.filter((leg) => !consumedSymbols.has(leg.ibSymbol));
  const unmatchedGroups = groupUnmatchedLegs(unmatchedLegs);
  let derivedId = -1;
  const derivedPositions = [...unmatchedGroups.values()].map((legs) =>
    buildTradeFromLegGroup(snapshot, legs, derivedId--),
  );

  const openPositions = [...matchedPositions, ...derivedPositions].sort((a, b) =>
    a.ticker.localeCompare(b.ticker),
  );

  const summary = snapshot.summary ?? {};
  const lookup = buildSummaryLookup(summary);
  const cash = pickSummary(summary, lookup, ["totalCashValue", "TotalCashValue", "cash", "cashBalance"]);
  const accountSummary = {
    netLiq: pickSummary(summary, lookup, ["netLiquidation", "NetLiquidation", "net_liquidation"]),
    cash,
    buyingPower: pickSummary(summary, lookup, ["buyingPower", "BuyingPower"]),
    maintenanceMargin: pickSummary(summary, lookup, ["maintMarginReq", "MaintMarginReq", "maintenanceMargin"]),
    excessLiquidity: pickSummary(summary, lookup, ["excessLiquidity", "ExcessLiquidity"]),
    marginDebt: cash != null && cash < 0 ? Math.abs(cash) : 0,
  };

  return {
    accountSummary,
    openPositions,
    stocks,
    optionQuotes,
    underlyingPrices,
    recentTrades: snapshot.trades,
    meta: {
      matchedTrades: matchedPositions.length,
      derivedTrades: derivedPositions.length,
      unmatchedLegs: unmatchedLegs.length,
      baselineOpenTrades: baselineOpenTrades.length,
    },
  };
}
