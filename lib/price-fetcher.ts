import type { DashboardSettings, PriceResponse } from "@/lib/types";

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
