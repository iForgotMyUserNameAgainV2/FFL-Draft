/**
 * Market Sentiment Arbitrage Engine — Market Disparity Index (MDI).
 *
 *   MDI_i = (V_i^Engine - V_i^Market) / sigma_V
 *
 * V^Engine — structural value from age (Weibull survival), points above
 *            replacement, contract security, and NFL draft capital.
 * V^Market — consensus market value aggregated across sources
 *            (FantasyCalc, Dynasty Dealer).
 * sigma_V  — position-adjusted standard deviation of market values, so a
 *            1000-point gap on a QB (wide value distribution) means less
 *            than the same gap on a TE (tight distribution).
 *
 * MDI is therefore a z-score: +1.0 means the engine believes the asset is
 * underpriced by one positional standard deviation.
 */

import type {
  DynastyAsset,
  LeaguePhase,
  MdiResult,
  MdiSignal,
  PlayerAsset,
  Position,
} from "@/lib/types/dynasty";
import { isPlayerAsset } from "@/lib/types/dynasty";
import { ageValueMultiplier } from "@/lib/math/weibull";
import { pickEngineValue } from "@/lib/math/liquidity";

/** Signal thresholds on the MDI z-score. */
export const MDI_THRESHOLDS = {
  strongBuy: 1.0,
  buy: 0.35,
  sell: -0.35,
  strongSell: -1.0,
} as const;

/**
 * Component weights for a player's structural value. PAR (production) is
 * the anchor; age scales it; contract and draft capital are stabilizing
 * priors that matter most for young / unproven assets.
 */
export const ENGINE_WEIGHTS = {
  par: 0.55,
  age: 0.25,
  contract: 0.1,
  draftCapital: 0.1,
} as const;

/** Scale that maps a component score in [0,1] to market-value units. */
export const ENGINE_VALUE_SCALE = 10500;

/**
 * PAR normalization ceiling (per-game points above replacement that maps
 * to a component score of 1.0). Position-specific: elite QB/superflex
 * production runs hotter than TE.
 */
export const PAR_CEILING: Record<Position, number> = {
  QB: 12,
  RB: 10,
  WR: 10,
  TE: 8,
};

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * Structural engine value for a player asset, in market-value units.
 */
export function playerEngineValue(player: PlayerAsset): number {
  const parScore = clamp01(player.par / PAR_CEILING[player.position]);
  const ageScore = ageValueMultiplier(player.age, player.position);
  const contractScore = clamp01(player.contractFactor);
  const capitalScore = clamp01(player.draftCapital);

  // Age gates production: a monster season at 31 for an RB is worth far
  // less structurally than the same season at 24.
  const gatedPar = parScore * (0.35 + 0.65 * ageScore);

  const composite =
    ENGINE_WEIGHTS.par * gatedPar +
    ENGINE_WEIGHTS.age * ageScore +
    ENGINE_WEIGHTS.contract * contractScore +
    ENGINE_WEIGHTS.draftCapital * capitalScore;

  return composite * ENGINE_VALUE_SCALE;
}

/** Engine value for any asset (players via components, picks via liquidity). */
export function engineValue(
  asset: DynastyAsset,
  phase: LeaguePhase,
  currentSeason: number,
): number {
  return isPlayerAsset(asset)
    ? playerEngineValue(asset)
    : pickEngineValue(asset, phase, currentSeason);
}

/** Sample standard deviation; returns fallback when n < 2. */
export function stdDev(values: number[], fallback = 1): number {
  if (values.length < 2) return fallback;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  const sd = Math.sqrt(variance);
  return sd > 0 ? sd : fallback;
}

/**
 * Position-adjusted sigma: std-dev of market values within each position
 * group; picks form their own group.
 */
export function positionalSigmas(
  assets: Array<{ asset: DynastyAsset; marketValue: number }>,
): Map<Position | "PICK", number> {
  const groups = new Map<Position | "PICK", number[]>();
  for (const { asset, marketValue } of assets) {
    const key: Position | "PICK" = isPlayerAsset(asset) ? asset.position : "PICK";
    const bucket = groups.get(key) ?? [];
    bucket.push(marketValue);
    groups.set(key, bucket);
  }
  const sigmas = new Map<Position | "PICK", number>();
  const globalSigma = stdDev(assets.map((a) => a.marketValue), 1);
  for (const [key, values] of groups) {
    sigmas.set(key, stdDev(values, globalSigma));
  }
  return sigmas;
}

export function classifyMdi(mdi: number): MdiSignal {
  if (mdi >= MDI_THRESHOLDS.strongBuy) return "STRONG_BUY";
  if (mdi >= MDI_THRESHOLDS.buy) return "BUY";
  if (mdi <= MDI_THRESHOLDS.strongSell) return "STRONG_SELL";
  if (mdi <= MDI_THRESHOLDS.sell) return "SELL";
  return "HOLD";
}

/**
 * Compute MDI for a batch of assets against their consensus market values.
 * Returns results sorted by |MDI| descending (biggest mispricings first).
 */
export function computeMdiBatch(
  assets: Array<{ asset: DynastyAsset; marketValue: number }>,
  phase: LeaguePhase,
  currentSeason: number,
): MdiResult[] {
  const sigmas = positionalSigmas(assets);
  const results: MdiResult[] = assets.map(({ asset, marketValue }) => {
    const key: Position | "PICK" = isPlayerAsset(asset) ? asset.position : "PICK";
    const sigma = sigmas.get(key) ?? 1;
    const ev = engineValue(asset, phase, currentSeason);
    const mdi = (ev - marketValue) / sigma;
    return {
      asset,
      engineValue: ev,
      marketValue,
      sigma,
      mdi,
      signal: classifyMdi(mdi),
    };
  });
  return results.sort((a, b) => Math.abs(b.mdi) - Math.abs(a.mdi));
}
