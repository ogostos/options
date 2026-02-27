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

interface ParsedIBOptionSymbol {
  raw: string;
  ticker: string;
  expiry: string;
  strike: number;
  optionType: "C" | "P";
}

interface OptionContractQuote {
  mark: number;
  bid: number | null;
  ask: number | null;
  last: number | null;
  source: string;
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

async function fetchAlphaVantageTicker(ticker: string, key: string): Promise<number | null> {
  if (!key) return null;
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(key)}`;
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) return null;
  const json = (await resp.json()) as { "Global Quote"?: { "05. price"?: string } };
  const raw = json["Global Quote"]?.["05. price"];
  if (!raw) return null;
  const price = Number(raw);
  return Number.isFinite(price) ? price : null;
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

function toPolygonOptionTicker(leg: ParsedIBOptionSymbol): string {
  const [yyyy, mm, dd] = leg.expiry.split("-");
  const yy = yyyy.slice(-2);
  const strikeScaled = Math.round(leg.strike * 1000);
  const strikePart = String(strikeScaled).padStart(8, "0");
  return `O:${leg.ticker}${yy}${mm}${dd}${leg.optionType}${strikePart}`;
}

async function fetchPolygonOptionQuote(
  leg: ParsedIBOptionSymbol,
  apiKey: string,
): Promise<OptionContractQuote | null> {
  if (!apiKey) return null;
  const contractTicker = toPolygonOptionTicker(leg);
  const url = `https://api.polygon.io/v3/snapshot/options/${encodeURIComponent(leg.ticker)}/${encodeURIComponent(contractTicker)}?apiKey=${encodeURIComponent(apiKey)}`;

  const resp = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!resp.ok) return null;
  const json = (await resp.json()) as {
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
    source: "polygon-options",
  };
}

export async function fetchLivePrices(
  tickers: string[],
  settings: DashboardSettings,
): Promise<PriceResponse> {
  const uniqueTickers = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  const source = settings.price_api;

  const entries = await Promise.all(
    uniqueTickers.map(async (ticker) => {
      let price: number | null = null;
      let used = source;

      if (source === "manual") {
        return [ticker, null] as const;
      }

      if (source === "yahoo") {
        price = await fetchYahooTicker(ticker);
        if (price == null && settings.alpha_vantage_key) {
          price = await fetchAlphaVantageTicker(ticker, settings.alpha_vantage_key);
          used = "alphavantage";
        }
      }

      if (source === "alphavantage") {
        price = await fetchAlphaVantageTicker(ticker, settings.alpha_vantage_key);
        if (price == null) {
          price = await fetchYahooTicker(ticker);
          used = "yahoo";
        }
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
  const polygonKey = process.env.POLYGON_API_KEY ?? "";
  for (const leg of parsed) {
    const key = `${leg.ticker}|${leg.expiry}`;
    const chain = chainCache.get(key);
    const optionSet = chain?.optionChain?.result?.[0]?.options?.[0];
    const contracts = leg.optionType === "C" ? optionSet?.calls : optionSet?.puts;
    const updatedAt = new Date().toISOString();

    if (contracts) {
      const contract =
        contracts.find((item) => {
          const strike = item.strike;
          if (strike == null || !Number.isFinite(strike)) return false;
          return Math.abs(strike - leg.strike) < 0.0001;
        }) ??
        contracts
          .filter((item) => item.strike != null && Number.isFinite(item.strike))
          .sort((a, b) => Math.abs((a.strike ?? 0) - leg.strike) - Math.abs((b.strike ?? 0) - leg.strike))[0];

      if (contract != null) {
        const strike = contract.strike;
        if (strike != null && Math.abs(strike - leg.strike) <= 0.5) {
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
    }

    // Optional fallback: Polygon delayed option snapshot if POLYGON_API_KEY is set.
    const polygonQuote = polygonKey
      ? await fetchPolygonOptionQuote(leg, polygonKey)
      : null;
    if (polygonQuote) {
      out[leg.raw] = {
        ...polygonQuote,
        updatedAt,
      };
      continue;
    }

    // Optional fallback: if user selected AlphaVantage and no option quote providers succeeded.
    void settings;
  }

  return out;
}
