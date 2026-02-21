import { DESIGN } from "@/lib/design";

interface BreakevenBarProps {
  price: number | null;
  breakeven: number | null;
  stopLoss: number | null;
  strikeLong: number | null;
  strikeShort: number | null;
}

function clampPct(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function BreakevenBar({
  price,
  breakeven,
  stopLoss,
  strikeLong,
  strikeShort,
}: BreakevenBarProps) {
  if (breakeven == null || stopLoss == null || strikeLong == null) {
    return null;
  }

  const upperStrike = strikeShort ?? strikeLong + (breakeven - strikeLong) * 3;
  const rangeMin = Math.min(stopLoss, strikeLong * 0.92);
  const rangeMax = strikeShort != null ? upperStrike * 1.05 : breakeven * 1.15;
  const range = Math.max(0.0001, rangeMax - rangeMin);
  const toPct = (value: number) => clampPct(((value - rangeMin) / range) * 100);

  const loPct = toPct(strikeLong);
  const bePct = toPct(breakeven);
  const hiPct = strikeShort != null ? toPct(upperStrike) : null;
  const stopPct = toPct(stopLoss);
  const pricePct = price != null ? toPct(price) : null;

  const distToBE = price != null ? ((breakeven - price) / price) * 100 : null;
  const distToMax = price != null && strikeShort != null ? ((upperStrike - price) / price) * 100 : null;
  const inProfit = price != null ? price >= breakeven : false;
  const aboveLong = price != null ? price >= strikeLong : false;

  return (
    <div style={{ marginTop: "10px" }}>
      <div style={{ display: "flex", gap: "12px", marginBottom: "6px", fontSize: "11px", flexWrap: "wrap" }}>
        <span style={{ color: DESIGN.muted }}>
          Breakeven: <span style={{ fontFamily: DESIGN.mono, fontWeight: 700, color: DESIGN.yellow }}>${breakeven.toFixed(2)}</span>
        </span>
        {price != null && (
          <span style={{ color: inProfit ? DESIGN.green : DESIGN.red }}>
            {inProfit
              ? "✅ IN PROFIT ZONE"
              : `⚠ ${Math.abs(distToBE ?? 0).toFixed(1)}% below BE ($${(breakeven - price).toFixed(2)} to go)`}
          </span>
        )}
        {price != null && strikeShort != null && (
          <span style={{ color: price >= upperStrike ? DESIGN.green : DESIGN.muted }}>
            Max profit: ${upperStrike} {price < upperStrike ? `(${(distToMax ?? 0).toFixed(1)}% away)` : "✅ MAX"}
          </span>
        )}
        <span style={{ color: DESIGN.red, fontSize: "10px" }}>Stop: ${stopLoss}</span>
      </div>

      <div
        style={{
          position: "relative",
          height: "28px",
          borderRadius: "4px",
          overflow: "hidden",
          background: "rgba(255,255,255,0.02)",
          border: `1px solid ${DESIGN.cardBorder}`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            width: `${loPct}%`,
            height: "100%",
            background: "rgba(239,68,68,0.12)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${loPct}%`,
            width: `${bePct - loPct}%`,
            height: "100%",
            background: "rgba(250,204,21,0.10)",
          }}
        />

        {hiPct != null ? (
          <>
            <div
              style={{
                position: "absolute",
                left: `${bePct}%`,
                width: `${hiPct - bePct}%`,
                height: "100%",
                background: "rgba(74,222,128,0.12)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: `${hiPct}%`,
                right: 0,
                height: "100%",
                background: "rgba(74,222,128,0.20)",
              }}
            />
          </>
        ) : (
          <div
            style={{
              position: "absolute",
              left: `${bePct}%`,
              right: 0,
              height: "100%",
              background: "rgba(74,222,128,0.15)",
            }}
          />
        )}

        <div
          style={{
            position: "absolute",
            left: `${stopPct}%`,
            top: 0,
            bottom: 0,
            width: "2px",
            background: DESIGN.red,
            opacity: 0.6,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${stopPct}%`,
            top: "1px",
            fontSize: "8px",
            color: DESIGN.red,
            fontWeight: 700,
            transform: "translateX(-50%)",
          }}
        >
          STOP
        </div>

        <div
          style={{
            position: "absolute",
            left: `${loPct}%`,
            top: 0,
            bottom: 0,
            width: "1px",
            background: "rgba(255,255,255,0.3)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${loPct}%`,
            bottom: "1px",
            fontSize: "8px",
            color: DESIGN.muted,
            fontFamily: DESIGN.mono,
            transform: "translateX(-50%)",
          }}
        >
          {strikeLong}
        </div>

        <div
          style={{
            position: "absolute",
            left: `${bePct}%`,
            top: 0,
            bottom: 0,
            width: "2px",
            background: DESIGN.yellow,
            opacity: 0.8,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${bePct}%`,
            top: "1px",
            fontSize: "8px",
            color: DESIGN.yellow,
            fontWeight: 700,
            fontFamily: DESIGN.mono,
            transform: "translateX(-50%)",
          }}
        >
          BE
        </div>

        {hiPct != null && (
          <>
            <div
              style={{
                position: "absolute",
                left: `${hiPct}%`,
                top: 0,
                bottom: 0,
                width: "1px",
                background: DESIGN.green,
                opacity: 0.5,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: `${hiPct}%`,
                bottom: "1px",
                fontSize: "8px",
                color: DESIGN.green,
                fontFamily: DESIGN.mono,
                transform: "translateX(-50%)",
              }}
            >
              {upperStrike}
            </div>
          </>
        )}

        {pricePct != null && (
          <>
            <div
              style={{
                position: "absolute",
                left: `${pricePct}%`,
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: inProfit ? DESIGN.green : aboveLong ? DESIGN.yellow : DESIGN.red,
                border: "2px solid #fff",
                boxShadow: `0 0 6px ${inProfit ? DESIGN.green : aboveLong ? DESIGN.yellow : DESIGN.red}`,
                zIndex: 10,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: `${pricePct}%`,
                top: "-1px",
                transform: "translateX(-50%)",
                fontSize: "9px",
                fontWeight: 700,
                fontFamily: DESIGN.mono,
                color: DESIGN.bright,
                zIndex: 10,
                background: "rgba(0,0,0,0.7)",
                padding: "0 3px",
                borderRadius: "2px",
              }}
            >
              ${price?.toFixed(0)}
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: "12px", marginTop: "4px", fontSize: "9px", color: DESIGN.muted }}>
        <span>
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              background: "rgba(239,68,68,0.25)",
              borderRadius: "2px",
              marginRight: "3px",
            }}
          />
          Max Loss
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              background: "rgba(250,204,21,0.25)",
              borderRadius: "2px",
              marginRight: "3px",
            }}
          />
          Partial (recovering debit)
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              background: "rgba(74,222,128,0.25)",
              borderRadius: "2px",
              marginRight: "3px",
            }}
          />
          Profit Zone
        </span>
        {hiPct != null && (
          <span>
            <span
              style={{
                display: "inline-block",
                width: "8px",
                height: "8px",
                background: "rgba(74,222,128,0.4)",
                borderRadius: "2px",
                marginRight: "3px",
              }}
            />
            Max Profit
          </span>
        )}
      </div>
    </div>
  );
}
