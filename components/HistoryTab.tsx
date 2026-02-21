"use client";

import { useMemo, useState } from "react";

import { TradeCard } from "@/components/TradeCard";
import { Card } from "@/components/ui/primitives";
import { DESIGN, formatSigned } from "@/lib/design";
import type { StockPosition, Trade } from "@/lib/types";

export function HistoryTab({
  trades,
  stocks,
  assetFilter,
}: {
  trades: Trade[];
  stocks: StockPosition[];
  assetFilter: "options" | "stocks" | "all";
}) {
  const [sort, setSort] = useState<"pnl" | "pnl_desc" | "capital">("pnl");
  const [filter, setFilter] = useState<"ALL" | "WIN" | "LOSS" | "OPEN">("ALL");
  const [expandedKey, setExpandedKey] = useState<number | null>(null);

  const optionTrades = useMemo(() => {
    if (assetFilter === "stocks") return [];
    return trades.filter((trade) => trade.position_type === "option");
  }, [assetFilter, trades]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return optionTrades;
    return optionTrades.filter((trade) => trade.status === filter);
  }, [filter, optionTrades]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aPl = a.status === "OPEN" ? (a.unrealized_pl ?? 0) : (a.realized_pl ?? 0);
      const bPl = b.status === "OPEN" ? (b.unrealized_pl ?? 0) : (b.realized_pl ?? 0);
      if (sort === "pnl") return aPl - bPl;
      if (sort === "pnl_desc") return bPl - aPl;
      return b.cost_basis - a.cost_basis;
    });
  }, [filtered, sort]);

  const maxAbsPnl = useMemo(
    () =>
      Math.max(
        1,
        ...optionTrades.map((trade) =>
          Math.abs(trade.status === "OPEN" ? (trade.unrealized_pl ?? 0) : (trade.realized_pl ?? 0)),
        ),
      ),
    [optionTrades],
  );

  return (
    <div>
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "10px", color: DESIGN.muted }}>Sort:</span>
        {[
          ["pnl", "Worst→Best"],
          ["pnl_desc", "Best→Worst"],
          ["capital", "Capital↓"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSort(key as typeof sort)}
            style={{
              padding: "4px 10px",
              borderRadius: "4px",
              border: `1px solid ${sort === key ? `${DESIGN.blue}66` : DESIGN.cardBorder}`,
              background: sort === key ? `${DESIGN.blue}15` : "transparent",
              color: sort === key ? DESIGN.blue : DESIGN.muted,
              fontSize: "11px",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {label}
          </button>
        ))}

        <span style={{ width: "1px", height: "16px", background: DESIGN.cardBorder, margin: "0 4px" }} />

        <span style={{ fontSize: "10px", color: DESIGN.muted }}>Filter:</span>
        {(["ALL", "WIN", "LOSS", "OPEN"] as const).map((label) => (
          <button
            key={label}
            onClick={() => setFilter(label)}
            style={{
              padding: "4px 10px",
              borderRadius: "4px",
              border: `1px solid ${filter === label ? `${DESIGN.blue}66` : DESIGN.cardBorder}`,
              background: filter === label ? `${DESIGN.blue}15` : "transparent",
              color: filter === label ? DESIGN.blue : DESIGN.muted,
              fontSize: "11px",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {(assetFilter === "stocks" || assetFilter === "all") && (
        <div style={{ marginBottom: "12px" }}>
          <div
            style={{
              fontSize: "11px",
              color: DESIGN.muted,
              fontWeight: 600,
              marginBottom: "6px",
              textTransform: "uppercase",
            }}
          >
            Stocks
          </div>
          {stocks.map((stock) => (
            <Card key={stock.id} style={{ marginBottom: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <span style={{ fontWeight: 700, color: DESIGN.bright }}>{stock.ticker}</span>
                  <span style={{ fontSize: "11px", color: DESIGN.muted, marginLeft: "8px" }}>{stock.shares} shares</span>
                </div>
                <span
                  style={{
                    fontFamily: DESIGN.mono,
                    fontWeight: 700,
                    color: stock.unrealized_pl >= 0 ? DESIGN.green : DESIGN.red,
                  }}
                >
                  {formatSigned(stock.unrealized_pl)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {sorted.map((trade) => (
        <TradeCard
          key={trade.id}
          trade={trade}
          expanded={expandedKey === trade.id}
          onToggle={() => setExpandedKey((current) => (current === trade.id ? null : trade.id))}
          maxAbsPnl={maxAbsPnl}
        />
      ))}
    </div>
  );
}
