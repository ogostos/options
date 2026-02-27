"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PositionCard } from "@/components/PositionCard";
import { Card } from "@/components/ui/primitives";
import { DESIGN, computeDTE, formatSigned } from "@/lib/design";
import { buildLiveOptionSnapshot, getRiskSnapshot, type OptionQuoteMap } from "@/lib/live-position-metrics";
import type { StockPosition, Trade } from "@/lib/types";

interface LiveTabProps {
  openPositions: Trade[];
  stocks: StockPosition[];
  assetFilter: "options" | "stocks" | "all";
}

type LiveSortKey =
  | "dte"
  | "urgency"
  | "risk"
  | "capital"
  | "max_profit"
  | "live_pnl"
  | "ticker";
type SortDirection = "asc" | "desc";

const SORT_STORAGE_KEY = "options-dashboard.live-sort.v1";

function compareNullableNumbers(a: number | null, b: number | null) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

export function LiveTab({ openPositions, stocks, assetFilter }: LiveTabProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [manualInputs, setManualInputs] = useState<Record<string, string>>({});
  const [showManual, setShowManual] = useState(false);
  const [showManualLegMarks, setShowManualLegMarks] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [optionQuotes, setOptionQuotes] = useState<OptionQuoteMap>({});
  const [manualOptionMarks, setManualOptionMarks] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<LiveSortKey>("dte");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const positions = useMemo(
    () => (assetFilter === "stocks" ? [] : openPositions),
    [assetFilter, openPositions],
  );
  const stockRows = useMemo(() => (assetFilter === "options" ? [] : stocks), [assetFilter, stocks]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SORT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { key?: LiveSortKey; direction?: SortDirection };
      if (parsed.key) setSortKey(parsed.key);
      if (parsed.direction) setSortDirection(parsed.direction);
    } catch {
      // ignore invalid persisted settings
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        SORT_STORAGE_KEY,
        JSON.stringify({ key: sortKey, direction: sortDirection }),
      );
    } catch {
      // ignore storage failures
    }
  }, [sortDirection, sortKey]);

  const getPrice = useCallback(
    (ticker: string) => {
      const manual = manualInputs[ticker];
      if (manual != null && manual !== "") {
        const num = Number(manual);
        if (Number.isFinite(num) && num > 0) return num;
      }
      return prices[ticker] ?? null;
    },
    [manualInputs, prices],
  );

  const effectiveOptionQuotes = useMemo(() => {
    const merged: OptionQuoteMap = { ...optionQuotes };
    for (const [symbol, raw] of Object.entries(manualOptionMarks)) {
      const mark = Number(raw);
      if (!Number.isFinite(mark) || mark <= 0) continue;
      merged[symbol] = {
        mark,
        bid: null,
        ask: null,
        last: null,
        source: "manual",
        updatedAt: new Date().toISOString(),
      };
    }
    return merged;
  }, [manualOptionMarks, optionQuotes]);

  const liveSnapshots = useMemo(() => {
    const byId = new Map<
      number,
      {
        riskLevel: number;
        livePnl: number | null;
      }
    >();

    for (const position of positions) {
      const price = getPrice(position.ticker);
      const risk = getRiskSnapshot(position, price);
      const live = buildLiveOptionSnapshot(position, effectiveOptionQuotes);
      byId.set(position.id, {
        riskLevel: risk.level,
        livePnl: live.livePnl,
      });
    }
    return byId;
  }, [effectiveOptionQuotes, getPrice, positions]);

  const sortedPositions = useMemo(() => {
    const list = [...positions];
    list.sort((a, b) => {
      let cmp = 0;

      if (sortKey === "ticker") {
        cmp = a.ticker.localeCompare(b.ticker);
      } else if (sortKey === "dte") {
        cmp = computeDTE(a.expiry_date) - computeDTE(b.expiry_date);
      } else if (sortKey === "urgency") {
        cmp = (a.urgency ?? 0) - (b.urgency ?? 0);
      } else if (sortKey === "risk") {
        const aRisk = liveSnapshots.get(a.id)?.riskLevel ?? 3;
        const bRisk = liveSnapshots.get(b.id)?.riskLevel ?? 3;
        cmp = aRisk - bRisk;
      } else if (sortKey === "capital") {
        cmp = a.max_risk - b.max_risk;
      } else if (sortKey === "max_profit") {
        cmp = compareNullableNumbers(a.max_profit, b.max_profit);
      } else if (sortKey === "live_pnl") {
        const aPnl = liveSnapshots.get(a.id)?.livePnl ?? null;
        const bPnl = liveSnapshots.get(b.id)?.livePnl ?? null;
        cmp = compareNullableNumbers(aPnl, bPnl);
      }

      return sortDirection === "asc" ? cmp : -cmp;
    });
    return list;
  }, [liveSnapshots, positions, sortDirection, sortKey]);

  async function fetchPrices() {
    setLoading(true);
    try {
      const tickers = [...new Set(positions.map((position) => position.ticker))];
      const optionSymbols = [
        ...new Set(
          positions.flatMap((position) =>
            (position.ib_symbols ?? [])
              .map((symbol) => String(symbol).trim().toUpperCase())
              .filter(Boolean),
          ),
        ),
      ];

      const resp = await fetch("/api/prices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tickers, optionSymbols }),
      });

      const data = (await resp.json()) as {
        prices?: Record<string, { price: number }>;
        optionQuotes?: OptionQuoteMap;
      };

      if (data.prices) {
        const next: Record<string, number> = {};
        for (const [ticker, payload] of Object.entries(data.prices)) {
          if (typeof payload?.price === "number") {
            next[ticker] = payload.price;
          }
        }
        setPrices((prev) => ({ ...prev, ...next }));
      }

      if (data.optionQuotes) {
        setOptionQuotes((prev) => ({ ...prev, ...data.optionQuotes }));
      }

      setLastFetch(new Date().toISOString());
    } catch {
      setShowManual(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {positions.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px", alignItems: "center" }}>
            <button
              onClick={fetchPrices}
              disabled={loading}
              style={{
                padding: "5px 14px",
                borderRadius: "4px",
                border: `1px solid ${DESIGN.blue}44`,
                background: `${DESIGN.blue}18`,
                color: DESIGN.blue,
                fontSize: "11px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {loading ? "Fetching..." : "Fetch Prices"}
            </button>
            <button
              onClick={() => setShowManual((value) => !value)}
              style={{
                padding: "5px 14px",
                borderRadius: "4px",
                border: `1px solid ${DESIGN.purple}44`,
                background: showManual ? `${DESIGN.purple}18` : "transparent",
                color: DESIGN.purple,
                fontSize: "11px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Manual
            </button>
            <button
              onClick={() => setShowManualLegMarks((value) => !value)}
              style={{
                padding: "5px 14px",
                borderRadius: "4px",
                border: `1px solid ${DESIGN.cardBorder}`,
                background: showManualLegMarks ? `${DESIGN.blue}14` : "transparent",
                color: showManualLegMarks ? DESIGN.blue : DESIGN.muted,
                fontSize: "11px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Leg Marks
            </button>
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as LiveSortKey)}
              style={{
                padding: "5px 8px",
                borderRadius: "4px",
                border: `1px solid ${DESIGN.cardBorder}`,
                background: "rgba(255,255,255,0.02)",
                color: DESIGN.text,
                fontSize: "11px",
                fontWeight: 600,
              }}
              title="Sort live positions"
            >
              <option value="dte">Sort: DTE</option>
              <option value="risk">Sort: Risk Status</option>
              <option value="urgency">Sort: Urgency</option>
              <option value="capital">Sort: Risk Capital</option>
              <option value="max_profit">Sort: Max Profit</option>
              <option value="live_pnl">Sort: Live P/L</option>
              <option value="ticker">Sort: Ticker</option>
            </select>
            <button
              onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
              style={{
                padding: "5px 10px",
                borderRadius: "4px",
                border: `1px solid ${DESIGN.cardBorder}`,
                background: "rgba(255,255,255,0.02)",
                color: DESIGN.text,
                fontSize: "11px",
                cursor: "pointer",
                fontWeight: 600,
              }}
              title="Toggle sort direction"
            >
              {sortDirection === "asc" ? "Asc" : "Desc"}
            </button>
            <span style={{ fontSize: "10px", color: DESIGN.muted, alignSelf: "center" }}>
              Sort is remembered
            </span>
            {lastFetch && (
              <span style={{ fontSize: "10px", color: DESIGN.muted, alignSelf: "center" }}>
                Updated {new Date(lastFetch).toLocaleTimeString()}
              </span>
            )}
          </div>

          {showManual && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                gap: "6px",
                marginBottom: "8px",
              }}
            >
              {positions.map((position) => (
                <div
                  key={position.ticker}
                  style={{
                    padding: "6px",
                    borderRadius: "6px",
                    background: DESIGN.card,
                    border: `1px solid ${DESIGN.cardBorder}`,
                  }}
                >
                  <div style={{ fontSize: "10px", color: DESIGN.muted, marginBottom: "3px", fontWeight: 600 }}>
                    {position.ticker}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder={prices[position.ticker]?.toFixed(2) ?? "—"}
                    value={manualInputs[position.ticker] ?? ""}
                    onChange={(event) =>
                      setManualInputs((current) => ({
                        ...current,
                        [position.ticker]: event.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      background: "rgba(0,0,0,0.4)",
                      border: `1px solid ${DESIGN.cardBorder}`,
                      borderRadius: "4px",
                      color: DESIGN.text,
                      padding: "4px 6px",
                      fontSize: "12px",
                      fontFamily: DESIGN.mono,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {showManualLegMarks && (
            <div style={{ marginTop: "8px" }}>
              <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
                Manual Option Leg Marks (for live P/L)
              </div>
              <div style={{ display: "grid", gap: "6px" }}>
                {positions.map((position) => {
                  const symbols = (position.ib_symbols ?? []).map((symbol) => String(symbol).trim().toUpperCase()).filter(Boolean);
                  if (symbols.length === 0) return null;
                  return (
                    <div
                      key={`marks-${position.id}`}
                      style={{
                        padding: "8px",
                        borderRadius: "6px",
                        background: DESIGN.card,
                        border: `1px solid ${DESIGN.cardBorder}`,
                      }}
                    >
                      <div style={{ fontSize: "10px", color: DESIGN.muted, marginBottom: "6px", fontWeight: 700 }}>
                        {position.ticker} legs
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "6px" }}>
                        {symbols.map((symbol) => (
                          <div key={symbol}>
                            <div style={{ fontSize: "10px", color: DESIGN.muted, marginBottom: "2px", fontFamily: DESIGN.mono }}>{symbol}</div>
                            <input
                              type="number"
                              step="0.01"
                              placeholder={effectiveOptionQuotes[symbol]?.mark?.toFixed(2) ?? "—"}
                              value={manualOptionMarks[symbol] ?? ""}
                              onChange={(event) =>
                                setManualOptionMarks((current) => ({
                                  ...current,
                                  [symbol]: event.target.value,
                                }))
                              }
                              style={{
                                width: "100%",
                                background: "rgba(0,0,0,0.4)",
                                border: `1px solid ${DESIGN.cardBorder}`,
                                borderRadius: "4px",
                                color: DESIGN.text,
                                padding: "4px 6px",
                                fontSize: "12px",
                                fontFamily: DESIGN.mono,
                                boxSizing: "border-box",
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {sortedPositions.map((position) => (
        <PositionCard
          key={position.id}
          position={position}
          price={getPrice(position.ticker)}
          optionQuotes={effectiveOptionQuotes}
          expanded={expandedId === position.id}
          onToggle={() => setExpandedId((current) => (current === position.id ? null : position.id))}
        />
      ))}

      {stockRows.length > 0 && (
        <div style={{ marginTop: "16px" }}>
          <div
            style={{
              fontSize: "12px",
              color: DESIGN.muted,
              fontWeight: 600,
              marginBottom: "8px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Stock Positions
          </div>

          {stockRows.map((stock) => (
            <Card key={stock.id} style={{ marginBottom: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: DESIGN.bright }}>{stock.ticker}</span>
                  <span style={{ fontSize: "11px", color: DESIGN.muted, marginLeft: "8px" }}>
                    {stock.shares} shares @ ${stock.close_price.toFixed(2)}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: DESIGN.mono,
                    fontWeight: 700,
                    color: stock.unrealized_pl >= 0 ? DESIGN.green : DESIGN.red,
                  }}
                >
                  {formatSigned(stock.unrealized_pl)}
                </div>
              </div>
              <div style={{ fontSize: "11px", color: DESIGN.muted, marginTop: "4px" }}>{stock.notes}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
