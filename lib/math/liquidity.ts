/**
 * Pick Liquidity & Seasonal Volatility Engine.
 *
 * Rookie draft picks are the reserve currency of dynasty leagues, but
 * their exchange rate oscillates with the league calendar. This engine
 * applies a dynamic multiplier M(t) to future pick values:
 *
 *   - In-season (weeks 1–14):        M(t) ≈ 0.85  (cash discount — managers
 *                                     pay for right-now production)
 *   - Fantasy playoffs (weeks 15–17): M(t) ≈ 0.80  (deepest discount)
 *   - Postseason (Jan–Feb):           M(t) ≈ 0.95  (rebuilders wake up)
 *   - Pre-draft (Mar–Apr):            M(t) ≈ 1.10  (hype ramp)
 *   - Rookie draft month (May–Jun):   M(t) ≈ 1.25  (peak liquidity premium)
 *   - Summer (Jul–Aug):               M(t) ≈ 1.05  (residual optimism)
 *
 * On top of M(t), future-year picks carry a time discount and picks are
 * priced off a round/slot base curve.
 */

import type { LeaguePhase, PickAsset } from "@/lib/types/dynasty";

export const PHASE_MULTIPLIERS: Record<LeaguePhase, number> = {
  POSTSEASON: 0.95,
  PRE_DRAFT: 1.1,
  ROOKIE_DRAFT: 1.25,
  SUMMER: 1.05,
  IN_SEASON: 0.85,
  FANTASY_PLAYOFFS: 0.8,
};

/** Annual discount applied to picks in future seasons (uncertainty + delay). */
export const FUTURE_YEAR_DISCOUNT = 0.85;

/**
 * Base value (FantasyCalc-comparable scale) for a current-year pick at the
 * middle of each round in a 12-team league.
 */
export const ROUND_BASE_VALUES: Record<PickAsset["round"], number> = {
  1: 4200,
  2: 1800,
  3: 750,
  4: 300,
};

/**
 * Slot skew within a round: pick 1 of a round is worth substantially more
 * than pick 12. Linear interpolation between edge multipliers.
 */
const SLOT_EDGE_MULTIPLIERS: Record<PickAsset["round"], { early: number; late: number }> = {
  1: { early: 1.65, late: 0.6 },
  2: { early: 1.35, late: 0.7 },
  3: { early: 1.2, late: 0.8 },
  4: { early: 1.15, late: 0.85 },
};

/**
 * Resolve the league calendar phase from a date and (optionally) the
 * current NFL week when in season.
 */
export function phaseFromDate(date: Date, nflWeek?: number): LeaguePhase {
  const month = date.getUTCMonth(); // 0-indexed
  if (month <= 1) return "POSTSEASON"; // Jan, Feb
  if (month <= 3) return "PRE_DRAFT"; // Mar, Apr
  if (month <= 5) return "ROOKIE_DRAFT"; // May, Jun
  if (month <= 7) return "SUMMER"; // Jul, Aug
  // Sep–Dec: in season; weeks 15+ are fantasy playoffs
  if (nflWeek !== undefined && nflWeek >= 15) return "FANTASY_PLAYOFFS";
  return "IN_SEASON";
}

/** Seasonal liquidity multiplier M(t). */
export function liquidityMultiplier(phase: LeaguePhase): number {
  return PHASE_MULTIPLIERS[phase];
}

/**
 * Structural (engine) value of a rookie pick:
 * base(round) × slotSkew × futureDiscount^(yearsOut) × M(t).
 */
export function pickEngineValue(
  pick: PickAsset,
  phase: LeaguePhase,
  currentSeason: number,
): number {
  const base = ROUND_BASE_VALUES[pick.round];
  const yearsOut = Math.max(0, pick.season - currentSeason);
  const slotSkew = slotMultiplier(pick.round, pick.projectedSlot);
  const timeDiscount = Math.pow(FUTURE_YEAR_DISCOUNT, yearsOut);
  return base * slotSkew * timeDiscount * liquidityMultiplier(phase);
}

/** Linear early→late skew across a 12-slot round; mid-round when unknown. */
export function slotMultiplier(
  round: PickAsset["round"],
  projectedSlot: number | null,
  slotsPerRound = 12,
): number {
  const { early, late } = SLOT_EDGE_MULTIPLIERS[round];
  if (projectedSlot === null) return (early + late) / 2;
  const slot = Math.min(Math.max(projectedSlot, 1), slotsPerRound);
  const t = (slot - 1) / (slotsPerRound - 1);
  return early + (late - early) * t;
}

/**
 * Buy/sell guidance for picks in the current phase: positive means picks
 * are trading rich (sell picks / buy players), negative means picks are
 * discounted (accumulate picks).
 */
export function pickMarketTilt(phase: LeaguePhase): number {
  return liquidityMultiplier(phase) - 1;
}
