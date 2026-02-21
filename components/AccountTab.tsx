import { Card, Label, Value } from "@/components/ui/primitives";
import { DESIGN, formatMoney, formatSigned } from "@/lib/design";
import type { AccountSnapshot, Trade } from "@/lib/types";

export function AccountTab({
  account,
  closedTrades,
  openTrades,
}: {
  account: AccountSnapshot;
  closedTrades: Trade[];
  openTrades: Trade[];
}) {
  const closedWins = closedTrades.filter((trade) => trade.status === "WIN");
  const closedLosses = closedTrades.filter((trade) => trade.status === "LOSS" || trade.status === "EXPIRED");
  const totalClosedPL = closedTrades.reduce((sum, trade) => sum + (trade.realized_pl ?? 0), 0);
  const totalOpenPL = openTrades.reduce((sum, trade) => sum + (trade.unrealized_pl ?? 0), 0);

  const avgWin =
    closedWins.length > 0
      ? closedWins.reduce((sum, trade) => sum + (trade.realized_pl ?? 0), 0) / closedWins.length
      : 0;
  const avgLoss =
    closedLosses.length > 0
      ? closedLosses.reduce((sum, trade) => sum + (trade.realized_pl ?? 0), 0) / closedLosses.length
      : 0;

  const totalRisk = openTrades.reduce((sum, trade) => sum + trade.max_risk, 0);
  const profitFactor =
    Math.abs(closedLosses.reduce((sum, trade) => sum + (trade.realized_pl ?? 0), 0)) > 0
      ? closedWins.reduce((sum, trade) => sum + (trade.realized_pl ?? 0), 0) /
        Math.abs(closedLosses.reduce((sum, trade) => sum + (trade.realized_pl ?? 0), 0))
      : 0;

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "10px",
          marginBottom: "16px",
        }}
      >
        <Card>
          <Label>Starting NAV</Label>
          <Value>{formatMoney(account.start_nav)}</Value>
        </Card>
        <Card>
          <Label>Current NAV</Label>
          <Value color={account.end_nav >= account.start_nav ? DESIGN.green : DESIGN.red}>{formatMoney(account.end_nav)}</Value>
        </Card>
        <Card>
          <Label>P/L</Label>
          <Value color={account.end_nav - account.start_nav >= 0 ? DESIGN.green : DESIGN.red}>
            {formatSigned(account.end_nav - account.start_nav)}
          </Value>
        </Card>
        <Card>
          <Label>TWR</Label>
          <Value color={account.twr >= 0 ? DESIGN.green : DESIGN.red}>{account.twr.toFixed(2)}%</Value>
        </Card>
        <Card>
          <Label>Options P/L (closed)</Label>
          <Value color={totalClosedPL >= 0 ? DESIGN.green : DESIGN.red}>{formatSigned(totalClosedPL)}</Value>
        </Card>
        <Card>
          <Label>Options (unrealized)</Label>
          <Value color={totalOpenPL >= 0 ? DESIGN.green : DESIGN.red}>{formatSigned(totalOpenPL)}</Value>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
        <Card style={{ borderColor: "rgba(239,68,68,0.2)" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: DESIGN.red, marginBottom: "12px" }}>⚠ MARGIN & DEBT</div>
          <div style={{ display: "grid", gap: "8px", fontSize: "13px" }}>
            {[
              ["Cash Balance", formatSigned(account.cash_end), DESIGN.red],
              ["Margin Debt", formatMoney(Math.abs(account.cash_end)), DESIGN.red],
              ["Interest Rate (est.)", `${account.interest_rate_est.toFixed(2)}% p.a.`, DESIGN.yellow],
              ["Interest Accrued", formatMoney(Math.abs(account.interest_accrued)), DESIGN.red],
              [
                "Daily Interest (est.)",
                `~${formatMoney(Math.abs(account.cash_end) * account.interest_rate_est / 100 / 365)}`,
                DESIGN.yellow,
              ],
              [
                "Monthly Interest (est.)",
                `~${formatMoney(Math.abs(account.cash_end) * account.interest_rate_est / 100 / 12)}`,
                DESIGN.yellow,
              ],
              ["Settled Cash", formatMoney(Math.abs(account.cash_settled)), DESIGN.muted],
            ].map(([label, value, color]) => (
              <div
                key={String(label)}
                style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${DESIGN.cardBorder}`, paddingBottom: "4px" }}
              >
                <span style={{ color: DESIGN.muted }}>{label}</span>
                <span style={{ fontFamily: DESIGN.mono, fontWeight: 600, color: String(color) }}>{String(value)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ borderColor: "rgba(99,102,241,0.2)" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: DESIGN.blue, marginBottom: "12px" }}>📊 ASSET BREAKDOWN</div>
          <div style={{ display: "grid", gap: "8px", fontSize: "13px" }}>
            {[
              ["Stock Value", formatMoney(account.stock_total), DESIGN.text],
              ["Options (Long)", formatMoney(account.options_long), DESIGN.green],
              ["Options (Short)", formatMoney(Math.abs(account.options_short)), DESIGN.red],
              ["Options (Net)", formatMoney(account.options_total), DESIGN.text],
              ["Total Assets", formatMoney(account.stock_long + account.options_long), DESIGN.text],
              ["Total Liabilities", formatMoney(Math.abs(account.cash_end) + Math.abs(account.options_short)), DESIGN.red],
              ["Commissions Paid", formatMoney(Math.abs(account.commissions_total)), DESIGN.red],
            ].map(([label, value, color]) => (
              <div
                key={String(label)}
                style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${DESIGN.cardBorder}`, paddingBottom: "4px" }}
              >
                <span style={{ color: DESIGN.muted }}>{label}</span>
                <span style={{ fontFamily: DESIGN.mono, fontWeight: 600, color: String(color) }}>{String(value)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: DESIGN.purple, marginBottom: "12px" }}>📈 OPTIONS TRADING STATS</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "10px",
            fontSize: "13px",
          }}
        >
          {[
            [
              "Win Rate",
              `${closedWins.length}/${closedWins.length + closedLosses.length} (${((closedWins.length / Math.max(closedWins.length + closedLosses.length, 1)) * 100).toFixed(0)}%)`,
              DESIGN.yellow,
            ],
            ["Avg Winner", formatSigned(avgWin), DESIGN.green],
            ["Avg Loser", formatSigned(avgLoss), DESIGN.red],
            ["Profit Factor", profitFactor.toFixed(2), DESIGN.yellow],
            ["Total Wins $", formatSigned(closedWins.reduce((sum, trade) => sum + (trade.realized_pl ?? 0), 0)), DESIGN.green],
            ["Total Losses $", formatSigned(closedLosses.reduce((sum, trade) => sum + (trade.realized_pl ?? 0), 0)), DESIGN.red],
            ["Open Positions", String(openTrades.length), DESIGN.blue],
            ["Open Risk", formatMoney(totalRisk), DESIGN.yellow],
          ].map(([label, value, color]) => (
            <div key={String(label)}>
              <div
                style={{
                  color: DESIGN.muted,
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "3px",
                }}
              >
                {label}
              </div>
              <div style={{ fontFamily: DESIGN.mono, fontWeight: 700, color: String(color) }}>{String(value)}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ borderColor: "rgba(239,68,68,0.15)", background: "rgba(239,68,68,0.03)" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: DESIGN.red, marginBottom: "8px" }}>⚠ WHERE THE MONEY WENT</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
          <div>
            <span style={{ color: DESIGN.muted }}>AMZN alone:</span>{" "}
            <span style={{ color: DESIGN.red, fontFamily: DESIGN.mono, fontWeight: 700 }}>{formatSigned(-3938)}</span>
          </div>
          <div>
            <span style={{ color: DESIGN.muted }}>Top 3 losers:</span>{" "}
            <span style={{ color: DESIGN.red, fontFamily: DESIGN.mono, fontWeight: 700 }}>{formatSigned(-5985)}</span>
          </div>
          <div>
            <span style={{ color: DESIGN.muted }}>All 5 winners:</span>{" "}
            <span style={{ color: DESIGN.green, fontFamily: DESIGN.mono, fontWeight: 700 }}>{formatSigned(2264)}</span>
          </div>
          <div>
            <span style={{ color: DESIGN.muted }}>ADBE unrealized:</span>{" "}
            <span style={{ color: DESIGN.red, fontFamily: DESIGN.mono, fontWeight: 700 }}>{formatSigned(-4569)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
