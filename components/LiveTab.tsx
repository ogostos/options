"use client";

import { useMemo, useState } from "react";

import { PositionCard } from "@/components/PositionCard";
import { Card } from "@/components/ui/primitives";
import { DESIGN, formatSigned } from "@/lib/design";
import type { StockPosition, Trade } from "@/lib/types";

interface LiveTabProps {
  openPositions: Trade[];
  stocks: StockPosition[];
  assetFilter: "options" | "stocks" | "all";
}

export function LiveTab({ openPositions, stocks, assetFilter }: LiveTabProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [manualInputs, setManualInputs] = useState<Record<string, string>>({});
  const [showManual, setShowManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});

  const positions = useMemo(
    () => (assetFilter === "stocks" ? [] : openPositions),
    [assetFilter, openPositions],
  );
  const stockRows = useMemo(() => (assetFilter === "options" ? [] : stocks), [assetFilter, stocks]);

  async function fetchPrices() {
    setLoading(true);
    try {
      const resp = await fetch("/api/prices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tickers: positions.map((position) => position.ticker) }),
      });

      const data = (await resp.json()) as {
        prices?: Record<string, { price: number }>;
      };

      if (data.prices) {
        const next: Record<string, number> = {};
        for (const [ticker, payload] of Object.entries(data.prices)) {
          if (typeof payload?.price === "number") {
            next[ticker] = payload.price;
          }
        }
        setPrices((prev) => ({ ...prev, ...next }));
        setLastFetch(new Date().toISOString());
      }
    } catch {
      setShowManual(true);
    } finally {
      setLoading(false);
    }
  }

  function getPrice(ticker: string) {
    const manual = manualInputs[ticker];
    if (manual != null && manual !== "") {
      const num = Number(manual);
      if (Number.isFinite(num) && num > 0) return num;
    }
    return prices[ticker] ?? null;
  }

  return (
    <div>
      {positions.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
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
              {loading ? "Fetching..." : "🔄 Fetch Prices"}
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
              ✏️ Manual
            </button>
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
                gridTemplateColumns: `repeat(${positions.length}, minmax(0, 1fr))`,
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
        </div>
      )}

      {positions.map((position) => (
        <PositionCard
          key={position.id}
          position={position}
          price={getPrice(position.ticker)}
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
