import { Card, Pill } from "@/components/ui/primitives";
import { DESIGN, formatMoney, formatSigned } from "@/lib/design";
import type { ImportPreview } from "@/lib/types";

export function ImportPreviewPanel({ preview }: { preview: ImportPreview }) {
  const matchCount = preview.trades.filter((item) => item.matchStatus === "match").length;
  const newCount = preview.trades.filter((item) => item.matchStatus === "new").length;
  const conflictCount = preview.trades.filter((item) => item.matchStatus === "conflict").length;

  return (
    <div style={{ marginTop: "16px" }}>
      <Card style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: DESIGN.blue, marginBottom: "10px" }}>
          Import Preview Summary
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px", marginBottom: "10px" }}>
          <div>
            <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Matched</div>
            <div style={{ fontSize: "16px", fontFamily: DESIGN.mono, fontWeight: 700, color: DESIGN.green }}>{matchCount}</div>
          </div>
          <div>
            <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>New</div>
            <div style={{ fontSize: "16px", fontFamily: DESIGN.mono, fontWeight: 700, color: DESIGN.yellow }}>{newCount}</div>
          </div>
          <div>
            <div style={{ fontSize: "10px", color: DESIGN.muted, textTransform: "uppercase" }}>Conflicts</div>
            <div style={{ fontSize: "16px", fontFamily: DESIGN.mono, fontWeight: 700, color: DESIGN.red }}>{conflictCount}</div>
          </div>
        </div>

        <div style={{ fontSize: "11px", color: DESIGN.muted, lineHeight: 1.6 }}>
          Account snapshot detected:
          {preview.account.start_nav != null && (
            <>
              {" "}
              NAV {formatMoney(preview.account.start_nav)} → {formatMoney(preview.account.end_nav ?? 0)}
            </>
          )}
        </div>

        {preview.errors.length > 0 && (
          <div
            style={{
              marginTop: "10px",
              padding: "8px 10px",
              borderRadius: "6px",
              background: `${DESIGN.red}08`,
              border: `1px solid ${DESIGN.red}20`,
            }}
          >
            <div style={{ fontSize: "11px", color: DESIGN.red, fontWeight: 700, marginBottom: "4px" }}>Parser warnings</div>
            {preview.errors.map((error) => (
              <div key={error} style={{ fontSize: "11px", color: DESIGN.text, lineHeight: 1.4 }}>
                • {error}
              </div>
            ))}
          </div>
        )}
      </Card>

      {preview.trades.map((item, index) => {
        const color =
          item.matchStatus === "match"
            ? DESIGN.green
            : item.matchStatus === "new"
              ? DESIGN.yellow
              : DESIGN.red;

        const pnl = item.trade.status === "OPEN" ? item.trade.unrealized_pl : item.trade.realized_pl;

        return (
          <Card key={`${item.trade.ticker}-${index}`} style={{ marginBottom: "6px", borderColor: `${color}30` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: DESIGN.bright }}>
                  {item.trade.ticker} <span style={{ fontSize: "11px", color: DESIGN.muted }}>{item.trade.strategy}</span>
                </div>
                <div style={{ fontSize: "11px", color: DESIGN.muted }}>{item.trade.legs}</div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "12px", fontFamily: DESIGN.mono, fontWeight: 700, color: pnl != null && pnl >= 0 ? DESIGN.green : DESIGN.red }}>
                  {pnl == null ? "—" : formatSigned(pnl)}
                </div>
                <Pill color={color} background={`${color}18`}>
                  {item.matchStatus.toUpperCase()}
                </Pill>
              </div>
            </div>

            <div style={{ fontSize: "11px", color: DESIGN.muted, marginTop: "8px" }}>{item.reason}</div>
          </Card>
        );
      })}
    </div>
  );
}
