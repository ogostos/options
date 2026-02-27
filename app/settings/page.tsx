"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Card } from "@/components/ui/primitives";
import { DESIGN } from "@/lib/design";
import type { DashboardSettings } from "@/lib/types";

export default function SettingsPage() {
  const [settings, setSettings] = useState<DashboardSettings | null>(null);
  const [interestRate, setInterestRate] = useState("");
  const [priceApi, setPriceApi] = useState<"yahoo" | "alphavantage" | "manual">("yahoo");
  const [alphaKey, setAlphaKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [probeTicker, setProbeTicker] = useState("ADBE");
  const [probeOptionSymbol, setProbeOptionSymbol] = useState("ADBE 17APR26 450 C");
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const resp = await fetch("/api/settings", { cache: "no-store" });
        const data = (await resp.json()) as { settings?: DashboardSettings; error?: string };
        if (!resp.ok || !data.settings) {
          throw new Error(data.error ?? "Failed to load settings");
        }

        setSettings(data.settings);
        setInterestRate(String(data.settings.interest_rate_est));
        setPriceApi(data.settings.price_api);
        setAlphaKey(data.settings.alpha_vantage_key || "");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load settings");
      }
    })();
  }, []);

  async function saveSettings() {
    if (!settings) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const resp = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          interest_rate_est: Number(interestRate) || 0,
          price_api: priceApi,
          alpha_vantage_key: alphaKey,
        }),
      });

      const data = (await resp.json()) as { settings?: DashboardSettings; error?: string };
      if (!resp.ok || !data.settings) {
        throw new Error(data.error ?? "Failed to save settings");
      }

      setSettings(data.settings);
      setMessage("Settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function resetData() {
    const confirmed = window.confirm("Reset all dashboard data to the seeded baseline?");
    if (!confirmed) return;

    setError(null);
    setMessage(null);

    try {
      const resp = await fetch("/api/reset", { method: "POST" });
      const data = (await resp.json()) as { ok?: boolean; error?: string };
      if (!resp.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to reset data");
      }
      setMessage("All data reset and reseeded.");
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Failed to reset data");
    }
  }

  async function runPriceProbe() {
    setProbeLoading(true);
    setProbeError(null);
    setProbeResult(null);

    try {
      const resp = await fetch("/api/price-debug", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticker: probeTicker.trim().toUpperCase(),
          optionSymbol: probeOptionSymbol.trim().toUpperCase(),
        }),
      });

      const data = (await resp.json()) as unknown;
      if (!resp.ok) {
        const maybe = data as { error?: string };
        throw new Error(maybe.error ?? "Failed to fetch quote probe");
      }

      setProbeResult(JSON.stringify(data, null, 2));
    } catch (probeLoadError) {
      setProbeError(probeLoadError instanceof Error ? probeLoadError.message : "Failed to fetch quote probe");
    } finally {
      setProbeLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: DESIGN.bg, color: DESIGN.text, fontFamily: DESIGN.sans, padding: "20px" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h1 style={{ fontSize: "20px", color: DESIGN.bright, margin: 0 }}>Settings</h1>
          <Link href="/" style={{ fontSize: "11px", color: DESIGN.blue }}>Back to Dashboard</Link>
        </div>

        <Card style={{ marginBottom: "12px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: DESIGN.blue, marginBottom: "8px" }}>Account Info</div>
          <div style={{ display: "grid", gap: "6px", fontSize: "12px" }}>
            <div><span style={{ color: DESIGN.muted }}>Name:</span> {settings?.account_name ?? "—"}</div>
            <div><span style={{ color: DESIGN.muted }}>ID:</span> {settings?.account_id ?? "—"}</div>
            <div><span style={{ color: DESIGN.muted }}>Type:</span> {settings?.account_type ?? "—"}</div>
          </div>
        </Card>

        <Card style={{ marginBottom: "12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div>
              <label style={{ display: "block", fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase", marginBottom: "5px" }}>
                Interest Rate Estimate (%)
              </label>
              <input
                value={interestRate}
                onChange={(event) => setInterestRate(event.target.value)}
                type="number"
                step="0.01"
                style={{ width: "100%", background: "rgba(0,0,0,0.45)", color: DESIGN.text, border: `1px solid ${DESIGN.cardBorder}`, borderRadius: "6px", padding: "8px 10px", fontSize: "13px" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase", marginBottom: "5px" }}>
                Price API
              </label>
              <select
                value={priceApi}
                onChange={(event) => setPriceApi(event.target.value as "yahoo" | "alphavantage" | "manual")}
                style={{ width: "100%", background: "rgba(0,0,0,0.45)", color: DESIGN.text, border: `1px solid ${DESIGN.cardBorder}`, borderRadius: "6px", padding: "8px 10px", fontSize: "13px" }}
              >
                <option value="yahoo">Yahoo Finance (unofficial)</option>
                <option value="alphavantage">Alpha Vantage</option>
                <option value="manual">Manual Only</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: "10px" }}>
            <label style={{ display: "block", fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase", marginBottom: "5px" }}>
              Alpha Vantage Key (optional)
            </label>
            <input
              value={alphaKey}
              onChange={(event) => setAlphaKey(event.target.value)}
              type="text"
              style={{ width: "100%", background: "rgba(0,0,0,0.45)", color: DESIGN.text, border: `1px solid ${DESIGN.cardBorder}`, borderRadius: "6px", padding: "8px 10px", fontSize: "13px" }}
            />
            <div style={{ marginTop: "6px", fontSize: "11px", color: DESIGN.muted }}>
              If `MASSIVE_API_KEY` (or `POLYGON_API_KEY`) is set in env, Massive/Polygon quotes are used first for stocks and option legs.
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <button
              onClick={saveSettings}
              disabled={saving}
              style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${DESIGN.blue}44`, background: `${DESIGN.blue}18`, color: DESIGN.blue, fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>

            <a
              href="/api/export"
              style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${DESIGN.green}44`, background: `${DESIGN.green}18`, color: DESIGN.green, fontSize: "12px", fontWeight: 700, textDecoration: "none" }}
            >
              Export JSON Backup
            </a>

            <button
              onClick={resetData}
              style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${DESIGN.red}44`, background: `${DESIGN.red}18`, color: DESIGN.red, fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
            >
              Reset / Clear All Data
            </button>
          </div>

          {error && <div style={{ marginTop: "10px", color: DESIGN.red, fontSize: "12px" }}>{error}</div>}
          {message && <div style={{ marginTop: "10px", color: DESIGN.green, fontSize: "12px" }}>{message}</div>}
        </Card>

        <Card style={{ marginBottom: "12px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: DESIGN.blue, marginBottom: "8px" }}>
            Quote Debug (Massive vs Yahoo)
          </div>
          <div style={{ fontSize: "11px", color: DESIGN.muted, marginBottom: "10px" }}>
            Uses the same stock and option-leg fetch/parsing flow as Live Positions, but returns both sources side-by-side.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "8px", alignItems: "end" }}>
            <div>
              <label style={{ display: "block", fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase", marginBottom: "5px" }}>
                Ticker
              </label>
              <input
                value={probeTicker}
                onChange={(event) => setProbeTicker(event.target.value)}
                type="text"
                placeholder="ADBE"
                style={{ width: "100%", background: "rgba(0,0,0,0.45)", color: DESIGN.text, border: `1px solid ${DESIGN.cardBorder}`, borderRadius: "6px", padding: "8px 10px", fontSize: "13px" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase", marginBottom: "5px" }}>
                IB Option Symbol
              </label>
              <input
                value={probeOptionSymbol}
                onChange={(event) => setProbeOptionSymbol(event.target.value)}
                type="text"
                placeholder="ADBE 17APR26 450 C"
                style={{ width: "100%", background: "rgba(0,0,0,0.45)", color: DESIGN.text, border: `1px solid ${DESIGN.cardBorder}`, borderRadius: "6px", padding: "8px 10px", fontSize: "13px" }}
              />
            </div>
            <button
              onClick={runPriceProbe}
              disabled={probeLoading}
              style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${DESIGN.green}44`, background: `${DESIGN.green}18`, color: DESIGN.green, fontSize: "12px", fontWeight: 700, cursor: "pointer", minHeight: "38px" }}
            >
              {probeLoading ? "Fetching..." : "Fetch Both"}
            </button>
          </div>

          {probeError && <div style={{ marginTop: "10px", color: DESIGN.red, fontSize: "12px" }}>{probeError}</div>}

          {probeResult && (
            <pre
              style={{
                marginTop: "10px",
                padding: "10px",
                borderRadius: "6px",
                border: `1px solid ${DESIGN.cardBorder}`,
                background: "rgba(0,0,0,0.35)",
                color: DESIGN.text,
                fontSize: "11px",
                lineHeight: 1.45,
                overflowX: "auto",
                maxHeight: "360px",
                whiteSpace: "pre-wrap",
              }}
            >
              {probeResult}
            </pre>
          )}
        </Card>
      </div>
    </main>
  );
}
