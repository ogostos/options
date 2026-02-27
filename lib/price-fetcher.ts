import type { DashboardSettings, PriceResponse } from "@/lib/types";

import type { OptionQuoteMap } from "@/lib/live-position-metrics";

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

export interface ParsedIBOptionSymbol {
  raw: string;
  ticker: string;
  expiry: string;
  strike: number;
  optionType: "C" | "P";
}

export interface OptionContractQuote {
  mark: number;
  bid: number | null;
  ask: number | null;
  last: number | null;
  source: string;
}

interface MassiveConfig {
  apiKey: string;
  baseUrl: string;
}

export interface DebugProbeResult<T> {
  ok: boolean;
  status: number | null;
  url: string | null;
  value: T | null;
  raw: unknown;
  error: string | null;
}

interface YahooOptionContract {
  strike?: number;
  regularMarketPrice?: number;
  bid?: number;
  ask?: number;
  lastPrice?: number;
}

export interface PriceSourceDebugPayload {
  ticker: string;
  optionSymbol: string | null;
  parsedOption: ParsedIBOptionSymbol | null;
  stock: {
    massive: DebugProbeResult<{ price: number }>;
    yahoo: DebugProbeResult<{ price: number }>;
  };
  option: {
    massive: DebugProbeResult<OptionContractQuote>;
    yahoo: DebugProbeResult<OptionContractQuote>;
  } | null;
}

function parseYahooPrice(data: unknown): number | null {
  const maybe = data as {
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: number;
          previousClose?: number;
        };
      }>;
    };
  };

  const result = maybe.chart?.result?.[0];
  if (!result) return null;
  return result.meta?.regularMarketPrice ?? result.meta?.previousClose ?? null;
}

function parseDateCode(code: string): string | null {
  const match = code.match(/^(\d{2})([A-Z]{3})(\d{2})$/);
  if (!match) return null;
  const [, dd, mon, yy] = match;
  const mm = MONTHS[mon];
  if (!mm) return null;
  return `20${yy}-${mm}-${dd}`;
}

function parseIBOptionSymbol(raw: string): ParsedIBOptionSymbol | null {
  const normalized = raw.trim().toUpperCase();
  const match = normalized.match(/^([A-Z.]+)\s+(\d{2}[A-Z]{3}\d{2})\s+(\d+(?:\.\d+)?)\s+([CP])$/);
  if (!match) return null;

  const [, ticker, dateCode, strikeRaw, optionType] = match;
  const expiry = parseDateCode(dateCode);
  const strike = Number(strikeRaw);

  if (!expiry || !Number.isFinite(strike)) return null;
  return {
    raw: normalized,
    ticker,
    expiry,
    strike,
    optionType: optionType as "C" | "P",
  };
}

function markFromContract(contract: {
  regularMarketPrice?: number;
  bid?: number;
  ask?: number;
  lastPrice?: number;
}): number | null {
  const bid = contract.bid ?? 0;
  const ask = contract.ask ?? 0;
  if (bid > 0 && ask > 0) return Number(((bid + ask) / 2).toFixed(4));
  const candidates = [contract.regularMarketPrice, contract.lastPrice, contract.bid, contract.ask];
  for (const candidate of candidates) {
    if (candidate != null && Number.isFinite(candidate) && candidate > 0) return Number(candidate.toFixed(4));
  }
  return null;
}

function resolveMassiveConfig(): MassiveConfig {
  const apiKey = (process.env.MASSIVE_API_KEY ?? process.env.POLYGON_API_KEY ?? "").trim();
  const rawBase = (process.env.MASSIVE_API_BASE_URL ?? process.env.POLYGON_API_BASE_URL ?? "https://api.massive.com").trim();
  const baseUrl = rawBase.replace(/\/+$/, "");
  return {
    apiKey,
    baseUrl,
  };
}

function parseMassiveSnapshot(data: unknown): OptionContractQuote | null {
  const json = data as {
    results?: {
      last_quote?: {
        bid?: number;
        ask?: number;
      };
      last_trade?: {
        price?: number;
      };
      day?: {
        close?: number;
      };
    };
  };

  const bid = json.results?.last_quote?.bid ?? null;
  const ask = json.results?.last_quote?.ask ?? null;
  const last = json.results?.last_trade?.price ?? json.results?.day?.close ?? null;
  const mark =
    bid != null && ask != null && bid > 0 && ask > 0
      ? Number(((bid + ask) / 2).toFixed(4))
      : last != null && Number.isFinite(last) && last > 0
        ? Number(last.toFixed(4))
        : null;

  if (mark == null) return null;
  return {
    mark,
    bid,
    ask,
    last,
    source: "massive-options",
  };
}

function pickYahooContract(contracts: YahooOptionContract[] | undefined, strike: number): YahooOptionContract | null {
  if (!contracts || contracts.length === 0) return null;
  const exact =
    contracts.find((item) => {
      const itemStrike = item.strike;
      if (itemStrike == null || !Number.isFinite(itemStrike)) return false;
      return Math.abs(itemStrike - strike) < 0.0001;
    }) ?? null;
  if (exact) return exact;

  const nearest = contracts
    .filter((item) => item.strike != null && Number.isFinite(item.strike))
    .sort((a, b) => Math.abs((a.strike ?? 0) - strike) - Math.abs((b.strike ?? 0) - strike))[0];
  if (!nearest) return null;

  const nearestStrike = nearest.strike;
  if (nearestStrike == null || Math.abs(nearestStrike - strike) > 0.5) return null;
  return nearest;
}

async function fetchJsonDebug(url: string, init?: RequestInit): Promise<{
  ok: boolean;
  status: number;
  raw: unknown;
  error: string | null;
}> {
  try {
    const resp = await fetch(url, { cache: "no-store", ...init });
    const text = await resp.text();
    let raw: unknown = null;
    if (text.length > 0) {
      try {
        raw = JSON.parse(text) as unknown;
      } catch {
        raw = text;
      }
    }
    return {
      ok: resp.ok,
      status: resp.status,
      raw,
      error: resp.ok ? null : `HTTP ${resp.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      raw: null,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

async function fetchYahooTicker(ticker: string): Promise<number | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
  const resp = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    },
  });
  if (!resp.ok) return null;
  const json = (await resp.json()) as unknown;
  return parseYahooPrice(json);
}

async function fetchMassiveTicker(ticker: string, config: MassiveConfig): Promise<number | null> {
  const { apiKey, baseUrl } = config;
  if (!apiKey) return null;
  const url = `${baseUrl}/v2/last/trade/${encodeURIComponent(ticker)}?apiKey=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) return null;
  const json = (await resp.json()) as { results?: { p?: number } };
  const price = json.results?.p;
  return price != null && Number.isFinite(price) ? Number(price.toFixed(4)) : null;
}

async function fetchYahooOptionChain(ticker: string, expiryUnix: number) {
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}?date=${expiryUnix}`;
  const resp = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    },
  });
  if (!resp.ok) return null;
  return (await resp.json()) as {
    optionChain?: {
      result?: Array<{
        options?: Array<{
          calls?: Array<{
            strike?: number;
            regularMarketPrice?: number;
            bid?: number;
            ask?: number;
            lastPrice?: number;
          }>;
          puts?: Array<{
            strike?: number;
            regularMarketPrice?: number;
            bid?: number;
            ask?: number;
            lastPrice?: number;
          }>;
        }>;
      }>;
    };
  };
}

function toMassiveOptionTicker(leg: ParsedIBOptionSymbol): string {
  const [yyyy, mm, dd] = leg.expiry.split("-");
  const yy = yyyy.slice(-2);
  const strikeScaled = Math.round(leg.strike * 1000);
  const strikePart = String(strikeScaled).padStart(8, "0");
  return `O:${leg.ticker}${yy}${mm}${dd}${leg.optionType}${strikePart}`;
}

async function fetchMassiveOptionQuote(
  leg: ParsedIBOptionSymbol,
  config: MassiveConfig,
): Promise<OptionContractQuote | null> {
  const { apiKey, baseUrl } = config;
  if (!apiKey) return null;
  const contractTicker = toMassiveOptionTicker(leg);
  const url = `${baseUrl}/v3/snapshot/options/${encodeURIComponent(leg.ticker)}/${encodeURIComponent(contractTicker)}?apiKey=${encodeURIComponent(apiKey)}`;

  const resp = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!resp.ok) return null;
  const json = (await resp.json()) as unknown;
  return parseMassiveSnapshot(json);
}

export async function probePriceSources(tickerInput: string, optionSymbolInput?: string): Promise<PriceSourceDebugPayload> {
  const ticker = tickerInput.trim().toUpperCase();
  const optionSymbol = optionSymbolInput?.trim().toUpperCase() || null;
  const parsedOption = optionSymbol ? parseIBOptionSymbol(optionSymbol) : null;
  const massiveConfig = resolveMassiveConfig();

  const massiveStockUrl = massiveConfig.apiKey
    ? `${massiveConfig.baseUrl}/v2/last/trade/${encodeURIComponent(ticker)}?apiKey=${encodeURIComponent(massiveConfig.apiKey)}`
    : null;
  const yahooStockUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;

  const [massiveStockResp, yahooStockResp] = await Promise.all([
    massiveStockUrl
      ? fetchJsonDebug(massiveStockUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
        })
      : Promise.resolve({ ok: false, status: 0, raw: null, error: "MASSIVE_API_KEY is not set" }),
    fetchJsonDebug(yahooStockUrl, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    }),
  ]);

  const massiveStockPrice = (() => {
    const json = massiveStockResp.raw as { results?: { p?: number } } | null;
    const p = json?.results?.p;
    return p != null && Number.isFinite(p) ? Number(p.toFixed(4)) : null;
  })();
  const yahooStockPrice = parseYahooPrice(yahooStockResp.raw);

  let option: PriceSourceDebugPayload["option"] = null;
  if (optionSymbol) {
    if (!parsedOption) {
      option = {
        massive: {
          ok: false,
          status: null,
          url: null,
          value: null,
          raw: null,
          error: "Invalid IB option symbol format. Example: ADBE 17APR26 450 C",
        },
        yahoo: {
          ok: false,
          status: null,
          url: null,
          value: null,
          raw: null,
          error: "Invalid IB option symbol format. Example: ADBE 17APR26 450 C",
        },
      };
    } else {
      const contractTicker = toMassiveOptionTicker(parsedOption);
      const massiveOptionUrl = massiveConfig.apiKey
        ? `${massiveConfig.baseUrl}/v3/snapshot/options/${encodeURIComponent(parsedOption.ticker)}/${encodeURIComponent(contractTicker)}?apiKey=${encodeURIComponent(massiveConfig.apiKey)}`
        : null;
      const expiryUnix = Math.floor(new Date(`${parsedOption.expiry}T00:00:00Z`).getTime() / 1000);
      const yahooOptionUrl = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(parsedOption.ticker)}?date=${expiryUnix}`;

      const [massiveOptionResp, yahooOptionResp] = await Promise.all([
        massiveOptionUrl
          ? fetchJsonDebug(massiveOptionUrl, {
              method: "GET",
              headers: { Accept: "application/json" },
            })
          : Promise.resolve({ ok: false, status: 0, raw: null, error: "MASSIVE_API_KEY is not set" }),
        fetchJsonDebug(yahooOptionUrl, {
          method: "GET",
          headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        }),
      ]);

      const massiveOptionQuote = parseMassiveSnapshot(massiveOptionResp.raw);
      const yahooChain = yahooOptionResp.raw as {
        optionChain?: {
          result?: Array<{
            options?: Array<{
              calls?: YahooOptionContract[];
              puts?: YahooOptionContract[];
            }>;
          }>;
        };
      } | null;
      const optionSet = yahooChain?.optionChain?.result?.[0]?.options?.[0];
      const contracts = parsedOption.optionType === "C" ? optionSet?.calls : optionSet?.puts;
      const matched = pickYahooContract(contracts, parsedOption.strike);
      const matchedMark = matched ? markFromContract(matched) : null;
      const yahooOptionQuote =
        matched && matchedMark != null
          ? {
              mark: matchedMark,
              bid: matched.bid ?? null,
              ask: matched.ask ?? null,
              last: matched.lastPrice ?? null,
              source: "yahoo-options",
            }
          : null;

      option = {
        massive: {
          ok: massiveOptionResp.ok && massiveOptionQuote != null,
          status: massiveOptionResp.status,
          url: massiveOptionUrl,
          value: massiveOptionQuote,
          raw: massiveOptionResp.raw,
          error: massiveOptionQuote == null ? massiveOptionResp.error ?? "No option quote in snapshot" : null,
        },
        yahoo: {
          ok: yahooOptionResp.ok && yahooOptionQuote != null,
          status: yahooOptionResp.status,
          url: yahooOptionUrl,
          value: yahooOptionQuote,
          raw: {
            matchedContract: matched ?? null,
            contractsInChain: contracts?.length ?? 0,
            rawResultMeta: {
              hasResult: Boolean(yahooChain?.optionChain?.result?.length),
              hasOptions: Boolean(optionSet),
            },
          },
          error: yahooOptionQuote == null ? yahooOptionResp.error ?? "No matching Yahoo option contract found" : null,
        },
      };
    }
  }

  return {
    ticker,
    optionSymbol,
    parsedOption,
    stock: {
      massive: {
        ok: massiveStockResp.ok && massiveStockPrice != null,
        status: massiveStockResp.status,
        url: massiveStockUrl,
        value: massiveStockPrice != null ? { price: massiveStockPrice } : null,
        raw: massiveStockResp.raw,
        error: massiveStockPrice == null ? massiveStockResp.error ?? "No last trade price found" : null,
      },
      yahoo: {
        ok: yahooStockResp.ok && yahooStockPrice != null,
        status: yahooStockResp.status,
        url: yahooStockUrl,
        value: yahooStockPrice != null ? { price: Number(yahooStockPrice.toFixed(4)) } : null,
        raw: yahooStockResp.raw,
        error: yahooStockPrice == null ? yahooStockResp.error ?? "No Yahoo stock price found" : null,
      },
    },
    option,
  };
}

export async function fetchLivePrices(
  tickers: string[],
  settings: DashboardSettings,
): Promise<PriceResponse> {
  const uniqueTickers = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  const source = settings.price_api === "manual" ? "manual" : "yahoo";
  const massiveConfig = resolveMassiveConfig();

  const entries = await Promise.all(
    uniqueTickers.map(async (ticker) => {
      let price: number | null = null;
      let used: string = source;

      if (source === "manual") {
        return [ticker, null] as const;
      }

      if (massiveConfig.apiKey) {
        price = await fetchMassiveTicker(ticker, massiveConfig);
        if (price != null) {
          used = "massive";
        }
      }

      if (price == null) {
        price = await fetchYahooTicker(ticker);
        used = "yahoo";
      }

      if (price == null) return [ticker, null] as const;

      return [
        ticker,
        {
          price,
          source: used,
          updatedAt: new Date().toISOString(),
        },
      ] as const;
    }),
  );

  const response: PriceResponse = {};
  for (const [ticker, payload] of entries) {
    if (payload) {
      response[ticker] = payload;
    }
  }
  return response;
}

export async function fetchLiveOptionQuotes(
  optionSymbols: string[],
  settings?: DashboardSettings,
): Promise<OptionQuoteMap> {
  const parsed = optionSymbols
    .map((symbol) => parseIBOptionSymbol(symbol))
    .filter((value): value is ParsedIBOptionSymbol => Boolean(value));

  const uniqueGroups = new Map<string, ParsedIBOptionSymbol[]>();
  for (const leg of parsed) {
    const key = `${leg.ticker}|${leg.expiry}`;
    const bucket = uniqueGroups.get(key) ?? [];
    bucket.push(leg);
    uniqueGroups.set(key, bucket);
  }

  const chainCache = new Map<string, Awaited<ReturnType<typeof fetchYahooOptionChain>>>();

  await Promise.all(
    [...uniqueGroups.keys()].map(async (key) => {
      const [ticker, expiry] = key.split("|");
      const unix = Math.floor(new Date(`${expiry}T00:00:00Z`).getTime() / 1000);
      if (!Number.isFinite(unix) || unix <= 0) return;
      const chain = await fetchYahooOptionChain(ticker, unix);
      chainCache.set(key, chain);
    }),
  );

  const out: OptionQuoteMap = {};
  const massiveConfig = resolveMassiveConfig();
  for (const leg of parsed) {
    const key = `${leg.ticker}|${leg.expiry}`;
    const chain = chainCache.get(key);
    const optionSet = chain?.optionChain?.result?.[0]?.options?.[0];
    const contracts = leg.optionType === "C" ? optionSet?.calls : optionSet?.puts;
    const updatedAt = new Date().toISOString();

    if (massiveConfig.apiKey) {
      const massiveQuote = await fetchMassiveOptionQuote(leg, massiveConfig);
      if (massiveQuote) {
        out[leg.raw] = {
          ...massiveQuote,
          updatedAt,
        };
        continue;
      }
    }

    if (contracts) {
      const contract = pickYahooContract(contracts, leg.strike);

      if (contract != null) {
        const mark = markFromContract(contract);
        if (mark != null) {
          out[leg.raw] = {
            mark,
            bid: contract.bid ?? null,
            ask: contract.ask ?? null,
            last: contract.lastPrice ?? null,
            source: "yahoo-options",
            updatedAt,
          };
          continue;
        }
      }
    }

    // No further provider fallback for option quotes.
    void settings;
  }

  return out;
}
