"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/primitives";
import { DESIGN } from "@/lib/design";
import { detectSpreadFromLegs, type ParsedLeg } from "@/lib/spread-detector";
import type { Trade } from "@/lib/types";

const STRATEGIES = [
  "Bull Call Spread",
  "Bear Put Spread",
  "Iron Condor",
  "Long Call",
  "Long Put",
  "Bull Put Spread",
  "Bear Call Spread",
  "Diagonal",
  "Custom",
] as const;

const CATALYSTS = ["Earnings", "Post-Earnings", "Nuclear/AI", "Crypto", "Speculation", "None"] as const;
const STATUS = ["OPEN", "WIN", "LOSS", "EXPIRED"] as const;

const STRATEGY_DIRECTION: Record<string, "Bullish" | "Bearish" | "Neutral"> = {
  "Bull Call Spread": "Bullish",
  "Bear Put Spread": "Bearish",
  "Iron Condor": "Neutral",
  "Long Call": "Bullish",
  "Long Put": "Bearish",
  "Bull Put Spread": "Bullish",
  "Bear Call Spread": "Bearish",
  Diagonal: "Neutral",
  Custom: "Neutral",
};

type BuilderLeg = {
  id: string;
  side: "BUY" | "SELL";
  optionType: "C" | "P";
  strike: string;
  price: string;
};

type BuilderMetrics = {
  strategy: string;
  direction: "Bullish" | "Bearish" | "Neutral";
  legsLabel: string;
  costBasis: number;
  maxRisk: number;
  maxProfit: number | null;
  breakeven: number | null;
  strikeLong: number | null;
  strikeShort: number | null;
  entryLong: number | null;
  entryShort: number | null;
};

const MONTH_CODE_TO_NUM: Record<string, string> = {
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

function parseDateCode(code: string): string | null {
  const match = code.match(/^(\d{2})([A-Z]{3})(\d{2})$/);
  if (!match) return null;
  const [, dd, mon, yy] = match;
  const mm = MONTH_CODE_TO_NUM[mon];
  if (!mm) return null;
  return `20${yy}-${mm}-${dd}`;
}

function parseBuilderText(rawText: string): {
  ticker: string | null;
  expiry: string | null;
  legs: BuilderLeg[];
} {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const legs: BuilderLeg[] = [];
  let ticker: string | null = null;
  let expiry: string | null = null;

  for (const line of lines) {
    const symbolMatch = line.match(/([A-Z.]+)\s+(\d{2}[A-Z]{3}\d{2})\s+(\d+(?:\.\d+)?)\s+([CP])/i);
    if (!symbolMatch) continue;
    const [, tickerRaw, dateCodeRaw, strikeRaw, typeRaw] = symbolMatch;

    const dateCode = dateCodeRaw.toUpperCase();
    const parsedExpiry = parseDateCode(dateCode);
    if (parsedExpiry) expiry = parsedExpiry;
    ticker = tickerRaw.toUpperCase();

    const qtyPriceMatch = line.match(/(-?\d+)\s+(\d+(?:\.\d{1,4})?)(?:\s|$)/);
    const sideWordMatch = line.match(/\b(BUY|SELL)\b/i);
    const atPriceMatch = line.match(/@\s*(\d+(?:\.\d{1,4})?)/i);
    const qty = qtyPriceMatch ? Number(qtyPriceMatch[1]) : sideWordMatch ? (sideWordMatch[1].toUpperCase() === "BUY" ? 1 : -1) : 1;
    const price = qtyPriceMatch
      ? Number(qtyPriceMatch[2])
      : atPriceMatch
        ? Number(atPriceMatch[1])
        : NaN;
    if (!Number.isFinite(price)) continue;

    legs.push({
      id: `parsed-${legs.length + 1}`,
      side: qty >= 0 ? "BUY" : "SELL",
      optionType: typeRaw.toUpperCase() as "C" | "P",
      strike: strikeRaw,
      price: String(price),
    });
  }

  return {
    ticker,
    expiry,
    legs,
  };
}

function strategyIsCredit(strategy: string) {
  return strategy === "Bull Put Spread" || strategy === "Bear Call Spread" || strategy === "Iron Condor";
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function round4(value: number) {
  return Number(value.toFixed(4));
}

function formatLegLabel(strike: number, type: "C" | "P") {
  return `${Number.isInteger(strike) ? strike.toFixed(0) : strike}${type}`;
}

function computeBuilderMetrics(legs: BuilderLeg[], contracts: number): BuilderMetrics | null {
  const parsedRows = legs
    .map((leg) => ({
      ...leg,
      strikeNum: toNumber(leg.strike),
      priceNum: toNumber(leg.price),
    }))
    .filter(
      (leg): leg is BuilderLeg & { strikeNum: number; priceNum: number } =>
        leg.strikeNum != null && leg.priceNum != null && leg.priceNum >= 0,
    );

  if (parsedRows.length === 0) return null;

  const detectLegs: ParsedLeg[] = parsedRows.map((leg) => ({
    ticker: "",
    expiry: null,
    strike: leg.strikeNum,
    optionType: leg.optionType,
    side: leg.side,
    quantity: leg.side === "BUY" ? 1 : -1,
  }));

  const detected = detectSpreadFromLegs(detectLegs);
  const strategy = detected.strategy;
  const direction = detected.direction;

  const longRows = parsedRows.filter((leg) => leg.side === "BUY");
  const shortRows = parsedRows.filter((leg) => leg.side === "SELL");
  const longCalls = longRows.filter((leg) => leg.optionType === "C").sort((a, b) => a.strikeNum - b.strikeNum);
  const shortCalls = shortRows.filter((leg) => leg.optionType === "C").sort((a, b) => a.strikeNum - b.strikeNum);
  const longPuts = longRows.filter((leg) => leg.optionType === "P").sort((a, b) => a.strikeNum - b.strikeNum);
  const shortPuts = shortRows.filter((leg) => leg.optionType === "P").sort((a, b) => a.strikeNum - b.strikeNum);

  const debitPerShare = parsedRows.reduce(
    (sum, leg) => sum + (leg.side === "BUY" ? leg.priceNum : -leg.priceNum),
    0,
  );
  const creditPerShare = Math.max(0, -debitPerShare);
  const debitAbs = Math.max(0, debitPerShare);

  const callStrikes = parsedRows.filter((leg) => leg.optionType === "C").map((leg) => leg.strikeNum).sort((a, b) => a - b);
  const putStrikes = parsedRows.filter((leg) => leg.optionType === "P").map((leg) => leg.strikeNum).sort((a, b) => a - b);
  const callWidth = callStrikes.length >= 2 ? callStrikes[callStrikes.length - 1] - callStrikes[0] : null;
  const putWidth = putStrikes.length >= 2 ? putStrikes[putStrikes.length - 1] - putStrikes[0] : null;
  const spreadWidth = Math.max(callWidth ?? 0, putWidth ?? 0);

  let maxRisk = debitAbs * 100 * contracts;
  let maxProfit: number | null = null;

  if (strategyIsCredit(strategy)) {
    const creditDollars = creditPerShare * 100 * contracts;
    const riskDollars = Math.max(0, (spreadWidth - creditPerShare) * 100 * contracts);
    maxRisk = round2(riskDollars);
    maxProfit = round2(creditDollars);
  } else if (strategy === "Bull Call Spread" || strategy === "Bear Put Spread") {
    if (spreadWidth > 0) {
      maxRisk = round2(debitAbs * 100 * contracts);
      maxProfit = round2(Math.max(0, (spreadWidth - debitAbs) * 100 * contracts));
    }
  } else if (strategy === "Long Call" || strategy === "Long Put") {
    maxRisk = round2(debitAbs * 100 * contracts);
    maxProfit = null;
  } else {
    maxRisk = round2(Math.max(maxRisk, 0));
    maxProfit = spreadWidth > 0 ? round2(Math.max(0, (spreadWidth - debitAbs) * 100 * contracts)) : null;
  }

  const shortPutStrike = shortPuts[shortPuts.length - 1]?.strikeNum ?? null;
  const shortCallStrike = shortCalls[0]?.strikeNum ?? null;
  const longCallStrike = longCalls[0]?.strikeNum ?? null;
  const longPutStrike = longPuts[longPuts.length - 1]?.strikeNum ?? null;

  let breakeven: number | null = null;
  if (strategy === "Bull Call Spread" && longCallStrike != null) breakeven = longCallStrike + debitAbs;
  else if (strategy === "Bear Put Spread" && longPutStrike != null) breakeven = longPutStrike - debitAbs;
  else if (strategy === "Bull Put Spread" && shortPutStrike != null) breakeven = shortPutStrike - creditPerShare;
  else if (strategy === "Bear Call Spread" && shortCallStrike != null) breakeven = shortCallStrike + creditPerShare;
  else if (strategy === "Iron Condor" && shortPutStrike != null) breakeven = shortPutStrike - creditPerShare;
  else if (strategy === "Long Call" && longCallStrike != null) breakeven = longCallStrike + debitAbs;
  else if (strategy === "Long Put" && longPutStrike != null) breakeven = longPutStrike - debitAbs;

  let strikeLong: number | null = null;
  let strikeShort: number | null = null;
  if (strategy === "Bull Call Spread") {
    strikeLong = longCallStrike;
    strikeShort = shortCalls[shortCalls.length - 1]?.strikeNum ?? null;
  } else if (strategy === "Bear Put Spread") {
    strikeLong = longPutStrike;
    strikeShort = shortPuts[0]?.strikeNum ?? null;
  } else if (strategy === "Bull Put Spread") {
    strikeLong = longPuts[0]?.strikeNum ?? null;
    strikeShort = shortPutStrike;
  } else if (strategy === "Bear Call Spread") {
    strikeLong = longCalls[longCalls.length - 1]?.strikeNum ?? null;
    strikeShort = shortCallStrike;
  } else if (strategy === "Iron Condor") {
    strikeLong = shortPutStrike;
    strikeShort = shortCallStrike;
  } else if (strategy === "Long Call") {
    strikeLong = longCallStrike;
  } else if (strategy === "Long Put") {
    strikeLong = longPutStrike;
  } else {
    strikeLong = longRows[0]?.strikeNum ?? null;
    strikeShort = shortRows[0]?.strikeNum ?? null;
  }

  const entryLong =
    longRows.length > 0
      ? round4(longRows.reduce((sum, leg) => sum + leg.priceNum, 0) / longRows.length)
      : null;
  const entryShort =
    shortRows.length > 0
      ? round4(shortRows.reduce((sum, leg) => sum + leg.priceNum, 0) / shortRows.length)
      : null;

  const orderedLegs = [...parsedRows].sort((a, b) => a.strikeNum - b.strikeNum);
  const legsLabel = orderedLegs.map((leg) => formatLegLabel(leg.strikeNum, leg.optionType)).join(" / ");

  const costBasis = strategyIsCredit(strategy) ? maxRisk : round2(debitAbs * 100 * contracts);

  return {
    strategy,
    direction,
    legsLabel: legsLabel || detected.legs,
    costBasis,
    maxRisk: round2(maxRisk),
    maxProfit,
    breakeven: breakeven != null ? round4(breakeven) : null,
    strikeLong,
    strikeShort,
    entryLong,
    entryShort,
  };
}

function toNumber(value: string): number | null {
  if (!value.trim()) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function initialValue(trade?: Trade | null) {
  return {
    ticker: trade?.ticker ?? "",
    strategy: trade?.strategy ?? "Bull Call Spread",
    direction: trade?.direction ?? "Bullish",
    legs: trade?.legs ?? "",
    entry_date: trade?.entry_date ?? new Date().toISOString().slice(0, 10),
    exit_date: trade?.exit_date ?? "",
    expiry_date: trade?.expiry_date ?? "",
    status: trade?.status ?? "OPEN",
    cost_basis: String(trade?.cost_basis ?? ""),
    max_risk: String(trade?.max_risk ?? ""),
    max_profit: trade?.max_profit != null ? String(trade.max_profit) : "",
    realized_pl: trade?.realized_pl != null ? String(trade.realized_pl) : "",
    commissions: String(trade?.commissions ?? "0"),
    contracts: String(trade?.contracts ?? "1"),
    catalyst: trade?.catalyst ?? "None",
    breakeven: trade?.breakeven != null ? String(trade.breakeven) : "",
    stop_loss: trade?.stop_loss != null ? String(trade.stop_loss) : "",
    strike_long: trade?.strike_long != null ? String(trade.strike_long) : "",
    strike_short: trade?.strike_short != null ? String(trade.strike_short) : "",
    close_price_long: trade?.close_price_long != null ? String(trade.close_price_long) : "",
    close_price_short: trade?.close_price_short != null ? String(trade.close_price_short) : "",
    theta_per_day: trade?.theta_per_day != null ? String(trade.theta_per_day) : "",
    urgency: trade?.urgency != null ? String(trade.urgency) : "3",
    hold_advice: trade?.hold_advice ?? "",
    exit_trigger: trade?.exit_trigger ?? "",
    best_case: trade?.best_case ?? "",
    exit_conservative: trade?.exit_conservative ?? "",
    exit_balanced: trade?.exit_balanced ?? "",
    exit_aggressive: trade?.exit_aggressive ?? "",
    notes: trade?.notes ?? "",
    lesson: trade?.lesson ?? "",
  };
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        fontSize: "10px",
        color: DESIGN.muted,
        textTransform: "uppercase",
        letterSpacing: "0.4px",
        fontWeight: 700,
      }}
    >
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        background: "rgba(0,0,0,0.45)",
        color: DESIGN.text,
        border: `1px solid ${DESIGN.cardBorder}`,
        borderRadius: "6px",
        padding: "8px 10px",
        fontSize: "13px",
        fontFamily: DESIGN.mono,
        ...props.style,
      }}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        background: "rgba(0,0,0,0.45)",
        color: DESIGN.text,
        border: `1px solid ${DESIGN.cardBorder}`,
        borderRadius: "6px",
        padding: "8px 10px",
        fontSize: "13px",
        fontFamily: DESIGN.sans,
        ...props.style,
      }}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        background: "rgba(0,0,0,0.45)",
        color: DESIGN.text,
        border: `1px solid ${DESIGN.cardBorder}`,
        borderRadius: "6px",
        padding: "8px 10px",
        fontSize: "13px",
        minHeight: "86px",
        fontFamily: DESIGN.sans,
        resize: "vertical",
        ...props.style,
      }}
    />
  );
}

export function TradeForm({ trade, mode }: { trade?: Trade | null; mode: "create" | "edit" }) {
  const router = useRouter();
  const [state, setState] = useState(initialValue(trade));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directionOverridden, setDirectionOverridden] = useState(false);
  const [builderExpiry, setBuilderExpiry] = useState(trade?.expiry_date ?? new Date().toISOString().slice(0, 10));
  const [builderContracts, setBuilderContracts] = useState(String(trade?.contracts ?? 1));
  const [builderText, setBuilderText] = useState("");
  const [builderLegs, setBuilderLegs] = useState<BuilderLeg[]>([
    { id: "leg-1", side: "BUY", optionType: "C", strike: "", price: "" },
    { id: "leg-2", side: "SELL", optionType: "C", strike: "", price: "" },
  ]);
  const [showAdvanced, setShowAdvanced] = useState(mode === "edit");

  const isOpen = state.status === "OPEN";

  const title = mode === "create" ? "Add Trade" : `Edit Trade #${trade?.id ?? ""}`;

  const submitLabel = mode === "create" ? "Save Trade" : "Update Trade";

  const builderMetrics = useMemo(
    () => computeBuilderMetrics(builderLegs, Math.max(1, Math.trunc(toNumber(builderContracts) ?? 1))),
    [builderContracts, builderLegs],
  );

  const payload = useMemo(() => {
    const costBasis = toNumber(state.cost_basis) ?? 0;
    const maxRisk = toNumber(state.max_risk) ?? costBasis;
    const realized = toNumber(state.realized_pl);

    return {
      ticker: state.ticker.trim().toUpperCase(),
      strategy: state.strategy,
      direction: state.direction,
      legs: state.legs,
      entry_date: state.entry_date,
      exit_date: state.exit_date || null,
      expiry_date: state.expiry_date || null,
      status: state.status,
      cost_basis: costBasis,
      max_risk: maxRisk,
      max_profit: toNumber(state.max_profit),
      realized_pl: realized,
      return_pct: realized != null ? (realized / Math.max(costBasis, 1)) * 100 : null,
      commissions: toNumber(state.commissions) ?? 0,
      contracts: Math.max(1, Math.trunc(toNumber(state.contracts) ?? 1)),
      catalyst: state.catalyst,
      breakeven: toNumber(state.breakeven),
      stop_loss: toNumber(state.stop_loss),
      strike_long: toNumber(state.strike_long),
      strike_short: toNumber(state.strike_short),
      close_price_long: toNumber(state.close_price_long),
      close_price_short: toNumber(state.close_price_short),
      theta_per_day: toNumber(state.theta_per_day),
      urgency: Math.max(1, Math.min(5, Math.trunc(toNumber(state.urgency) ?? 1))),
      hold_advice: state.hold_advice,
      exit_trigger: state.exit_trigger,
      best_case: state.best_case,
      exit_conservative: state.exit_conservative,
      exit_balanced: state.exit_balanced,
      exit_aggressive: state.exit_aggressive,
      notes: state.notes,
      lesson: state.lesson,
      source: trade?.source ?? "manual",
      ib_symbols: trade?.ib_symbols ?? [],
      position_type: "option",
    };
  }, [state, trade]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!payload.ticker) {
      setError("Ticker is required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const endpoint = mode === "create" ? "/api/trades" : `/api/trades/${trade?.id}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const resp = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        throw new Error(data.error ?? "Failed to save trade");
      }

      router.push("/");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save trade");
    } finally {
      setSaving(false);
    }
  }

  function applyBuilderToForm() {
    if (!builderMetrics) return;
    const contracts = Math.max(1, Math.trunc(toNumber(builderContracts) ?? 1));
    setState((current) => ({
      ...current,
      strategy: builderMetrics.strategy,
      direction: builderMetrics.direction,
      legs: builderMetrics.legsLabel,
      expiry_date: builderExpiry,
      contracts: String(contracts),
      cost_basis: String(builderMetrics.costBasis),
      max_risk: String(builderMetrics.maxRisk),
      max_profit: builderMetrics.maxProfit != null ? String(builderMetrics.maxProfit) : "",
      breakeven: builderMetrics.breakeven != null ? String(builderMetrics.breakeven) : "",
      strike_long: builderMetrics.strikeLong != null ? String(builderMetrics.strikeLong) : "",
      strike_short: builderMetrics.strikeShort != null ? String(builderMetrics.strikeShort) : "",
      close_price_long: builderMetrics.entryLong != null ? String(builderMetrics.entryLong) : "",
      close_price_short: builderMetrics.entryShort != null ? String(builderMetrics.entryShort) : "",
    }));
    setDirectionOverridden(false);
  }

  function applyBuilderTextParse() {
    const parsed = parseBuilderText(builderText);
    if (parsed.legs.length > 0) {
      setBuilderLegs(parsed.legs);
    }
    if (parsed.expiry) {
      setBuilderExpiry(parsed.expiry);
    }
    if (parsed.ticker) {
      const ticker = parsed.ticker;
      setState((current) => ({ ...current, ticker }));
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: DESIGN.bg, color: DESIGN.text, fontFamily: DESIGN.sans, padding: "20px" }}>
      <div style={{ maxWidth: "980px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: DESIGN.bright, marginBottom: "12px" }}>{title}</h1>

        <form onSubmit={onSubmit}>
          <Card style={{ marginBottom: "12px", borderColor: `${DESIGN.blue}33` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "10px" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: DESIGN.blue, marginBottom: "2px" }}>
                  Quick Position Builder
                </div>
                <div style={{ fontSize: "11px", color: DESIGN.muted }}>
                  Enter only expiry + leg side/type/strike/price. Strategy and risk metrics are computed automatically.
                </div>
              </div>
              <button
                type="button"
                onClick={applyBuilderToForm}
                disabled={!builderMetrics}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: `1px solid ${DESIGN.blue}44`,
                  background: `${DESIGN.blue}18`,
                  color: DESIGN.blue,
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: builderMetrics ? "pointer" : "not-allowed",
                  opacity: builderMetrics ? 1 : 0.5,
                }}
              >
                Apply To Trade
              </button>
            </div>

            <div style={{ marginBottom: "10px" }}>
              <FieldLabel>Paste Text From Screenshot / IB Line (Optional)</FieldLabel>
              <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
                <TextArea
                  value={builderText}
                  onChange={(event) => setBuilderText(event.target.value)}
                  placeholder="Example: CEG 17APR26 290 C ... 1 25.3700"
                  style={{ minHeight: "56px", marginTop: "4px" }}
                />
                <button
                  type="button"
                  onClick={applyBuilderTextParse}
                  style={{
                    alignSelf: "flex-end",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: `1px solid ${DESIGN.cardBorder}`,
                    background: "transparent",
                    color: DESIGN.muted,
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    marginBottom: "2px",
                  }}
                >
                  Parse Text
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
              <div>
                <FieldLabel>Ticker</FieldLabel>
                <Input
                  value={state.ticker}
                  placeholder="AAPL"
                  onChange={(event) => setState((current) => ({ ...current, ticker: event.target.value.toUpperCase() }))}
                />
              </div>
              <div>
                <FieldLabel>Expiry</FieldLabel>
                <Input type="date" value={builderExpiry} onChange={(event) => setBuilderExpiry(event.target.value)} />
              </div>
              <div>
                <FieldLabel>Contracts</FieldLabel>
                <Input type="number" min={1} value={builderContracts} onChange={(event) => setBuilderContracts(event.target.value)} />
              </div>
              <div style={{ alignSelf: "end", display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() =>
                    setBuilderLegs((current) => [
                      ...current,
                      { id: `leg-${Date.now()}-${current.length}`, side: "BUY", optionType: "C", strike: "", price: "" },
                    ])
                  }
                  style={{
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: `1px solid ${DESIGN.cardBorder}`,
                    background: "transparent",
                    color: DESIGN.muted,
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  + Add Leg
                </button>
                <button
                  type="button"
                  onClick={() => setBuilderLegs((current) => (current.length > 1 ? current.slice(0, -1) : current))}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: `1px solid ${DESIGN.cardBorder}`,
                    background: "transparent",
                    color: DESIGN.muted,
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  - Remove
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gap: "8px", marginBottom: "10px" }}>
              {builderLegs.map((leg, index) => (
                <div
                  key={leg.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "80px 80px 1fr 1fr",
                    gap: "8px",
                    alignItems: "end",
                    padding: "8px",
                    borderRadius: "6px",
                    border: `1px solid ${DESIGN.cardBorder}`,
                    background: "rgba(255,255,255,0.01)",
                  }}
                >
                  <div>
                    <FieldLabel>{`Leg ${index + 1}`}</FieldLabel>
                    <Select
                      value={leg.side}
                      onChange={(event) =>
                        setBuilderLegs((current) =>
                          current.map((item) => (item.id === leg.id ? { ...item, side: event.target.value as "BUY" | "SELL" } : item)),
                        )
                      }
                    >
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                    </Select>
                  </div>
                  <div>
                    <FieldLabel>Type</FieldLabel>
                    <Select
                      value={leg.optionType}
                      onChange={(event) =>
                        setBuilderLegs((current) =>
                          current.map((item) => (item.id === leg.id ? { ...item, optionType: event.target.value as "C" | "P" } : item)),
                        )
                      }
                    >
                      <option value="C">CALL</option>
                      <option value="P">PUT</option>
                    </Select>
                  </div>
                  <div>
                    <FieldLabel>Strike</FieldLabel>
                    <Input
                      type="number"
                      step="0.01"
                      value={leg.strike}
                      onChange={(event) =>
                        setBuilderLegs((current) =>
                          current.map((item) => (item.id === leg.id ? { ...item, strike: event.target.value } : item)),
                        )
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel>Entry Price</FieldLabel>
                    <Input
                      type="number"
                      step="0.0001"
                      value={leg.price}
                      onChange={(event) =>
                        setBuilderLegs((current) =>
                          current.map((item) => (item.id === leg.id ? { ...item, price: event.target.value } : item)),
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: "8px" }}>
              <div>
                <FieldLabel>Detected Strategy</FieldLabel>
                <div style={{ fontSize: "12px", fontWeight: 700, color: DESIGN.bright }}>
                  {builderMetrics?.strategy ?? "—"}
                </div>
              </div>
              <div>
                <FieldLabel>Direction</FieldLabel>
                <div style={{ fontSize: "12px", fontWeight: 700, color: DESIGN.text }}>
                  {builderMetrics?.direction ?? "—"}
                </div>
              </div>
              <div>
                <FieldLabel>Max Risk</FieldLabel>
                <div style={{ fontSize: "12px", fontWeight: 700, color: DESIGN.red, fontFamily: DESIGN.mono }}>
                  {builderMetrics ? `$${builderMetrics.maxRisk.toFixed(2)}` : "—"}
                </div>
              </div>
              <div>
                <FieldLabel>Max Profit</FieldLabel>
                <div style={{ fontSize: "12px", fontWeight: 700, color: DESIGN.green, fontFamily: DESIGN.mono }}>
                  {builderMetrics?.maxProfit != null ? `$${builderMetrics.maxProfit.toFixed(2)}` : "—"}
                </div>
              </div>
              <div>
                <FieldLabel>Breakeven</FieldLabel>
                <div style={{ fontSize: "12px", fontWeight: 700, color: DESIGN.yellow, fontFamily: DESIGN.mono }}>
                  {builderMetrics?.breakeven != null ? `$${builderMetrics.breakeven.toFixed(2)}` : "—"}
                </div>
              </div>
              <div>
                <FieldLabel>Entry Prices</FieldLabel>
                <div style={{ fontSize: "11px", color: DESIGN.text, fontFamily: DESIGN.mono }}>
                  L {builderMetrics?.entryLong != null ? builderMetrics.entryLong.toFixed(3) : "—"} / S{" "}
                  {builderMetrics?.entryShort != null ? builderMetrics.entryShort.toFixed(3) : "—"}
                </div>
              </div>
            </div>
          </Card>

          <div style={{ marginBottom: "10px" }}>
            <button
              type="button"
              onClick={() => setShowAdvanced((current) => !current)}
              style={{
                padding: "6px 10px",
                borderRadius: "6px",
                border: `1px solid ${DESIGN.cardBorder}`,
                background: showAdvanced ? `${DESIGN.blue}12` : "transparent",
                color: showAdvanced ? DESIGN.blue : DESIGN.muted,
                fontSize: "11px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {showAdvanced ? "Hide Advanced Form" : "Show Advanced Form"}
            </button>
          </div>

          {showAdvanced && (
            <>
          <Card style={{ marginBottom: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px" }}>
              <div>
                <FieldLabel>Ticker</FieldLabel>
                <Input
                  value={state.ticker}
                  onChange={(event) => setState((current) => ({ ...current, ticker: event.target.value.toUpperCase() }))}
                  placeholder="AAPL"
                  required
                />
              </div>

              <div>
                <FieldLabel>Strategy</FieldLabel>
                <Select
                  value={state.strategy}
                  onChange={(event) => {
                    const strategy = event.target.value;
                    setState((current) => ({
                      ...current,
                      strategy,
                      direction: directionOverridden ? current.direction : STRATEGY_DIRECTION[strategy] ?? "Neutral",
                    }));
                  }}
                >
                  {STRATEGIES.map((strategy) => (
                    <option key={strategy} value={strategy}>{strategy}</option>
                  ))}
                </Select>
              </div>

              <div>
                <FieldLabel>Direction</FieldLabel>
                <Select
                  value={state.direction}
                  onChange={(event) => {
                    setDirectionOverridden(true);
                    setState((current) => ({ ...current, direction: event.target.value as typeof current.direction }));
                  }}
                >
                  <option value="Bullish">Bullish</option>
                  <option value="Bearish">Bearish</option>
                  <option value="Neutral">Neutral</option>
                </Select>
              </div>

              <div>
                <FieldLabel>Status</FieldLabel>
                <Select value={state.status} onChange={(event) => setState((current) => ({ ...current, status: event.target.value as typeof current.status }))}>
                  {STATUS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "10px", marginTop: "10px" }}>
              <div>
                <FieldLabel>Legs</FieldLabel>
                <Input value={state.legs} onChange={(event) => setState((current) => ({ ...current, legs: event.target.value }))} placeholder="290C / 320C" required />
              </div>
              <div>
                <FieldLabel>Contracts</FieldLabel>
                <Input type="number" min={1} value={state.contracts} onChange={(event) => setState((current) => ({ ...current, contracts: event.target.value }))} />
              </div>
              <div>
                <FieldLabel>Catalyst</FieldLabel>
                <Select value={state.catalyst} onChange={(event) => setState((current) => ({ ...current, catalyst: event.target.value as typeof current.catalyst }))}>
                  {CATALYSTS.map((catalyst) => (
                    <option key={catalyst} value={catalyst}>{catalyst}</option>
                  ))}
                </Select>
              </div>
            </div>
          </Card>

          <Card style={{ marginBottom: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
              <div>
                <FieldLabel>Entry Date</FieldLabel>
                <Input type="date" value={state.entry_date} onChange={(event) => setState((current) => ({ ...current, entry_date: event.target.value }))} required />
              </div>
              <div>
                <FieldLabel>Exit Date</FieldLabel>
                <Input type="date" value={state.exit_date} onChange={(event) => setState((current) => ({ ...current, exit_date: event.target.value }))} />
              </div>
              <div>
                <FieldLabel>Expiry Date</FieldLabel>
                <Input type="date" value={state.expiry_date} onChange={(event) => setState((current) => ({ ...current, expiry_date: event.target.value }))} />
              </div>
            </div>
          </Card>

          <Card style={{ marginBottom: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "10px" }}>
              <div>
                <FieldLabel>Cost Basis</FieldLabel>
                <Input type="number" step="0.01" value={state.cost_basis} onChange={(event) => setState((current) => ({ ...current, cost_basis: event.target.value }))} required />
              </div>
              <div>
                <FieldLabel>Max Risk</FieldLabel>
                <Input type="number" step="0.01" value={state.max_risk} onChange={(event) => setState((current) => ({ ...current, max_risk: event.target.value }))} required />
              </div>
              <div>
                <FieldLabel>Max Profit</FieldLabel>
                <Input type="number" step="0.01" value={state.max_profit} onChange={(event) => setState((current) => ({ ...current, max_profit: event.target.value }))} />
              </div>
              <div>
                <FieldLabel>Realized P/L</FieldLabel>
                <Input type="number" step="0.01" value={state.realized_pl} onChange={(event) => setState((current) => ({ ...current, realized_pl: event.target.value }))} />
              </div>
              <div>
                <FieldLabel>Commissions</FieldLabel>
                <Input type="number" step="0.01" value={state.commissions} onChange={(event) => setState((current) => ({ ...current, commissions: event.target.value }))} />
              </div>
            </div>
          </Card>

          {isOpen && (
            <Card style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: DESIGN.blue, marginBottom: "10px" }}>Open Position Fields</div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(8, minmax(0, 1fr))", gap: "10px", marginBottom: "10px" }}>
                <div>
                  <FieldLabel>Breakeven</FieldLabel>
                  <Input type="number" step="0.01" value={state.breakeven} onChange={(event) => setState((current) => ({ ...current, breakeven: event.target.value }))} />
                </div>
                <div>
                  <FieldLabel>Stop Loss</FieldLabel>
                  <Input type="number" step="0.01" value={state.stop_loss} onChange={(event) => setState((current) => ({ ...current, stop_loss: event.target.value }))} />
                </div>
                <div>
                  <FieldLabel>Long Strike</FieldLabel>
                  <Input type="number" step="0.01" value={state.strike_long} onChange={(event) => setState((current) => ({ ...current, strike_long: event.target.value }))} />
                </div>
                <div>
                  <FieldLabel>Short Strike</FieldLabel>
                  <Input type="number" step="0.01" value={state.strike_short} onChange={(event) => setState((current) => ({ ...current, strike_short: event.target.value }))} />
                </div>
                <div>
                  <FieldLabel>Long Entry Px</FieldLabel>
                  <Input type="number" step="0.0001" value={state.close_price_long} onChange={(event) => setState((current) => ({ ...current, close_price_long: event.target.value }))} />
                </div>
                <div>
                  <FieldLabel>Short Entry Px</FieldLabel>
                  <Input type="number" step="0.0001" value={state.close_price_short} onChange={(event) => setState((current) => ({ ...current, close_price_short: event.target.value }))} />
                </div>
                <div>
                  <FieldLabel>Theta/day</FieldLabel>
                  <Input type="number" step="0.01" value={state.theta_per_day} onChange={(event) => setState((current) => ({ ...current, theta_per_day: event.target.value }))} />
                </div>
                <div>
                  <FieldLabel>Urgency (1-5)</FieldLabel>
                  <Input type="range" min={1} max={5} value={state.urgency} onChange={(event) => setState((current) => ({ ...current, urgency: event.target.value }))} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                <div>
                  <FieldLabel>Hold Advice</FieldLabel>
                  <TextArea value={state.hold_advice} onChange={(event) => setState((current) => ({ ...current, hold_advice: event.target.value }))} />
                </div>
                <div>
                  <FieldLabel>Exit Trigger</FieldLabel>
                  <TextArea value={state.exit_trigger} onChange={(event) => setState((current) => ({ ...current, exit_trigger: event.target.value }))} />
                </div>
                <div>
                  <FieldLabel>Best Case</FieldLabel>
                  <TextArea value={state.best_case} onChange={(event) => setState((current) => ({ ...current, best_case: event.target.value }))} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                <div>
                  <FieldLabel>Exit (Conservative)</FieldLabel>
                  <TextArea value={state.exit_conservative} onChange={(event) => setState((current) => ({ ...current, exit_conservative: event.target.value }))} />
                </div>
                <div>
                  <FieldLabel>Exit (Balanced)</FieldLabel>
                  <TextArea value={state.exit_balanced} onChange={(event) => setState((current) => ({ ...current, exit_balanced: event.target.value }))} />
                </div>
                <div>
                  <FieldLabel>Exit (Aggressive)</FieldLabel>
                  <TextArea value={state.exit_aggressive} onChange={(event) => setState((current) => ({ ...current, exit_aggressive: event.target.value }))} />
                </div>
              </div>
            </Card>
          )}

          <Card style={{ marginBottom: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <FieldLabel>Notes</FieldLabel>
                <TextArea value={state.notes} onChange={(event) => setState((current) => ({ ...current, notes: event.target.value }))} />
              </div>
              <div>
                <FieldLabel>Lesson</FieldLabel>
                <TextArea value={state.lesson} onChange={(event) => setState((current) => ({ ...current, lesson: event.target.value }))} />
              </div>
            </div>
          </Card>

          {error && (
            <div style={{ marginBottom: "12px", color: DESIGN.red, fontSize: "12px" }}>
              {error}
            </div>
          )}
            </>
          )}

          {!showAdvanced && error && (
            <div style={{ marginBottom: "12px", color: DESIGN.red, fontSize: "12px" }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                border: `1px solid ${DESIGN.blue}44`,
                background: `${DESIGN.blue}18`,
                color: DESIGN.blue,
                fontWeight: 700,
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              {saving ? "Saving..." : submitLabel}
            </button>

            <button
              type="button"
              onClick={() => router.push("/")}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                border: `1px solid ${DESIGN.cardBorder}`,
                background: "transparent",
                color: DESIGN.muted,
                fontWeight: 600,
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
