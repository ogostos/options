import { DESIGN } from "@/lib/design";
import {
  classifyIronCondorPriceZone,
  estimateIronCondorPnLAtExpiry,
  getIronCondorZone,
} from "@/lib/options-zones";

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

type ZoneSegment = {
  from: number;
  to: number;
  color: string;
};

type PayoffModel = {
  rangeMin: number;
  rangeMax: number;
  markers: Marker[];
  segments: ZoneSegment[];
  summary: string[];
  pnlAtPrice: (spot: number) => number;
  colorAtPrice: (spot: number) => string;
};

const ZONE = {
  maxLoss: "rgba(248,113,113,0.26)",
  recover: "rgba(251,191,36,0.24)",
  profit: "rgba(74,222,128,0.22)",
  maxProfit: "rgba(74,222,128,0.36)",
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatPrice(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}

function withMarkerLayout(markers: Array<Marker & { x: number }>, width: number, padX: number): MarkerRender[] {
  const sorted = [...markers].sort((a, b) => a.x - b.x);
  let lastTopX = Number.NEGATIVE_INFINITY;
  let topLane = 0;
  let lastBottomX = Number.NEGATIVE_INFINITY;
  let bottomLane = 0;

  return sorted.map((marker) => {
    if (marker.x - lastTopX < 28) {
      topLane = topLane === 0 ? 1 : 0;
    } else {
      topLane = 0;
    }
    lastTopX = marker.x;

    if (marker.x - lastBottomX < 34) {
      bottomLane = bottomLane === 0 ? 1 : 0;
    } else {
      bottomLane = 0;
    }
    lastBottomX = marker.x;

    const labelY = topLane === 0 ? 8 : 14;
    const valueY = bottomLane === 0 ? 70 : 64;

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

function safeSegment(from: number, to: number, color: string): ZoneSegment | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  return { from, to, color };
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
    const padding = condor.width * 0.9;
    const rangeMin = condor.lowerWing - padding;
    const rangeMax = condor.upperWing + padding;
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

    const segments = [
      safeSegment(rangeMin, condor.lowerWing, ZONE.maxLoss),
      safeSegment(condor.lowerWing, condor.lowerBreakeven, ZONE.recover),
      safeSegment(condor.lowerBreakeven, condor.lowerShort, ZONE.profit),
      safeSegment(condor.lowerShort, condor.upperShort, ZONE.maxProfit),
      safeSegment(condor.upperShort, condor.upperBreakeven, ZONE.profit),
      safeSegment(condor.upperBreakeven, condor.upperWing, ZONE.recover),
      safeSegment(condor.upperWing, rangeMax, ZONE.maxLoss),
    ].filter((segment): segment is ZoneSegment => Boolean(segment));

    return {
      rangeMin,
      rangeMax,
      markers,
      segments,
      summary: [
        `BE range $${condor.lowerBreakeven.toFixed(2)} - $${condor.upperBreakeven.toFixed(2)}`,
        `Max-profit core $${condor.lowerShort.toFixed(0)} - $${condor.upperShort.toFixed(0)}`,
      ],
      pnlAtPrice: (spot) => estimateIronCondorPnLAtExpiry(spot, condor, size),
      colorAtPrice: (spot) => {
        const zone = classifyIronCondorPriceZone(spot, condor);
        if (zone === "max_loss_low" || zone === "max_loss_high") return DESIGN.red;
        if (zone === "recover_low" || zone === "recover_high") return DESIGN.yellow;
        return DESIGN.green;
      },
    };
  }

  if (strikeLong == null || breakeven == null) return null;

  const isBullish =
    strategy.includes("Call") ||
    strategy.includes("Bull") ||
    (strategy.includes("Long") && strategy.includes("Call"));
  const isPut = strategy.includes("Put");

  let lowerStrike = strikeShort == null ? strikeLong : Math.min(strikeLong, strikeShort);
  let upperStrike = strikeShort == null ? strikeLong : Math.max(strikeLong, strikeShort);

  if (strikeShort == null) {
    const gap = Math.max(Math.abs(breakeven - strikeLong), Math.abs(strikeLong) * 0.03, 1);
    if (isBullish) {
      lowerStrike = strikeLong;
      upperStrike = strikeLong + gap * 2;
    } else {
      upperStrike = strikeLong;
      lowerStrike = strikeLong - gap * 2;
    }
  }

  const width = Math.max(upperStrike - lowerStrike, 0.0001);
  const rangeMin = lowerStrike - width * 1.15;
  const rangeMax = upperStrike + width * 1.15;

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

  const segments = isBullish
    ? [
        safeSegment(rangeMin, lowerStrike, ZONE.maxLoss),
        safeSegment(lowerStrike, breakeven, ZONE.recover),
        safeSegment(breakeven, upperStrike, ZONE.profit),
        safeSegment(upperStrike, rangeMax, ZONE.maxProfit),
      ]
    : [
        safeSegment(rangeMin, lowerStrike, ZONE.maxProfit),
        safeSegment(lowerStrike, breakeven, ZONE.profit),
        safeSegment(breakeven, upperStrike, ZONE.recover),
        safeSegment(upperStrike, rangeMax, ZONE.maxLoss),
      ];

  const safeMaxProfit = maxProfit ?? width * 100 * size;

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

    if (isPut) {
      return Math.max(0, strikeLong - spot) * 100 * size - maxRisk;
    }
    return Math.max(0, spot - strikeLong) * 100 * size - maxRisk;
  };

  return {
    rangeMin,
    rangeMax,
    markers,
    segments: segments.filter((segment): segment is ZoneSegment => Boolean(segment)),
    summary: [
      `Breakeven $${breakeven.toFixed(2)}`,
      `Max risk $${maxRisk.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ],
    pnlAtPrice,
    colorAtPrice: (spot) => {
      if (isBullish) {
        if (spot < lowerStrike) return DESIGN.red;
        if (spot < breakeven) return DESIGN.yellow;
        return DESIGN.green;
      }
      if (spot <= lowerStrike) return DESIGN.green;
      if (spot < breakeven) return DESIGN.green;
      if (spot < upperStrike) return DESIGN.yellow;
      return DESIGN.red;
    },
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
  const height = 76;
  const padX = 24;
  const barTop = 20;
  const barHeight = 24;
  const range = Math.max(model.rangeMax - model.rangeMin, 0.0001);
  const xToSvg = (x: number) => padX + ((x - model.rangeMin) / range) * (width - padX * 2);

  const markers = model.markers
    .filter((marker) => marker.value >= model.rangeMin && marker.value <= model.rangeMax)
    .map((marker) => ({ ...marker, x: xToSvg(marker.value) }));
  const laidOutMarkers = withMarkerLayout(markers, width, padX);

  const priceX = price != null ? xToSvg(clamp(price, model.rangeMin, model.rangeMax)) : null;
  const pricePnl = price != null ? model.pnlAtPrice(price) : null;
  const priceColor = price != null ? model.colorAtPrice(price) : DESIGN.muted;

  return (
    <div style={{ marginTop: "7px" }}>
      <div style={{ display: "flex", gap: "8px", marginBottom: "4px", fontSize: "10px", flexWrap: "wrap" }}>
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
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: "100%", height: "74px", display: "block" }}
          preserveAspectRatio="xMidYMid meet"
        >
          {model.segments.map((segment, index) => {
            const x1 = xToSvg(Math.max(segment.from, model.rangeMin));
            const x2 = xToSvg(Math.min(segment.to, model.rangeMax));
            const segmentWidth = Math.max(0, x2 - x1);
            if (segmentWidth <= 0) return null;
            return (
              <rect
                key={`${index}-${segment.from}-${segment.to}`}
                x={x1}
                y={barTop}
                width={segmentWidth}
                height={barHeight}
                fill={segment.color}
              />
            );
          })}

          <line
            x1={padX}
            y1={barTop + barHeight / 2}
            x2={width - padX}
            y2={barTop + barHeight / 2}
            stroke="rgba(255,255,255,0.22)"
            strokeDasharray="3 4"
          />

          {laidOutMarkers.map((marker) => (
            <g key={`${marker.label}-${marker.value}`}>
              <line
                x1={marker.x}
                y1={barTop - 1}
                x2={marker.x}
                y2={barTop + barHeight + 8}
                stroke={marker.color}
                strokeOpacity="0.75"
              />
              <text
                x={marker.x + marker.textDx}
                y={marker.labelY}
                fill={marker.color}
                fontSize="8"
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
                fontSize="8"
                fontFamily={DESIGN.mono}
                textAnchor={marker.textAnchor}
              >
                {formatPrice(marker.value)}
              </text>
            </g>
          ))}

          {priceX != null && price != null && (
            <g>
              <circle
                cx={priceX}
                cy={barTop + barHeight / 2}
                r="4.5"
                fill={priceColor}
                stroke="#fff"
                strokeWidth="1.5"
              />
              <text
                x={priceX}
                y={barTop - 4}
                fill={DESIGN.bright}
                fontSize="9"
                fontFamily={DESIGN.mono}
                textAnchor="middle"
                fontWeight="700"
              >
                ${price.toFixed(2)}
              </text>
            </g>
          )}
        </svg>
      </div>

      <div style={{ display: "flex", gap: "12px", marginTop: "4px", fontSize: "9px", color: DESIGN.muted, flexWrap: "wrap" }}>
        <span>
          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "2px", background: ZONE.maxLoss, marginRight: "4px" }} />
          Max loss
        </span>
        <span>
          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "2px", background: ZONE.recover, marginRight: "4px" }} />
          Recovery
        </span>
        <span>
          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "2px", background: ZONE.profit, marginRight: "4px" }} />
          Profit zone
        </span>
        <span>
          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "2px", background: ZONE.maxProfit, marginRight: "4px" }} />
          Max profit
        </span>
      </div>
    </div>
  );
}
