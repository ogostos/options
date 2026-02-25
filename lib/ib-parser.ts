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

function parseNumber(raw: string): number {
  const normalized = raw.replace(/,/g, "").trim();
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function isNumericToken(value: string): boolean {
  return /^-?[\d,]+(?:\.\d+)?$/.test(value.trim());
}

function normalizeLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
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

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    const label = parts[0]?.toLowerCase();
    const values = parts.slice(1).filter((token) => /^-?[\d,]+(?:\.\d+)?$/.test(token)).map(parseNumber);

    if (values.length < 2) continue;

    if (label === "cash") {
      payload.cash_start = values[0] ?? 0;
      payload.cash_end = values[Math.min(values.length - 2, 3)] ?? values[values.length - 1] ?? 0;
      payload.cash_settled = values[values.length - 1] ?? payload.cash_end;
    }

    if (label === "stock") {
      payload.stock_long = values[1] ?? values[values.length - 2] ?? 0;
      payload.stock_short = 0;
      payload.stock_total = values[Math.min(values.length - 2, 3)] ?? values[values.length - 1] ?? 0;
    }

    if (label === "options") {
      payload.options_long = values[1] ?? 0;
      payload.options_short = values[2] ?? 0;
      payload.options_total = values[Math.min(values.length - 2, 3)] ?? values[values.length - 1] ?? 0;
    }

    if (label === "total") {
      payload.start_nav = values[0] ?? 0;
      payload.end_nav = values[Math.min(values.length - 2, 3)] ?? values[values.length - 1] ?? 0;
      const change = values[values.length - 1] ?? 0;
      if (payload.start_nav) {
        payload.twr = Number(((change / payload.start_nav) * 100).toFixed(2));
      }
    }
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

function groupDetectedTrades(
  executions: ParsedIBExecution[],
  openPositions: ParsedIBOpenPosition[],
  summaryBySymbol: ParsedIBSummarySymbol[],
): TradeInput[] {
  const groups = new Map<string, ParsedIBExecution[]>();

  for (const exec of executions) {
    const dateKey = exec.timestamp?.slice(0, 10) ?? "unknown";
    const key = `${exec.ticker}|${exec.expiry ?? "na"}|${dateKey}`;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(exec);
    } else {
      groups.set(key, [exec]);
    }
  }

  const summaryMap = new Map(summaryBySymbol.map((row) => [row.symbol, row] as const));

  const trades: TradeInput[] = [];

  for (const [, bucket] of groups) {
    const first = bucket[0];
    const legs: ParsedLeg[] = bucket.map((item) => ({
      ticker: item.ticker,
      expiry: item.expiry,
      strike: item.strike,
      optionType: item.optionType,
      side: item.side,
      quantity: item.quantity,
    }));

    const detected = detectSpreadFromLegs(legs);
    const symbolSet = [...new Set(bucket.map((item) => item.symbol))];

    const entryDate =
      bucket
        .map((item) => item.timestamp?.slice(0, 10))
        .filter((value): value is string => Boolean(value))
        .sort()[0] ?? new Date().toISOString().slice(0, 10);

    const netContracts = bucket.reduce((sum, item) => sum + item.quantity, 0);
    const isOpen = netContracts !== 0;

    const grossCost = bucket.reduce((sum, item) => sum + Math.abs(item.quantity * item.price * 100), 0);
    const commissions = bucket.reduce((sum, item) => sum + Math.abs(item.commission), 0);

    let realizedPl: number | null = null;
    if (!isOpen) {
      const symbolMatch = symbolSet.map((symbol) => summaryMap.get(symbol)).find(Boolean);
      realizedPl = symbolMatch ? symbolMatch.totalPl : 0;
    }

    const relevantOpen = openPositions.filter((pos) => symbolSet.includes(pos.symbol));
    const longLeg = relevantOpen.find((pos) => pos.quantity > 0) ?? null;
    const shortLeg = relevantOpen.find((pos) => pos.quantity < 0) ?? null;

    const unrealizedPl = isOpen
      ? relevantOpen.reduce((sum, pos) => {
          const sideMult = pos.quantity >= 0 ? 1 : -1;
          return sum + sideMult * (pos.closePrice - pos.avgPrice) * Math.abs(pos.quantity) * 100;
        }, 0)
      : null;

    const costBasisFromOpen =
      relevantOpen.length > 0
        ? Math.abs(relevantOpen.reduce((sum, pos) => sum + pos.costBasis, 0))
        : grossCost;

    const costBasis = Number(costBasisFromOpen.toFixed(2));

    const strikeLong = longLeg?.strike ?? null;
    const strikeShort = shortLeg?.strike ?? null;

    const maxRisk = costBasis;
    const maxProfit =
      strikeLong != null && strikeShort != null
        ? Math.max(0, (Math.abs(strikeShort - strikeLong) * 100 * detected.contracts) - costBasis)
        : null;

    const returnPct =
      realizedPl != null
        ? (realizedPl / (costBasis || 1)) * 100
        : unrealizedPl != null
          ? (unrealizedPl / (costBasis || 1)) * 100
          : null;

    const hasLongAndShort = strikeLong != null && strikeShort != null;
    const breakeven = hasLongAndShort ? strikeLong + costBasis / (100 * detected.contracts) : null;

    trades.push({
      ticker: first.ticker,
      strategy: detected.strategy,
      legs: detected.legs,
      direction: detected.direction,
      entry_date: entryDate,
      expiry_date: first.expiry,
      status: isOpen ? "OPEN" : realizedPl != null && realizedPl >= 0 ? "WIN" : "LOSS",
      position_type: "option",
      cost_basis: costBasis,
      max_risk: maxRisk,
      max_profit: maxProfit,
      realized_pl: realizedPl,
      unrealized_pl: unrealizedPl,
      return_pct: returnPct != null ? Number(returnPct.toFixed(2)) : null,
      commissions: Number(commissions.toFixed(2)),
      contracts: detected.contracts,
      catalyst: "None",
      notes: "Imported from IB statement",
      lesson: "",
      breakeven,
      stop_loss: strikeLong != null ? strikeLong * 0.965 : null,
      strike_long: strikeLong,
      strike_short: strikeShort,
      close_price_long: longLeg?.closePrice ?? null,
      close_price_short: shortLeg?.closePrice ?? null,
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
    });
  }

  return trades;
}

export function parseIBStatementText(text: string): ParsedIBStatement {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const netAssetLines = extractSection(lines, ["Net Asset Value"], ["Mark-to-Market", "Realized & Unrealized"]);
  const tradesLines = extractSection(lines, ["Trades"], ["Cash Report", "Open Positions", "Interest Accruals"]);
  const openPosLines = extractSection(lines, ["Open Positions"], ["Trades", "Cash Report", "Realized & Unrealized"]);
  const summaryLines = extractSection(lines, ["Realized & Unrealized Performance Summary"], ["Open Positions", "Cash Report", "Interest Accruals"]);

  const account = parseNetAssetValue(netAssetLines);
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
