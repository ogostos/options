import { DESIGN } from "@/lib/design";
import { classifyIronCondorPriceZone, getIronCondorZone } from "@/lib/options-zones";

interface BreakevenBarProps {
  price: number | null;
  strategy: string;
  legs: string;
  contracts: number;
  maxProfit: number | null;
  breakeven: number | null;
  stopLoss: number | null;
  strikeLong: number | null;
  strikeShort: number | null;
}

function clampPct(value: number) {
  return Math.max(0, Math.min(100, value));
}

function swatch(color: string) {
  return (
    <span
      style={{
        display: "inline-block",
        width: "8px",
        height: "8px",
        background: color,
        borderRadius: "2px",
        marginRight: "3px",
      }}
    />
  );
}

function renderSingleBreakeven({
  price,
  breakeven,
  stopLoss,
  strikeLong,
  strikeShort,
}: Pick<BreakevenBarProps, "price" | "breakeven" | "stopLoss" | "strikeLong" | "strikeShort">) {
  if (breakeven == null || stopLoss == null || strikeLong == null) return null;

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
          Breakeven:{" "}
          <span style={{ fontFamily: DESIGN.mono, fontWeight: 700, color: DESIGN.yellow }}>${breakeven.toFixed(2)}</span>
        </span>
        {price != null && (
          <span style={{ color: inProfit ? DESIGN.green : DESIGN.red }}>
            {inProfit
              ? "IN PROFIT ZONE"
              : `${Math.abs(distToBE ?? 0).toFixed(1)}% below BE ($${(breakeven - price).toFixed(2)} to go)`}
          </span>
        )}
        {price != null && strikeShort != null && (
          <span style={{ color: price >= upperStrike ? DESIGN.green : DESIGN.muted }}>
            Max profit: ${upperStrike} {price < upperStrike ? `(${(distToMax ?? 0).toFixed(1)}% away)` : "MAX"}
          </span>
        )}
        <span style={{ color: DESIGN.red, fontSize: "10px" }}>Stop: ${stopLoss}</span>
      </div>

      <div
        style={{
          position: "relative",
          height: "32px",
          borderRadius: "4px",
          overflow: "hidden",
          background: "rgba(255,255,255,0.02)",
          border: `1px solid ${DESIGN.cardBorder}`,
        }}
      >
        <div style={{ position: "absolute", left: 0, width: `${loPct}%`, height: "100%", background: "rgba(239,68,68,0.12)" }} />
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
            fontSize: "9px",
            color: DESIGN.red,
            fontWeight: 700,
            transform: "translateX(-50%)",
          }}
        >
          STOP
        </div>

        <div style={{ position: "absolute", left: `${loPct}%`, top: 0, bottom: 0, width: "1px", background: "rgba(255,255,255,0.3)" }} />
        <div
          style={{
            position: "absolute",
            left: `${loPct}%`,
            bottom: "1px",
            fontSize: "9px",
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
            fontSize: "9px",
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
                fontSize: "9px",
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
        <span>{swatch("rgba(239,68,68,0.25)")}Max Loss</span>
        <span>{swatch("rgba(250,204,21,0.25)")}Partial (recovering debit)</span>
        <span>{swatch("rgba(74,222,128,0.25)")}Profit Zone</span>
        {hiPct != null && <span>{swatch("rgba(74,222,128,0.4)")}Max Profit</span>}
      </div>
    </div>
  );
}

export function BreakevenBar({
  price,
  strategy,
  legs,
  contracts,
  maxProfit,
  breakeven,
  stopLoss,
  strikeLong,
  strikeShort,
}: BreakevenBarProps) {
  const condor = getIronCondorZone({
    strategy,
    legs,
    breakeven,
    maxProfit,
    contracts,
  });

  if (!condor) {
    return renderSingleBreakeven({
      price,
      breakeven,
      stopLoss,
      strikeLong,
      strikeShort,
    });
  }

  const stopDown =
    stopLoss != null && stopLoss <= condor.lowerBreakeven
      ? stopLoss
      : stopLoss != null && stopLoss > condor.upperBreakeven
        ? Number((condor.lowerBreakeven - (stopLoss - condor.upperBreakeven)).toFixed(2))
        : null;

  const stopUp =
    stopLoss != null && stopLoss >= condor.upperBreakeven
      ? stopLoss
      : stopDown != null
        ? Number((condor.upperBreakeven + (condor.lowerBreakeven - stopDown)).toFixed(2))
        : null;

  const rangeMin = Math.min(condor.lowerWing - condor.width * 0.7, stopDown ?? Number.POSITIVE_INFINITY);
  const rangeMax = Math.max(condor.upperWing + condor.width * 0.7, stopUp ?? Number.NEGATIVE_INFINITY);
  const range = Math.max(0.0001, rangeMax - rangeMin);
  const toPct = (value: number) => clampPct(((value - rangeMin) / range) * 100);

  const lowerWingPct = toPct(condor.lowerWing);
  const lowerBEPct = toPct(condor.lowerBreakeven);
  const lowerShortPct = toPct(condor.lowerShort);
  const upperShortPct = toPct(condor.upperShort);
  const upperBEPct = toPct(condor.upperBreakeven);
  const upperWingPct = toPct(condor.upperWing);
  const stopDownPct = stopDown != null ? toPct(stopDown) : null;
  const stopUpPct = stopUp != null ? toPct(stopUp) : null;
  const pricePct = price != null ? toPct(price) : null;

  const priceZone = price != null ? classifyIronCondorPriceZone(price, condor) : null;
  const inProfit = price != null ? price >= condor.lowerBreakeven && price <= condor.upperBreakeven : false;
  const inCore = priceZone === "max_profit_core";

  const distanceToBe =
    price == null
      ? null
      : price < condor.lowerBreakeven
        ? condor.lowerBreakeven - price
        : price > condor.upperBreakeven
          ? price - condor.upperBreakeven
          : Math.min(price - condor.lowerBreakeven, condor.upperBreakeven - price);

  const zoneColor =
    priceZone == null
      ? DESIGN.muted
      : priceZone === "max_profit_core"
        ? DESIGN.green
        : priceZone === "profit_low" || priceZone === "profit_high"
          ? DESIGN.green
          : priceZone === "recover_low" || priceZone === "recover_high"
            ? DESIGN.yellow
            : DESIGN.red;

  return (
    <div style={{ marginTop: "10px" }}>
      <div style={{ display: "flex", gap: "12px", marginBottom: "6px", fontSize: "11px", flexWrap: "wrap" }}>
        <span style={{ color: DESIGN.muted }}>
          BE Range:{" "}
          <span style={{ fontFamily: DESIGN.mono, fontWeight: 700, color: DESIGN.yellow }}>
            ${condor.lowerBreakeven.toFixed(2)} - ${condor.upperBreakeven.toFixed(2)}
          </span>
        </span>
        <span style={{ color: DESIGN.muted }}>
          Max-profit core:{" "}
          <span style={{ fontFamily: DESIGN.mono, fontWeight: 700, color: DESIGN.green }}>
            ${condor.lowerShort.toFixed(0)} - ${condor.upperShort.toFixed(0)}
          </span>
        </span>
        {price != null && (
          <span style={{ color: zoneColor }}>
            {inCore
              ? "IN MAX PROFIT CORE"
              : inProfit
                ? `IN PROFIT ZONE (${((distanceToBe ?? 0) / price * 100).toFixed(1)}% cushion)`
                : price < condor.lowerBreakeven
                  ? `${((distanceToBe ?? 0) / price * 100).toFixed(1)}% below BE-L ($${(distanceToBe ?? 0).toFixed(2)} to reclaim)`
                  : `${((distanceToBe ?? 0) / price * 100).toFixed(1)}% above BE-U ($${(distanceToBe ?? 0).toFixed(2)} to reclaim)`}
          </span>
        )}
        {(stopDown != null || stopUp != null) && (
          <span style={{ color: DESIGN.red, fontSize: "10px" }}>
            Stops: {stopDown != null ? `$${stopDown.toFixed(2)}` : "—"} / {stopUp != null ? `$${stopUp.toFixed(2)}` : "—"}
          </span>
        )}
      </div>

      <div
        style={{
          position: "relative",
          height: "30px",
          borderRadius: "4px",
          overflow: "hidden",
          background: "rgba(255,255,255,0.02)",
          border: `1px solid ${DESIGN.cardBorder}`,
        }}
      >
        <div style={{ position: "absolute", left: 0, width: `${lowerWingPct}%`, height: "100%", background: "rgba(239,68,68,0.14)" }} />
        <div
          style={{
            position: "absolute",
            left: `${lowerWingPct}%`,
            width: `${Math.max(0, lowerBEPct - lowerWingPct)}%`,
            height: "100%",
            background: "rgba(250,204,21,0.12)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${lowerBEPct}%`,
            width: `${Math.max(0, lowerShortPct - lowerBEPct)}%`,
            height: "100%",
            background: "rgba(74,222,128,0.12)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${lowerShortPct}%`,
            width: `${Math.max(0, upperShortPct - lowerShortPct)}%`,
            height: "100%",
            background: "rgba(74,222,128,0.25)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${upperShortPct}%`,
            width: `${Math.max(0, upperBEPct - upperShortPct)}%`,
            height: "100%",
            background: "rgba(74,222,128,0.12)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${upperBEPct}%`,
            width: `${Math.max(0, upperWingPct - upperBEPct)}%`,
            height: "100%",
            background: "rgba(250,204,21,0.12)",
          }}
        />
        <div style={{ position: "absolute", left: `${upperWingPct}%`, right: 0, height: "100%", background: "rgba(239,68,68,0.14)" }} />

        {stopDownPct != null && (
          <>
            <div
              style={{
                position: "absolute",
                left: `${stopDownPct}%`,
                top: 0,
                bottom: 0,
                width: "2px",
                background: DESIGN.red,
                opacity: 0.8,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: `${stopDownPct}%`,
                top: "1px",
                fontSize: "9px",
                color: DESIGN.red,
                fontWeight: 700,
                transform: "translateX(-50%)",
              }}
            >
              STOP
            </div>
          </>
        )}
        {stopUpPct != null && (
          <>
            <div
              style={{
                position: "absolute",
                left: `${stopUpPct}%`,
                top: 0,
                bottom: 0,
                width: "2px",
                background: DESIGN.red,
                opacity: 0.8,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: `${stopUpPct}%`,
                top: "1px",
                fontSize: "9px",
                color: DESIGN.red,
                fontWeight: 700,
                transform: "translateX(-50%)",
              }}
            >
              STOP
            </div>
          </>
        )}

        <div style={{ position: "absolute", left: `${lowerWingPct}%`, top: 0, bottom: 0, width: "1px", background: "rgba(255,255,255,0.3)" }} />
        <div style={{ position: "absolute", left: `${upperWingPct}%`, top: 0, bottom: 0, width: "1px", background: "rgba(255,255,255,0.3)" }} />
        <div style={{ position: "absolute", left: `${lowerShortPct}%`, top: 0, bottom: 0, width: "1px", background: `${DESIGN.green}aa` }} />
        <div style={{ position: "absolute", left: `${upperShortPct}%`, top: 0, bottom: 0, width: "1px", background: `${DESIGN.green}aa` }} />
        <div style={{ position: "absolute", left: `${lowerBEPct}%`, top: 0, bottom: 0, width: "2px", background: DESIGN.yellow, opacity: 0.85 }} />
        <div style={{ position: "absolute", left: `${upperBEPct}%`, top: 0, bottom: 0, width: "2px", background: DESIGN.yellow, opacity: 0.85 }} />

        <div
          style={{
            position: "absolute",
            left: `${lowerBEPct}%`,
            top: "1px",
            fontSize: "8px",
            color: DESIGN.yellow,
            fontWeight: 700,
            fontFamily: DESIGN.mono,
            transform: "translateX(-50%)",
          }}
        >
          BE-L
        </div>
        <div
          style={{
            position: "absolute",
            left: `${upperBEPct}%`,
            top: "1px",
            fontSize: "8px",
            color: DESIGN.yellow,
            fontWeight: 700,
            fontFamily: DESIGN.mono,
            transform: "translateX(-50%)",
          }}
        >
          BE-U
        </div>

        <div
          style={{
            position: "absolute",
            left: `${lowerWingPct}%`,
            bottom: "1px",
            fontSize: "8px",
            color: DESIGN.muted,
            fontFamily: DESIGN.mono,
            transform: "translateX(-50%)",
          }}
        >
          {condor.lowerWing}
        </div>
        <div
          style={{
            position: "absolute",
            left: `${lowerShortPct}%`,
            bottom: "1px",
            fontSize: "8px",
            color: DESIGN.green,
            fontFamily: DESIGN.mono,
            transform: "translateX(-50%)",
          }}
        >
          {condor.lowerShort}
        </div>
        <div
          style={{
            position: "absolute",
            left: `${upperShortPct}%`,
            bottom: "1px",
            fontSize: "8px",
            color: DESIGN.green,
            fontFamily: DESIGN.mono,
            transform: "translateX(-50%)",
          }}
        >
          {condor.upperShort}
        </div>
        <div
          style={{
            position: "absolute",
            left: `${upperWingPct}%`,
            bottom: "1px",
            fontSize: "8px",
            color: DESIGN.muted,
            fontFamily: DESIGN.mono,
            transform: "translateX(-50%)",
          }}
        >
          {condor.upperWing}
        </div>

        {pricePct != null && (
          <>
            <div
              style={{
                position: "absolute",
                left: `${pricePct}%`,
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: "9px",
                height: "9px",
                borderRadius: "50%",
                background: zoneColor,
                border: "2px solid #fff",
                boxShadow: `0 0 8px ${zoneColor}`,
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

      <div style={{ display: "flex", gap: "12px", marginTop: "4px", fontSize: "9px", color: DESIGN.muted, flexWrap: "wrap" }}>
        <span>{swatch("rgba(239,68,68,0.25)")}Max Loss</span>
        <span>{swatch("rgba(250,204,21,0.25)")}Recovery Zone</span>
        <span>{swatch("rgba(74,222,128,0.25)")}Profit Zone</span>
        <span>{swatch("rgba(74,222,128,0.45)")}Max Profit Core</span>
      </div>
    </div>
  );
}
