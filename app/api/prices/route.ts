import { NextRequest, NextResponse } from "next/server";

import { getSettings } from "@/lib/db";
import { fetchLiveOptionQuotes, fetchLivePrices } from "@/lib/price-fetcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseTickers(request: NextRequest, bodyTickers?: unknown): string[] {
  if (Array.isArray(bodyTickers)) {
    return bodyTickers
      .map((ticker) => String(ticker).trim().toUpperCase())
      .filter((ticker) => ticker.length > 0);
  }

  const raw = request.nextUrl.searchParams.get("tickers") ?? "";
  return raw
    .split(",")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);
}

function parseOptionSymbols(request: NextRequest, bodySymbols?: unknown): string[] {
  if (Array.isArray(bodySymbols)) {
    return bodySymbols
      .map((symbol) => String(symbol).trim().toUpperCase())
      .filter((symbol) => symbol.length > 0);
  }

  const raw = request.nextUrl.searchParams.get("optionSymbols") ?? "";
  return raw
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  try {
    const tickers = parseTickers(request);
    const optionSymbols = parseOptionSymbols(request);
    const settings = await getSettings();
    const [prices, optionQuotes] = await Promise.all([
      tickers.length > 0 ? fetchLivePrices(tickers, settings) : Promise.resolve({}),
      optionSymbols.length > 0 ? fetchLiveOptionQuotes(optionSymbols) : Promise.resolve({}),
    ]);
    return NextResponse.json({ prices, optionQuotes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch prices";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { tickers?: unknown; optionSymbols?: unknown };
    const tickers = parseTickers(request, body.tickers);
    const optionSymbols = parseOptionSymbols(request, body.optionSymbols);
    const settings = await getSettings();
    const [prices, optionQuotes] = await Promise.all([
      tickers.length > 0 ? fetchLivePrices(tickers, settings) : Promise.resolve({}),
      optionSymbols.length > 0 ? fetchLiveOptionQuotes(optionSymbols) : Promise.resolve({}),
    ]);
    return NextResponse.json({ prices, optionQuotes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch prices";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
