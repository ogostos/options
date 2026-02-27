import type { AccountSnapshot, ParsedIBExecution, ParsedIBOpenPosition, ParsedIBStatement, ParsedIBSummarySymbol, TradeInput } from "@/lib/types";
import { detectSpreadFromLegs, type ParsedLeg } from "@/lib/spread-detector";

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

const OPTION_SYMBOL_PATTERN = /([A-Z.]+\s+\d{2}[A-Z]{3}\d{2}\s+[\d.]+\s+[CP])$/i;
const DISPLAY_DATE_PATTERN = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/i;

function parseNumber(raw: string): number {
  const normalized = raw.replace(/,/g, "").trim();
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function parsePercent(raw: string): number | null {
  const normalized = raw.replace("%", "").trim();
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function isNumericToken(value: string): boolean {
  return /^-?[\d,]+(?:\.\d+)?$/.test(value.trim());
}

function normalizeLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function parseDisplayDate(raw: string): string | null {
  const normalized = normalizeLine(raw);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function firstNumericAfter(lines: string[], startIndex: number, lookahead = 10): number | null {
  for (let i = startIndex + 1; i < Math.min(lines.length, startIndex + lookahead + 1); i += 1) {
    const line = normalizeLine(lines[i]);
    if (!line) continue;
    if (isNumericToken(line)) return parseNumber(line);
    if (/^[A-Za-z]/.test(line)) break;
  }
  return null;
}

function collectNumericAfter(lines: string[], startIndex: number, targetCount: number, lookahead = 40): number[] {
  const values: number[] = [];

  for (let i = startIndex + 1; i < Math.min(lines.length, startIndex + lookahead + 1); i += 1) {
    const line = normalizeLine(lines[i]);
    if (!line) continue;
    if (/^activity statement\b/i.test(line) || /^page:\s*\d+/i.test(line)) continue;

    if (isNumericToken(line)) {
      values.push(parseNumber(line));
      if (values.length >= targetCount) break;
      continue;
    }

    if (values.length > 0 && /^[A-Za-z]/.test(line)) {
      break;
    }
  }

  return values;
}

function findExactLabelIndex(lines: string[], label: string): number {
  const target = label.toLowerCase();
  for (let i = 0; i < lines.length; i += 1) {
    if (normalizeLine(lines[i]).toLowerCase() !== target) continue;
    const numericProbe = firstNumericAfter(lines, i);
    if (numericProbe != null) return i;
  }
  return -1;
}

function findContainsLabelIndex(lines: string[], contains: string): number {
  const target = contains.toLowerCase();
  for (let i = 0; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]).toLowerCase();
    if (!line.includes(target)) continue;
    const numericProbe = firstNumericAfter(lines, i);
    if (numericProbe != null) return i;
  }
  return -1;
}

function extractOptionSymbol(raw: string): string | null {
  const normalized = normalizeLine(raw)
    .replace(/^Equity and Index OptionsUSD/i, "")
    .replace(/^Equity and Index Options/i, "")
    .replace(/^OptionsUSD/i, "")
    .replace(/^Options/i, "")
    .trim();
  const match = normalized.match(OPTION_SYMBOL_PATTERN);
  if (!match) return null;
  return match[1].toUpperCase();
}

function parseDateCode(code: string): string | null {
  const match = code.match(/^(\d{2})([A-Z]{3})(\d{2})$/);
  if (!match) return null;
  const [, dd, mon, yy] = match;
  const month = MONTHS[mon];
  if (!month) return null;
  return `20${yy}-${month}-${dd}`;
}

export function parseIBSymbol(symbol: string): {
  ticker: string;
  expiry: string | null;
  strike: number | null;
  optionType: "C" | "P" | null;
} {
  const cleaned = symbol.trim().replace(/\s+/g, " ");
  const optionMatch = cleaned.match(/^([A-Z.]+)\s+(\d{2}[A-Z]{3}\d{2})\s+([\d.]+)\s+([CP])$/);

  if (optionMatch) {
    const [, ticker, dateCode, strike, cp] = optionMatch;
    return {
      ticker,
      expiry: parseDateCode(dateCode),
      strike: Number(strike),
      optionType: cp as "C" | "P",
    };
  }

  return {
    ticker: cleaned.split(" ")[0] || cleaned,
    expiry: null,
    strike: null,
    optionType: null,
  };
}

function extractSection(lines: string[], startPatterns: string[], stopPatterns: string[]): string[] {
  const startLower = startPatterns.map((pattern) => pattern.toLowerCase());

  let exactStart = -1;
  let fuzzyStart = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const lower = lines[i].toLowerCase();
    if (exactStart < 0 && startLower.some((pattern) => lower === pattern)) {
      exactStart = i;
      break;
    }
    if (fuzzyStart < 0 && startLower.some((pattern) => lower.includes(pattern))) {
      fuzzyStart = i;
    }
  }

  const start = exactStart >= 0 ? exactStart : fuzzyStart;
  if (start < 0) return [];

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const lower = lines[i].toLowerCase();
    if (stopPatterns.some((pattern) => lower.includes(pattern.toLowerCase()))) {
      end = i;
      break;
    }
  }

  return lines.slice(start + 1, end);
}

function parseNetAssetValue(lines: string[]): Partial<AccountSnapshot> {
  const payload: Partial<AccountSnapshot> = {};

  const dateRows = lines.filter((line) => DISPLAY_DATE_PATTERN.test(normalizeLine(line)));
  if (dateRows.length >= 2) {
    payload.period_start = parseDisplayDate(dateRows[0]) ?? undefined;
    payload.period_end = parseDisplayDate(dateRows[1]) ?? undefined;
  }

  const cashIndex = findExactLabelIndex(lines, "Cash");
  if (cashIndex >= 0) {
    const values = collectNumericAfter(lines, cashIndex, 5);
    payload.cash_start = values[0] ?? 0;
    payload.cash_end = values[3] ?? values[0] ?? 0;
    payload.cash_settled = payload.cash_end;
  }

  const stockIndex = findExactLabelIndex(lines, "Stock");
  if (stockIndex >= 0) {
    const values = collectNumericAfter(lines, stockIndex, 5);
    payload.stock_long = values[1] ?? 0;
    payload.stock_short = values[2] ?? 0;
    payload.stock_total = values[3] ?? 0;
  }

  const optionsIndex = findExactLabelIndex(lines, "Options");
  if (optionsIndex >= 0) {
    const values = collectNumericAfter(lines, optionsIndex, 5);
    payload.options_long = values[1] ?? 0;
    payload.options_short = values[2] ?? 0;
    payload.options_total = values[3] ?? 0;
  }

  const interestIndex = findExactLabelIndex(lines, "Interest Accruals");
  if (interestIndex >= 0) {
    const values = collectNumericAfter(lines, interestIndex, 5);
    payload.interest_accrued = values[3] ?? values[0] ?? 0;
  }

  const navIndex = findExactLabelIndex(lines, "Total");
  if (navIndex >= 0) {
    const values = collectNumericAfter(lines, navIndex, 5);
    payload.start_nav = values[0] ?? 0;
    payload.end_nav = values[3] ?? values[0] ?? 0;
  }

  const twrIndex = findContainsLabelIndex(lines, "Time Weighted Rate of Return");
  if (twrIndex >= 0) {
    for (let i = twrIndex + 1; i < Math.min(lines.length, twrIndex + 6); i += 1) {
      const pct = parsePercent(lines[i]);
      if (pct != null) {
        payload.twr = pct;
        break;
      }
    }
  } else if (payload.start_nav && payload.end_nav != null) {
    payload.twr = Number((((payload.end_nav - payload.start_nav) / payload.start_nav) * 100).toFixed(2));
  }

  const mtmIndex = findExactLabelIndex(lines, "Mark-to-Market");
  if (mtmIndex >= 0) {
    const mtmValue = firstNumericAfter(lines, mtmIndex, 8);
    if (mtmValue != null) payload.mtm = mtmValue;
  }

  const commIndex = findExactLabelIndex(lines, "Commissions");
  if (commIndex >= 0) {
    const commValue = firstNumericAfter(lines, commIndex, 8);
    if (commValue != null) payload.commissions_total = commValue;
  }

  if (payload.cash_end != null) {
    payload.margin_debt = payload.cash_end < 0 ? Math.abs(payload.cash_end) : 0;
  }

  return payload;
}

function parseCashReport(lines: string[]): Partial<AccountSnapshot> {
  const payload: Partial<AccountSnapshot> = {};

  const startingCashIndex = findContainsLabelIndex(lines, "starting cash");
  if (startingCashIndex >= 0) {
    const values = collectNumericAfter(lines, startingCashIndex, 3, 10);
    if (values[0] != null) payload.cash_start = values[0];
  }

  const endingCashIndex = findContainsLabelIndex(lines, "ending cash");
  if (endingCashIndex >= 0) {
    const values = collectNumericAfter(lines, endingCashIndex, 3, 10);
    if (values[0] != null) payload.cash_end = values[0];
  }

  const settledCashIndex = findContainsLabelIndex(lines, "ending settled cash");
  if (settledCashIndex >= 0) {
    const values = collectNumericAfter(lines, settledCashIndex, 3, 10);
    if (values[0] != null) payload.cash_settled = values[0];
  }

  const salesIndex = findContainsLabelIndex(lines, "trades (sales)");
  if (salesIndex >= 0) {
    const values = collectNumericAfter(lines, salesIndex, 5, 12);
    if (values[0] != null) payload.trades_sales = values[0];
  }

  const purchaseIndex = findContainsLabelIndex(lines, "trades (purchase)");
  if (purchaseIndex >= 0) {
    const values = collectNumericAfter(lines, purchaseIndex, 5, 12);
    if (values[0] != null) payload.trades_purchase = values[0];
  }

  const commissionIndex = findExactLabelIndex(lines, "Commissions");
  if (commissionIndex >= 0) {
    const values = collectNumericAfter(lines, commissionIndex, 5, 12);
    if (values[0] != null) payload.commissions_total = values[0];
  }

  if (payload.cash_end != null) {
    payload.margin_debt = payload.cash_end < 0 ? Math.abs(payload.cash_end) : 0;
  }

  return payload;
}

function parseTradesSection(lines: string[]): ParsedIBExecution[] {
  const executions: ParsedIBExecution[] = [];

  // Handle inline rows when the PDF extractor preserves table columns on one line.
  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);
    if (!line || /^total/i.test(line)) continue;

    const match = line.match(
      /^([A-Z.]+\s+\d{2}[A-Z]{3}\d{2}\s+[\d.]+\s+[CP])\s+(\d{4}-\d{2}-\d{2}),\s*(\d{2}:\d{2}:\d{2})\s+(-?\d+)\s+([\d.]+)(?:\s+([\d.]+))?\s+(-?[\d,]+(?:\.\d+)?)\s+(-?[\d,]+(?:\.\d+)?)/i,
    );

    if (!match) continue;

    const [, symbol, datePart, timePart, qtyRaw, pxRaw, , amountRaw, commissionRaw] = match;
    const parsed = parseIBSymbol(symbol);
    const quantity = Number(qtyRaw);

    executions.push({
      raw: rawLine,
      symbol,
      ticker: parsed.ticker,
      expiry: parsed.expiry,
      strike: parsed.strike,
      optionType: parsed.optionType,
      side: quantity >= 0 ? "BUY" : "SELL",
      quantity,
      price: parseNumber(pxRaw),
      commission: parseNumber(commissionRaw),
      timestamp: `${datePart}T${timePart}`,
    });

    void amountRaw;
  }

  // Handle multi-line row format (common in IB statements).
  for (let i = 0; i < lines.length - 10; i += 1) {
    const symbol = extractOptionSymbol(lines[i]);
    if (!symbol || /^total\b/i.test(lines[i])) continue;

    const dateTimeRaw = normalizeLine(lines[i + 1] ?? "");
    const dateTimeMatch = dateTimeRaw.match(/^(\d{4}-\d{2}-\d{2}),\s*(\d{2}:\d{2}:\d{2})$/);
    if (!dateTimeMatch) continue;

    const qtyRaw = normalizeLine(lines[i + 2] ?? "");
    const tPriceRaw = normalizeLine(lines[i + 3] ?? "");
    const proceedsRaw = normalizeLine(lines[i + 5] ?? "");
    const commissionRaw = normalizeLine(lines[i + 6] ?? "");

    if (!/^-?\d+(?:\.\d+)?$/.test(qtyRaw)) continue;
    if (!isNumericToken(tPriceRaw) || !isNumericToken(commissionRaw)) continue;

    const parsed = parseIBSymbol(symbol);
    const quantity = Number(qtyRaw);
    const [, datePart, timePart] = dateTimeMatch;

    executions.push({
      raw: symbol,
      symbol,
      ticker: parsed.ticker,
      expiry: parsed.expiry,
      strike: parsed.strike,
      optionType: parsed.optionType,
      side: quantity >= 0 ? "BUY" : "SELL",
      quantity,
      price: parseNumber(tPriceRaw),
      commission: parseNumber(commissionRaw),
      timestamp: `${datePart}T${timePart}`,
    });

    void proceedsRaw;
  }

  const dedup = new Map<string, ParsedIBExecution>();
  for (const row of executions) {
    const key = [row.symbol, row.timestamp ?? "", row.quantity, row.price.toFixed(6), row.commission.toFixed(6)].join("|");
    dedup.set(key, row);
  }

  return [...dedup.values()];
}

function parseOpenPositionsSection(lines: string[]): ParsedIBOpenPosition[] {
  const rows: ParsedIBOpenPosition[] = [];

  // Handle inline rows when available.
  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);
    if (!line || /^total/i.test(line)) continue;

    const match = line.match(
      /^([A-Z.]+\s+\d{2}[A-Z]{3}\d{2}\s+[\d.]+\s+[CP])\s+-\s+(-?\d+)\s+\d+\s+([\d.]+)\s+(-?[\d,]+(?:\.\d+)?)\s+([\d.]+)$/i,
    );

    if (!match) continue;

    const [, symbol, qtyRaw, avgRaw, costRaw, closeRaw] = match;
    const parsed = parseIBSymbol(symbol);

    rows.push({
      raw: rawLine,
      symbol,
      ticker: parsed.ticker,
      expiry: parsed.expiry,
      strike: parsed.strike,
      optionType: parsed.optionType,
      quantity: Number(qtyRaw),
      avgPrice: parseNumber(avgRaw),
      costBasis: parseNumber(costRaw),
      closePrice: parseNumber(closeRaw),
    });
  }

  // Handle multi-line row format used by IB table extraction.
  for (let i = 0; i < lines.length - 7; i += 1) {
    const symbol = extractOptionSymbol(lines[i]);
    if (!symbol || /^total\b/i.test(lines[i])) continue;

    const openField = normalizeLine(lines[i + 1] ?? "");
    const qtyRaw = normalizeLine(lines[i + 2] ?? "");
    const multRaw = normalizeLine(lines[i + 3] ?? "");
    const avgRaw = normalizeLine(lines[i + 4] ?? "");
    const costRaw = normalizeLine(lines[i + 5] ?? "");
    const closeRaw = normalizeLine(lines[i + 6] ?? "");

    if (openField !== "-") continue;
    if (!/^-?\d+(?:\.\d+)?$/.test(qtyRaw)) continue;
    if (!/^\d+$/.test(multRaw)) continue;
    if (!isNumericToken(avgRaw) || !isNumericToken(costRaw) || !isNumericToken(closeRaw)) continue;

    const parsed = parseIBSymbol(symbol);
    rows.push({
      raw: symbol,
      symbol,
      ticker: parsed.ticker,
      expiry: parsed.expiry,
      strike: parsed.strike,
      optionType: parsed.optionType,
      quantity: Number(qtyRaw),
      avgPrice: parseNumber(avgRaw),
      costBasis: parseNumber(costRaw),
      closePrice: parseNumber(closeRaw),
    });
  }

  const dedup = new Map<string, ParsedIBOpenPosition>();
  for (const row of rows) {
    const key = [row.symbol, row.quantity, row.avgPrice.toFixed(6), row.costBasis.toFixed(2), row.closePrice.toFixed(4)].join("|");
    dedup.set(key, row);
  }

  return [...dedup.values()];
}

function parseRealizedSummary(lines: string[]): ParsedIBSummarySymbol[] {
  const rows: ParsedIBSummarySymbol[] = [];

  // Handle inline rows when the extractor keeps each row in one line.
  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);
    if (!line || /^total/i.test(line)) continue;

    const symbolMatch = line.match(/^([A-Z.]+\s+\d{2}[A-Z]{3}\d{2}\s+[\d.]+\s+[CP])\s+(.+)$/i);
    if (!symbolMatch) continue;

    const [, symbol, rest] = symbolMatch;
    const numericTokens = rest.split(" ").filter((token) => /^-?[\d,]+(?:\.\d+)?$/.test(token));
    if (numericTokens.length < 3) continue;

    const realizedPl = parseNumber(numericTokens[1] ?? "0");
    const unrealizedPl = parseNumber(numericTokens[6] ?? numericTokens[numericTokens.length - 2] ?? "0");
    const totalPl = parseNumber(numericTokens[numericTokens.length - 1] ?? "0");

    rows.push({
      symbol,
      realizedPl,
      unrealizedPl,
      totalPl,
    });
  }

  // Handle multi-line row format where each numeric column is on its own line.
  // Expected numeric sequence after symbol:
  // cost_adj, st_profit, st_loss, lt_profit, lt_loss, realized_total,
  // unrealized_st_profit, unrealized_st_loss, unrealized_lt_profit, unrealized_lt_loss,
  // unrealized_total, total
  for (let i = 0; i < lines.length; i += 1) {
    const symbol = extractOptionSymbol(lines[i]);
    if (!symbol || /^total\b/i.test(lines[i])) continue;

    const numeric: string[] = [];
    for (let j = i + 1; j < Math.min(lines.length, i + 24) && numeric.length < 12; j += 1) {
      const line = normalizeLine(lines[j]);
      if (!line) continue;
      if (extractOptionSymbol(line)) break;
      if (/^activity statement\b/i.test(line) || /^page:\s*\d+/i.test(line)) continue;
      if (/^(symbol|code|realized|unrealized|cost adj\.?|s\/t profit|s\/t loss|l\/t profit|l\/t loss|total)$/i.test(line)) continue;
      if (isNumericToken(line)) {
        numeric.push(line);
      }
    }

    if (numeric.length >= 12) {
      rows.push({
        symbol,
        realizedPl: parseNumber(numeric[5]),
        unrealizedPl: parseNumber(numeric[10]),
        totalPl: parseNumber(numeric[11]),
      });
    }
  }

  const bySymbol = new Map<string, ParsedIBSummarySymbol>();
  for (const row of rows) {
    bySymbol.set(row.symbol, row);
  }

  return [...bySymbol.values()];
}

function sortExecutions(executions: ParsedIBExecution[]): ParsedIBExecution[] {
  return [...executions].sort((a, b) =>
    (a.timestamp ?? "").localeCompare(b.timestamp ?? ""),
  );
}

function normalizeQtyMap(map: Map<string, number>) {
  for (const [key, value] of map.entries()) {
    if (Math.abs(value) < 1e-9) {
      map.delete(key);
    }
  }
}

function findOpenCycleStartIndex(
  executions: ParsedIBExecution[],
  finalQuantitiesBySymbol: Map<string, number>,
): number {
  if (executions.length === 0) return 0;

  const running = new Map(finalQuantitiesBySymbol);
  normalizeQtyMap(running);

  if (running.size === 0) return executions.length;

  let startIndex = 0;
  for (let i = executions.length - 1; i >= 0; i -= 1) {
    const exec = executions[i];
    running.set(exec.symbol, (running.get(exec.symbol) ?? 0) - exec.quantity);
    normalizeQtyMap(running);
    if (running.size === 0) {
      startIndex = i + 1;
      break;
    }
  }

  return startIndex;
}

function splitClosedCycles(executions: ParsedIBExecution[]): ParsedIBExecution[][] {
  const cycles: ParsedIBExecution[][] = [];
  let running = new Map<string, number>();
  let cycle: ParsedIBExecution[] = [];

  for (const exec of executions) {
    cycle.push(exec);
    running.set(exec.symbol, (running.get(exec.symbol) ?? 0) + exec.quantity);
    normalizeQtyMap(running);

    if (running.size === 0) {
      cycles.push(cycle);
      cycle = [];
      running = new Map<string, number>();
    }
  }

  return cycles;
}

function maxAbsQuantity(values: number[]): number {
  if (values.length === 0) return 1;
  return Math.max(...values.map((value) => Math.abs(value)), 1);
}

function dedupStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function safeDateFromTimestamp(value: string | null | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function buildOpenTrade(
  ticker: string,
  expiry: string | null,
  openLegs: ParsedIBOpenPosition[],
  openCycleExecs: ParsedIBExecution[],
): TradeInput {
  const parsedLegs: ParsedLeg[] = openLegs.map((leg) => ({
    ticker: leg.ticker,
    expiry: leg.expiry,
    strike: leg.strike,
    optionType: leg.optionType,
    side: leg.quantity >= 0 ? "BUY" : "SELL",
    quantity: leg.quantity,
  }));

  const detected = detectSpreadFromLegs(parsedLegs);
  const symbolSet = dedupStrings(openLegs.map((leg) => leg.symbol));
  const contracts = maxAbsQuantity(openLegs.map((leg) => leg.quantity));

  const entryDate =
    sortExecutions(openCycleExecs)[0]?.timestamp?.slice(0, 10) ??
    sortExecutions(openCycleExecs)[0]?.timestamp ??
    new Date().toISOString().slice(0, 10);

  const longLegs = openLegs.filter((leg) => leg.quantity > 0);
  const shortLegs = openLegs.filter((leg) => leg.quantity < 0);
  const longLeg = longLegs[0] ?? null;
  const shortLeg = shortLegs[0] ?? null;

  const costBasisOpen = Math.abs(openLegs.reduce((sum, leg) => sum + leg.costBasis, 0));
  const grossCashFlow = openCycleExecs.reduce((sum, exec) => sum + (-exec.quantity * exec.price * 100), 0);
  const commissions = openCycleExecs.reduce((sum, exec) => sum + Math.abs(exec.commission), 0);
  const costBasis = Number((costBasisOpen > 0 ? costBasisOpen : Math.abs(grossCashFlow)).toFixed(2));

  const unrealizedPl = Number(
    openLegs
      .reduce((sum, leg) => {
        const sideMult = leg.quantity >= 0 ? 1 : -1;
        return sum + sideMult * (leg.closePrice - leg.avgPrice) * Math.abs(leg.quantity) * 100;
      }, 0)
      .toFixed(2),
  );

  const strikeLong = longLeg?.strike ?? null;
  const strikeShort = shortLeg?.strike ?? null;
  const maxProfit =
    strikeLong != null && strikeShort != null
      ? Math.max(0, (Math.abs(strikeShort - strikeLong) * 100 * contracts) - costBasis)
      : null;
  const breakeven =
    strikeLong != null && strikeShort != null && contracts > 0
      ? strikeLong + costBasis / (100 * contracts)
      : null;

  const returnPct = costBasis > 0 ? Number(((unrealizedPl / costBasis) * 100).toFixed(2)) : null;
  const avgLongEntry =
    longLegs.length > 0
      ? Number((longLegs.reduce((sum, leg) => sum + leg.avgPrice, 0) / longLegs.length).toFixed(4))
      : null;
  const avgShortEntry =
    shortLegs.length > 0
      ? Number((shortLegs.reduce((sum, leg) => sum + leg.avgPrice, 0) / shortLegs.length).toFixed(4))
      : null;

  return {
    ticker,
    strategy: detected.strategy,
    legs: detected.legs,
    direction: detected.direction,
    entry_date: safeDateFromTimestamp(entryDate),
    expiry_date: expiry,
    status: "OPEN",
    position_type: "option",
    cost_basis: costBasis,
    max_risk: costBasis,
    max_profit: maxProfit,
    realized_pl: null,
    unrealized_pl: unrealizedPl,
    return_pct: returnPct,
    commissions: Number(commissions.toFixed(2)),
    contracts,
    catalyst: "None",
    notes: "Imported from IB statement (open position)",
    lesson: "",
    breakeven,
    stop_loss: strikeLong != null ? strikeLong * 0.965 : null,
    strike_long: strikeLong,
    strike_short: strikeShort,
    // Store average entry prices so live cards/forms can show/edit what was paid/received.
    close_price_long: avgLongEntry,
    close_price_short: avgShortEntry,
    theta_per_day: null,
    urgency: null,
    peak_window: "",
    hold_advice: "",
    exit_trigger: "",
    best_case: "",
    exit_conservative: "",
    exit_balanced: "",
    exit_aggressive: "",
    source: "import",
    ib_symbols: symbolSet,
  };
}

function buildClosedTradeFromCycle(cycle: ParsedIBExecution[]): TradeInput {
  const ordered = sortExecutions(cycle);
  const first = ordered[0];
  const symbolSet = dedupStrings(ordered.map((exec) => exec.symbol));

  const openingLegsBySymbol = new Map<string, ParsedLeg>();
  for (const exec of ordered) {
    if (openingLegsBySymbol.has(exec.symbol)) continue;
    openingLegsBySymbol.set(exec.symbol, {
      ticker: exec.ticker,
      expiry: exec.expiry,
      strike: exec.strike,
      optionType: exec.optionType,
      side: exec.quantity >= 0 ? "BUY" : "SELL",
      quantity: exec.quantity,
    });
  }

  const openingLegs = [...openingLegsBySymbol.values()];
  const detected = detectSpreadFromLegs(openingLegs);
  const contracts = maxAbsQuantity(openingLegs.map((leg) => leg.quantity));

  const longLeg = openingLegs.find((leg) => leg.side === "BUY") ?? null;
  const shortLeg = openingLegs.find((leg) => leg.side === "SELL") ?? null;
  const strikeLong = longLeg?.strike ?? null;
  const strikeShort = shortLeg?.strike ?? null;

  const grossCashFlow = ordered.reduce((sum, exec) => sum + (-exec.quantity * exec.price * 100), 0);
  const commissions = ordered.reduce((sum, exec) => sum + Math.abs(exec.commission), 0);
  const realizedPl = Number((grossCashFlow - commissions).toFixed(2));

  // Estimate peak capital tied up over the cycle by tracking running cashflow.
  let runningCash = 0;
  let minRunningCash = 0;
  for (const exec of ordered) {
    runningCash += -exec.quantity * exec.price * 100;
    if (runningCash < minRunningCash) minRunningCash = runningCash;
  }
  let costBasis = Math.abs(minRunningCash);
  if (costBasis < 0.01) {
    costBasis = Math.max(Math.abs(grossCashFlow), Math.abs(realizedPl), 1);
  }
  costBasis = Number(costBasis.toFixed(2));

  const maxProfit =
    strikeLong != null && strikeShort != null
      ? Math.max(0, (Math.abs(strikeShort - strikeLong) * 100 * contracts) - costBasis)
      : null;

  const returnPct = costBasis > 0 ? Number(((realizedPl / costBasis) * 100).toFixed(2)) : null;

  return {
    ticker: first.ticker,
    strategy: detected.strategy,
    legs: detected.legs,
    direction: detected.direction,
    entry_date: safeDateFromTimestamp(first.timestamp),
    expiry_date: first.expiry,
    status: realizedPl >= 0 ? "WIN" : "LOSS",
    position_type: "option",
    cost_basis: costBasis,
    max_risk: costBasis,
    max_profit: maxProfit,
    realized_pl: realizedPl,
    unrealized_pl: null,
    return_pct: returnPct,
    commissions: Number(commissions.toFixed(2)),
    contracts,
    catalyst: "None",
    notes: "Imported from IB statement (closed cycle)",
    lesson: "",
    breakeven:
      strikeLong != null && strikeShort != null && contracts > 0
        ? strikeLong + costBasis / (100 * contracts)
        : null,
    stop_loss: strikeLong != null ? strikeLong * 0.965 : null,
    strike_long: strikeLong,
    strike_short: strikeShort,
    close_price_long: null,
    close_price_short: null,
    theta_per_day: null,
    urgency: null,
    peak_window: "",
    hold_advice: "",
    exit_trigger: "",
    best_case: "",
    exit_conservative: "",
    exit_balanced: "",
    exit_aggressive: "",
    source: "import",
    ib_symbols: symbolSet,
  };
}

function groupDetectedTrades(
  executions: ParsedIBExecution[],
  openPositions: ParsedIBOpenPosition[],
  summaryBySymbol: ParsedIBSummarySymbol[],
): TradeInput[] {
  const trades: TradeInput[] = [];
  const executionsByRoot = new Map<string, ParsedIBExecution[]>();
  for (const exec of executions) {
    const key = exec.ticker;
    const bucket = executionsByRoot.get(key) ?? [];
    bucket.push(exec);
    executionsByRoot.set(key, bucket);
  }

  const openLegsByRoot = new Map<string, ParsedIBOpenPosition[]>();
  for (const leg of openPositions) {
    const key = leg.ticker;
    const bucket = openLegsByRoot.get(key) ?? [];
    bucket.push(leg);
    openLegsByRoot.set(key, bucket);
  }

  const allRoots = new Set<string>([
    ...executionsByRoot.keys(),
    ...openLegsByRoot.keys(),
  ]);

  for (const key of allRoots) {
    const ticker = key;
    const rootExecutions = sortExecutions(executionsByRoot.get(key) ?? []);
    const rootOpenLegs = openLegsByRoot.get(key) ?? [];

    let closedExecutions = rootExecutions;

    if (rootOpenLegs.length > 0) {
      const finalQtyBySymbol = new Map<string, number>();
      for (const leg of rootOpenLegs) {
        finalQtyBySymbol.set(leg.symbol, (finalQtyBySymbol.get(leg.symbol) ?? 0) + leg.quantity);
      }
      normalizeQtyMap(finalQtyBySymbol);

      const openStartIndex = findOpenCycleStartIndex(rootExecutions, finalQtyBySymbol);
      const openCycleExecutions = rootExecutions.slice(openStartIndex);
      const expiries = dedupStrings(
        rootOpenLegs
          .map((leg) => leg.expiry)
          .filter((value): value is string => Boolean(value)),
      );
      const expiry = expiries.length === 1 ? expiries[0] : null;
      trades.push(
        buildOpenTrade(
          ticker,
          expiry,
          rootOpenLegs,
          openCycleExecutions.length > 0 ? openCycleExecutions : rootExecutions,
        ),
      );
      closedExecutions = rootExecutions.slice(0, openStartIndex);
    }

    const closedCycles = splitClosedCycles(closedExecutions);
    for (const cycle of closedCycles) {
      if (cycle.length === 0) continue;
      trades.push(buildClosedTradeFromCycle(cycle));
    }
  }

  trades.sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  void summaryBySymbol;
  return trades;
}

export function parseIBStatementText(text: string): ParsedIBStatement {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const netAssetLines = extractSection(lines, ["Net Asset Value"], ["Mark-to-Market", "Realized & Unrealized"]);
  const cashReportLines = extractSection(lines, ["Cash Report"], ["Open Positions", "Trades", "Interest Accruals"]);
  const tradesLines = extractSection(lines, ["Trades"], ["Cash Report", "Open Positions", "Interest Accruals"]);
  const openPosLines = extractSection(lines, ["Open Positions"], ["Trades", "Cash Report", "Realized & Unrealized"]);
  const summaryLines = extractSection(lines, ["Realized & Unrealized Performance Summary"], ["Open Positions", "Cash Report", "Interest Accruals"]);

  const account = {
    ...parseNetAssetValue(netAssetLines),
    ...parseCashReport(cashReportLines),
  };
  const executions = parseTradesSection(tradesLines);
  const openPositions = parseOpenPositionsSection(openPosLines);
  const summaryBySymbol = parseRealizedSummary(summaryLines);
  const detectedTrades = groupDetectedTrades(executions, openPositions, summaryBySymbol);

  const errors: string[] = [];

  if (netAssetLines.length === 0) {
    errors.push("Net Asset Value section was not detected.");
  }
  if (executions.length === 0) {
    errors.push("No trades detected in Trades section.");
  }
  if (openPosLines.length > 0 && openPositions.length === 0) {
    errors.push("Open Positions section found, but no rows were parsed.");
  }

  return {
    account,
    executions,
    openPositions,
    summaryBySymbol,
    detectedTrades,
    errors,
  };
}

export async function parseIBStatementPdf(buffer: Buffer): Promise<ParsedIBStatement> {
  const pdfParseModule = await import("pdf-parse");
  const pdfParse = pdfParseModule.default;
  const parsed = await pdfParse(buffer);
  return parseIBStatementText(parsed.text);
}
