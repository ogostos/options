import { DESIGN } from "@/lib/design";
import { estimateIronCondorPnLAtExpiry, getIronCondorZone } from "@/lib/options-zones";

interface BreakevenBarProps {
  price: number | null;
  strategy: string;
  legs: string;
  contracts: number;
  maxRisk: number;
  maxProfit: number | null;
  breakeven: number | null;
  stopLoss: number | null;
  strikeLong: number | null;
  strikeShort: number | null;
}

type Marker = {
  value: number;
  label: string;
  color: string;
};

type MarkerRender = Marker & {
  x: number;
  labelY: number;
  valueY: number;
  textAnchor: "start" | "middle" | "end";
  textDx: number;
};

type PayoffModel = {
  rangeMin: number;
  rangeMax: number;
  markers: Marker[];
  summary: string[];
  pnlAtPrice: (spot: number) => number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatPrice(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}

function withMarkerLayout(markers: Array<Marker & { x: number }>, width: number, padX: number, height: number, padY: number): MarkerRender[] {
  const sorted = [...markers].sort((a, b) => a.x - b.x);
  let lastTopX = Number.NEGATIVE_INFINITY;
  let topLane = 0;
  let lastBottomX = Number.NEGATIVE_INFINITY;
  let bottomLane = 0;

  return sorted.map((marker) => {
    if (marker.x - lastTopX < 40) {
      topLane = topLane === 0 ? 1 : 0;
    } else {
      topLane = 0;
    }
    lastTopX = marker.x;

    if (marker.x - lastBottomX < 52) {
      bottomLane = bottomLane === 0 ? 1 : 0;
    } else {
      bottomLane = 0;
    }
    lastBottomX = marker.x;

    const labelY = topLane === 0 ? padY + 12 : padY + 25;
    const valueY = bottomLane === 0 ? height - 6 : height - 20;

    let textAnchor: "start" | "middle" | "end" = "middle";
    let textDx = 0;
    if (marker.x <= padX + 14) {
      textAnchor = "start";
      textDx = 2;
    } else if (marker.x >= width - padX - 14) {
      textAnchor = "end";
      textDx = -2;
    }

    return {
      ...marker,
      labelY,
      valueY,
      textAnchor,
      textDx,
    };
  });
}

function buildPayoffModel({
  strategy,
  legs,
  contracts,
  maxRisk,
  maxProfit,
  breakeven,
  stopLoss,
  strikeLong,
  strikeShort,
}: Omit<BreakevenBarProps, "price">): PayoffModel | null {
  const size = Math.max(contracts || 1, 1);
  const condor = getIronCondorZone({
    strategy,
    legs,
    breakeven,
    maxProfit,
    contracts: size,
  });

  if (condor) {
    const spreadPadding = condor.width * 0.9;
    const rangeMin = condor.lowerWing - spreadPadding;
    const rangeMax = condor.upperWing + spreadPadding;
    const markers: Marker[] = [
      { value: condor.lowerWing, label: "LW", color: DESIGN.muted },
      { value: condor.lowerBreakeven, label: "BE-L", color: DESIGN.yellow },
      { value: condor.lowerShort, label: "S-P", color: DESIGN.green },
      { value: condor.upperShort, label: "S-C", color: DESIGN.green },
      { value: condor.upperBreakeven, label: "BE-U", color: DESIGN.yellow },
      { value: condor.upperWing, label: "UW", color: DESIGN.muted },
    ];
    if (stopLoss != null) {
      markers.push({ value: stopLoss, label: "STOP", color: DESIGN.red });
    }

    return {
      rangeMin,
      rangeMax,
      markers,
      summary: [
        `BE range $${condor.lowerBreakeven.toFixed(2)} - $${condor.upperBreakeven.toFixed(2)}`,
        `Max-profit core $${condor.lowerShort.toFixed(0)} - $${condor.upperShort.toFixed(0)}`,
      ],
      pnlAtPrice: (spot) => estimateIronCondorPnLAtExpiry(spot, condor, size),
    };
  }

  if (strikeLong == null || breakeven == null) return null;

  const lowerStrike = strikeShort == null ? strikeLong : Math.min(strikeLong, strikeShort);
  const upperStrike = strikeShort == null ? strikeLong : Math.max(strikeLong, strikeShort);
  const spreadWidth = Math.max(upperStrike - lowerStrike, 0.0001);
  const isBullish =
    strategy.includes("Call") ||
    strategy.includes("Bull") ||
    (strategy.includes("Long") && strategy.includes("Call"));
  const rangeMin = lowerStrike - spreadWidth * 1.2;
  const rangeMax = upperStrike + spreadWidth * 1.2;

  const markers: Marker[] = [
    { value: strikeLong, label: "LONG", color: DESIGN.muted },
    { value: breakeven, label: "BE", color: DESIGN.yellow },
  ];
  if (strikeShort != null) {
    markers.push({ value: strikeShort, label: "SHORT", color: DESIGN.green });
  }
  if (stopLoss != null) {
    markers.push({ value: stopLoss, label: "STOP", color: DESIGN.red });
  }

  const safeMaxProfit = maxProfit ?? spreadWidth * 100 * size;

  const pnlAtPrice = (spot: number) => {
    if (strikeShort != null) {
      if (isBullish) {
        if (spot <= lowerStrike) return -maxRisk;
        if (spot >= upperStrike) return safeMaxProfit;
        const t = (spot - lowerStrike) / (upperStrike - lowerStrike);
        return -maxRisk + t * (safeMaxProfit + maxRisk);
      }

      if (spot >= upperStrike) return -maxRisk;
      if (spot <= lowerStrike) return safeMaxProfit;
      const t = (spot - lowerStrike) / (upperStrike - lowerStrike);
      return safeMaxProfit - t * (safeMaxProfit + maxRisk);
    }

    if (strategy.includes("Put")) {
      return Math.max(0, strikeLong - spot) * 100 * size - maxRisk;
    }
    return Math.max(0, spot - strikeLong) * 100 * size - maxRisk;
  };

  return {
    rangeMin,
    rangeMax,
    markers,
      summary: [
        `Breakeven $${breakeven.toFixed(2)}`,
        `Max risk $${maxRisk.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      ],
    pnlAtPrice,
  };
}

export function BreakevenBar({
  price,
  strategy,
  legs,
  contracts,
  maxRisk,
  maxProfit,
  breakeven,
  stopLoss,
  strikeLong,
  strikeShort,
}: BreakevenBarProps) {
  const model = buildPayoffModel({
    strategy,
    legs,
    contracts,
    maxRisk,
    maxProfit,
    breakeven,
    stopLoss,
    strikeLong,
    strikeShort,
  });

  if (!model) return null;

  const width = 1000;
  const height = 190;
  const padX = 40;
  const padY = 20;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const points = Array.from({ length: 90 }, (_, idx) => {
    const t = idx / 89;
    const x = model.rangeMin + t * (model.rangeMax - model.rangeMin);
    const pnl = model.pnlAtPrice(x);
    return { x, pnl };
  });

  let pnlMin = Math.min(...points.map((p) => p.pnl), -maxRisk);
  let pnlMax = Math.max(...points.map((p) => p.pnl), maxProfit ?? 0);
  if (pnlMax <= pnlMin) pnlMax = pnlMin + 1;
  const pnlPadding = (pnlMax - pnlMin) * 0.15;
  pnlMin -= pnlPadding;
  pnlMax += pnlPadding;

  const xToSvg = (x: number) => padX + ((x - model.rangeMin) / (model.rangeMax - model.rangeMin)) * innerW;
  const yToSvg = (pnl: number) => padY + ((pnlMax - pnl) / (pnlMax - pnlMin)) * innerH;
  const zeroY = yToSvg(0);

  const markers = model.markers
    .filter((marker) => marker.value >= model.rangeMin && marker.value <= model.rangeMax)
    .map((marker) => ({ ...marker, x: xToSvg(marker.value) }));
  const laidOutMarkers = withMarkerLayout(markers, width, padX, height, padY);

  const priceX = price != null ? xToSvg(clamp(price, model.rangeMin, model.rangeMax)) : null;
  const pricePnl = price != null ? model.pnlAtPrice(price) : null;
  const priceY = pricePnl != null ? yToSvg(pricePnl) : null;

  return (
    <div style={{ marginTop: "10px" }}>
      <div style={{ display: "flex", gap: "12px", marginBottom: "6px", fontSize: "12px", flexWrap: "wrap" }}>
        {model.summary.map((line) => (
          <span key={line} style={{ color: DESIGN.muted }}>
            {line}
          </span>
        ))}
        {price != null && (
          <span style={{ color: pricePnl != null && pricePnl >= 0 ? DESIGN.green : DESIGN.red }}>
            Est. payoff now:{" "}
            <span style={{ fontFamily: DESIGN.mono, fontWeight: 700 }}>
              {pricePnl != null ? `${pricePnl >= 0 ? "+" : "-"}$${Math.abs(pricePnl).toFixed(2)}` : "—"}
            </span>
          </span>
        )}
      </div>

      <div
        style={{
          borderRadius: "8px",
          overflow: "hidden",
          border: `1px solid ${DESIGN.cardBorder}`,
          background:
            "linear-gradient(180deg, rgba(74,222,128,0.05) 0%, rgba(74,222,128,0.03) 48%, rgba(248,113,113,0.04) 52%, rgba(248,113,113,0.07) 100%)",
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          preserveAspectRatio="xMidYMid meet"
        >
          <line x1={padX} y1={zeroY} x2={width - padX} y2={zeroY} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />

          {points.slice(0, -1).map((point, index) => {
            const next = points[index + 1];
            const x1 = xToSvg(point.x);
            const y1 = yToSvg(point.pnl);
            const x2 = xToSvg(next.x);
            const y2 = yToSvg(next.pnl);
            const mid = (point.pnl + next.pnl) / 2;
            const stroke = mid >= 0 ? DESIGN.green : DESIGN.red;
            return <line key={`${index}-${point.x}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth="2.5" />;
          })}

          {laidOutMarkers.map((marker) => (
            <g key={`${marker.label}-${marker.value}`}>
              <line x1={marker.x} y1={padY} x2={marker.x} y2={height - padY} stroke={marker.color} strokeOpacity="0.7" />
              <text
                x={marker.x + marker.textDx}
                y={marker.labelY}
                fill={marker.color}
                fontSize="10"
                fontFamily={DESIGN.mono}
                textAnchor={marker.textAnchor}
                fontWeight="700"
              >
                {marker.label}
              </text>
              <text
                x={marker.x + marker.textDx}
                y={marker.valueY}
                fill={DESIGN.muted}
                fontSize="10"
                fontFamily={DESIGN.mono}
                textAnchor={marker.textAnchor}
              >
                {formatPrice(marker.value)}
              </text>
            </g>
          ))}

          {priceX != null && priceY != null && (
            <g>
              <circle
                cx={priceX}
                cy={priceY}
                r="5"
                fill={pricePnl != null && pricePnl >= 0 ? DESIGN.green : DESIGN.red}
                stroke="#fff"
                strokeWidth="2"
              />
              <text
                x={priceX}
                y={Math.max(padY + 12, priceY - 10)}
                fill={DESIGN.bright}
                fontSize="11"
                fontFamily={DESIGN.mono}
                textAnchor="middle"
                fontWeight="700"
              >
                ${price?.toFixed(2)}
              </text>
            </g>
          )}
        </svg>
      </div>

      <div style={{ display: "flex", gap: "14px", marginTop: "4px", fontSize: "10px", color: DESIGN.muted, flexWrap: "wrap" }}>
        <span>
          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: DESIGN.green, marginRight: "4px" }} />
          Profit zone
        </span>
        <span>
          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: DESIGN.red, marginRight: "4px" }} />
          Loss zone
        </span>
        <span>Dotted line: breakeven/payoff zero</span>
      </div>
    </div>
  );
}
