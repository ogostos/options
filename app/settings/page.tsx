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
      </div>
    </main>
  );
}
