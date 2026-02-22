import { computeDTE } from "@/lib/design";
import type { Trade } from "@/lib/types";

export type GuidanceLevel = "critical" | "defensive" | "watch" | "offensive";
export type GuidancePlaybook = "conservative" | "balanced" | "aggressive";
export type GuidanceTriggerState = "hit" | "watch" | "missing";

export interface PositionGuidanceTrigger {
  id: string;
  label: string;
  target: string;
  state: GuidanceTriggerState;
  detail: string;
}

export interface PositionGuidance {
  level: GuidanceLevel;
  title: string;
  summary: string;
  confidence: number;
  recommendedPlaybook: GuidancePlaybook;
  nextSteps: string[];
  triggers: PositionGuidanceTrigger[];
  metrics: {
    dte: number;
    edgeVsBreakevenPct: number | null;
    stopBufferPct: number | null;
    targetGapPct: number | null;
    inProfitZone: boolean | null;
    stopBreached: boolean;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toPrice(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "Not set";
  return `$${value.toFixed(2)}`;
}

function toPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function deriveProfitTarget(position: Trade) {
  if (position.strike_long == null || position.strike_short == null) return null;
  if (position.direction === "Bearish") {
    return Math.min(position.strike_long, position.strike_short);
  }
  return Math.max(position.strike_long, position.strike_short);
}

export function buildPositionGuidance(position: Trade, price: number | null): PositionGuidance {
  const dte = computeDTE(position.expiry_date);
  const bearish = position.direction === "Bearish";
  const be = position.breakeven;
  const stop = position.stop_loss;
  const target = deriveProfitTarget(position);
  const urgency = position.urgency ?? 1;
  const hasPrice = price != null && Number.isFinite(price);
  const thetaPressure = (position.theta_per_day ?? 0) < -20;

  const edgeVsBreakevenPct =
    hasPrice && be != null
      ? bearish
        ? ((be - price) / price) * 100
        : ((price - be) / price) * 100
      : null;
  const inProfitZone = edgeVsBreakevenPct == null ? null : edgeVsBreakevenPct >= 0;

  const stopBufferPct =
    hasPrice && stop != null
      ? bearish
        ? ((stop - price) / price) * 100
        : ((price - stop) / price) * 100
      : null;
  const stopBreached =
    hasPrice && stop != null ? (bearish ? price >= stop : price <= stop) : false;

  const targetGapPct =
    hasPrice && target != null
      ? bearish
        ? ((price - target) / price) * 100
        : ((target - price) / price) * 100
      : null;
  const nearMaxProfit = targetGapPct != null && targetGapPct <= 1.5;

  let confidence = 55;
  if (hasPrice) confidence += 18;
  if (be != null) confidence += 8;
  if (stop != null) confidence += 8;
  if (position.theta_per_day != null) confidence += 3;
  if (urgency >= 4) confidence += 4;
  if (dte <= 3) confidence += 4;
  const clampedConfidence = clamp(confidence, 35, 95);

  const favorDirection = bearish ? "lower" : "higher";
  const adverseDirection = bearish ? "higher" : "lower";

  let level: GuidanceLevel = "watch";
  let title = "Wait For Confirmation";
  let summary =
    "The position is still in play. Keep alerts active and execute only at predefined levels.";
  let recommendedPlaybook: GuidancePlaybook = "balanced";
  let nextSteps: string[] = [
    "Keep current size; no adds unless setup quality improves.",
    `Set an alert at breakeven ${toPrice(be)} and stop ${toPrice(stop)}.`,
    "Re-evaluate this setup near the close.",
  ];

  if (!hasPrice) {
    level = "watch";
    title = "Price Input Required";
    summary =
      "Guidance is limited without a live price. Fetch quotes or add manual spot values first.";
    recommendedPlaybook = "balanced";
    nextSteps = [
      "Fetch live quotes or enter manual price for this ticker.",
      "Do not add risk until spot, breakeven, and stop are visible together.",
      "Validate that stop and breakeven are set correctly.",
    ];
  } else if (stopBreached) {
    level = "critical";
    title = "Stop Breached";
    summary =
      "The position crossed its stop level. Capital protection takes priority over thesis.";
    recommendedPlaybook = "conservative";
    nextSteps = [
      "Close or reduce immediately; avoid averaging down on a broken level.",
      `Execute conservative exit plan now (${toPrice(stop)} stop crossed).`,
      "After exit, journal the trigger and what failed.",
    ];
  } else if (inProfitZone === false && dte <= 1) {
    level = "critical";
    title = "Expiry Cliff";
    summary =
      "At 0-1 DTE and outside profit zone, gamma/theta risk is now asymmetric against you.";
    recommendedPlaybook = "conservative";
    nextSteps = [
      "Cut risk now or roll; do not hold through expiry hoping for a late move.",
      "Prioritize preserving capital over full recovery attempts.",
      "Only re-enter if the setup rebuilds with time.",
    ];
  } else if (inProfitZone === false && (dte <= 3 || urgency >= 4)) {
    level = "defensive";
    title = "Defend Capital";
    summary =
      "The trade is on the wrong side of breakeven with elevated time or urgency pressure.";
    recommendedPlaybook = "conservative";
    nextSteps = [
      "Reduce 25-50% if price cannot reclaim breakeven soon.",
      `Respect hard stop at ${toPrice(stop)}; no discretionary override.`,
      "Pause new entries until this risk is normalized.",
    ];
  } else if (nearMaxProfit || (inProfitZone === true && (dte <= 5 || thetaPressure))) {
    level = "offensive";
    title = "Harvest Gains";
    summary =
      "Price is in a favorable zone and time decay can quickly erode open gains if left unmanaged.";
    recommendedPlaybook = "balanced";
    nextSteps = [
      "Take partial profits into strength.",
      `Raise protection using stop ${toPrice(stop)} or breakeven ${toPrice(be)}.`,
      "Use aggressive adds only if risk remains capped.",
    ];
  } else if (inProfitZone === true) {
    level = "offensive";
    title = "Thesis Working";
    summary =
      "The position is above breakeven in favorable territory. Let it work while managing exits.";
    recommendedPlaybook = "balanced";
    nextSteps = [
      "Hold core size and pre-plan profit-taking levels.",
      "Keep stop logic active to protect open gains.",
      "Avoid over-sizing while this setup is already in flight.",
    ];
  } else {
    level = "watch";
    title = "Neutral Watch";
    summary =
      "The setup is not broken yet, but it still needs movement in your favor before risk increases.";
    recommendedPlaybook = "balanced";
    nextSteps = [
      `Need a ${favorDirection} move toward breakeven before adding confidence.`,
      `If price drifts ${adverseDirection}, rotate to a defensive response.`,
      "Stick to predefined exits and avoid impulse adjustments.",
    ];
  }

  const triggers: PositionGuidanceTrigger[] = [
    {
      id: "breakeven",
      label: "Profit Zone (BE)",
      target: toPrice(be),
      state: be == null ? "missing" : inProfitZone ? "hit" : "watch",
      detail:
        be == null
          ? "Breakeven missing."
          : inProfitZone
            ? "Price is in the profit zone."
            : `Needs ${toPct(Math.abs(edgeVsBreakevenPct ?? 0))} move ${favorDirection}.`,
    },
    {
      id: "stop",
      label: "Stop Guard",
      target: toPrice(stop),
      state: stop == null ? "missing" : stopBreached ? "hit" : "watch",
      detail:
        stop == null
          ? "Stop missing."
          : stopBreached
            ? "Stop was crossed."
            : `Buffer to stop: ${toPct(stopBufferPct)}.`,
    },
    {
      id: "max-profit",
      label: "Max-Profit Zone",
      target: toPrice(target),
      state: target == null ? "missing" : nearMaxProfit ? "hit" : "watch",
      detail:
        target == null
          ? "No defined short strike target."
          : nearMaxProfit
            ? "Near or inside max-profit zone."
            : `Distance to target: ${toPct(targetGapPct)}.`,
    },
    {
      id: "time",
      label: "Time Pressure",
      target: `${dte} DTE`,
      state: dte <= 3 ? "hit" : "watch",
      detail:
        dte <= 3
          ? "High urgency time window."
          : "Time cushion still available.",
    },
  ];

  return {
    level,
    title,
    summary,
    confidence: clampedConfidence,
    recommendedPlaybook,
    nextSteps,
    triggers,
    metrics: {
      dte,
      edgeVsBreakevenPct,
      stopBufferPct,
      targetGapPct,
      inProfitZone,
      stopBreached,
    },
  };
}
