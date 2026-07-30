/**
 * Weibull Positional Hazard Aging Model.
 *
 * Models the probability that a player is still producing at an elite,
 * startable level at age t:
 *
 *   S(t) = exp(-(t / eta)^beta)
 *
 * eta (scale) is the characteristic decay age — at t = eta, S ≈ 36.8%.
 * beta (shape) controls how abrupt the cliff is (beta > 1 → wear-out
 * failures that accelerate with age; higher beta → sharper cliff).
 *
 * Parameters are position-specific: RBs fall off rapidly past age 26,
 * WRs/TEs hold value into their early 30s, and QBs remain stable
 * through age 33+.
 */

import type { Position } from "@/lib/types/dynasty";

export interface WeibullParams {
  /** Scale parameter eta — characteristic elite-decay age (years). */
  eta: number;
  /** Shape parameter beta — steepness of the aging cliff. */
  beta: number;
}

export const WEIBULL_PARAMS: Record<Position, WeibullParams> = {
  QB: { eta: 36.5, beta: 7.5 }, // stable through age 33, cliff mid-late 30s
  RB: { eta: 27.8, beta: 8.5 }, // sharp decay past age 26
  WR: { eta: 31.0, beta: 7.0 }, // gradual decline, cliff ~30-32
  TE: { eta: 31.5, beta: 7.5 }, // late breakouts, holds through early 30s
};

/** Age floor: survival is treated as 1 for ages at or below this. */
const MIN_AGE = 20;

/** Horizon used for residual-life integrals. */
const MAX_AGE = 45;

/** Integration step (years) for numerical residual-life estimates. */
const INTEGRATION_STEP = 0.25;

/**
 * Raw Weibull survival S(t) = exp(-(t/eta)^beta).
 * Throws on non-positive parameters; clamps t at 0.
 */
export function survival(t: number, params: WeibullParams): number {
  if (params.eta <= 0 || params.beta <= 0) {
    throw new Error(`Invalid Weibull parameters: eta=${params.eta}, beta=${params.beta}`);
  }
  if (t <= 0) return 1;
  return Math.exp(-Math.pow(t / params.eta, params.beta));
}

/** Position-aware survival by age. */
export function survivalAtAge(age: number, position: Position): number {
  return survival(Math.max(age, 0), WEIBULL_PARAMS[position]);
}

/**
 * Hazard rate h(t) = (beta/eta) * (t/eta)^(beta-1) — the instantaneous
 * rate of decline conditional on having survived to age t.
 */
export function hazard(t: number, params: WeibullParams): number {
  if (params.eta <= 0 || params.beta <= 0) {
    throw new Error(`Invalid Weibull parameters: eta=${params.eta}, beta=${params.beta}`);
  }
  if (t <= 0) return 0;
  return (params.beta / params.eta) * Math.pow(t / params.eta, params.beta - 1);
}

export function hazardAtAge(age: number, position: Position): number {
  return hazard(Math.max(age, 0), WEIBULL_PARAMS[position]);
}

/**
 * Conditional survival: probability a player elite at age `age` is still
 * elite at age `age + horizon`. S(age + h) / S(age).
 */
export function conditionalSurvival(
  age: number,
  horizon: number,
  position: Position,
): number {
  const now = survivalAtAge(age, position);
  if (now <= 0) return 0;
  return survivalAtAge(age + horizon, position) / now;
}

/**
 * Mean residual elite life expectancy (years) at a given age:
 * E[T - age | T > age] = ∫_age^∞ S(u) du / S(age), integrated numerically
 * via the trapezoid rule out to MAX_AGE.
 */
export function remainingEliteYears(age: number, position: Position): number {
  const params = WEIBULL_PARAMS[position];
  const sNow = survival(age, params);
  if (sNow <= 1e-9) return 0;

  let integral = 0;
  for (let t = age; t < MAX_AGE; t += INTEGRATION_STEP) {
    const a = survival(t, params);
    const b = survival(t + INTEGRATION_STEP, params);
    integral += ((a + b) / 2) * INTEGRATION_STEP;
  }
  return integral / sNow;
}

/**
 * Age multiplier used by the MDI engine's structural value: normalizes
 * remaining elite years against a position's early-career baseline so a
 * 22-year-old ≈ 1.0 and a post-cliff veteran → ~0.
 */
export function ageValueMultiplier(age: number, position: Position): number {
  if (age <= MIN_AGE) return 1;
  const baseline = remainingEliteYears(MIN_AGE + 2, position);
  if (baseline <= 0) return 0;
  return Math.min(1, remainingEliteYears(age, position) / baseline);
}

/**
 * Survival curve samples for charting: [{ age, QB, RB, WR, TE }].
 */
export function survivalCurveSeries(
  fromAge = 21,
  toAge = 40,
): Array<{ age: number } & Record<Position, number>> {
  const series: Array<{ age: number } & Record<Position, number>> = [];
  for (let age = fromAge; age <= toAge; age++) {
    series.push({
      age,
      QB: survivalAtAge(age, "QB"),
      RB: survivalAtAge(age, "RB"),
      WR: survivalAtAge(age, "WR"),
      TE: survivalAtAge(age, "TE"),
    });
  }
  return series;
}
