"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/primitives";
import { DESIGN } from "@/lib/design";
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

  const isOpen = state.status === "OPEN";

  const title = mode === "create" ? "Add Trade" : `Edit Trade #${trade?.id ?? ""}`;

  const submitLabel = mode === "create" ? "Save Trade" : "Update Trade";

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

  return (
    <main style={{ minHeight: "100vh", background: DESIGN.bg, color: DESIGN.text, fontFamily: DESIGN.sans, padding: "20px" }}>
      <div style={{ maxWidth: "980px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: DESIGN.bright, marginBottom: "12px" }}>{title}</h1>

        <form onSubmit={onSubmit}>
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

              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: "10px", marginBottom: "10px" }}>
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
