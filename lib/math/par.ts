/**
 * Points Above Replacement (PAR) from real weekly scoring.
 *
 * Aggregates Sleeper weekly `players_points` into per-player season stats,
 * derives a replacement-level PPG per position from the league's own
 * scoring distribution, and yields PAR = PPG − replacement PPG.
 *
 * Replacement level is the PPG of the player at the "startable frontier":
 * the number of players per position the league actually starts (dedicated
 * slots plus a modeled share of FLEX/SUPER_FLEX), padded 25% for bye/injury
 * churn.
 */

import type { LineupSlot, Position } from "@/lib/types/dynasty";
import { POSITIONS } from "@/lib/types/dynasty";

export interface SeasonStats {
  totalPoints: number;
  /** Weeks with nonzero points (proxy for games actually played). */
  games: number;
  ppg: number;
}

/**
 * Aggregate weekly players_points maps into season stats per player.
 * Zero-point weeks (bye, inactive, not yet rostered) don't count as games
 * so PPG reflects weeks the player actually produced.
 */
export function aggregateSeasonStats(
  weeks: Array<Record<string, number>>,
): Map<string, SeasonStats> {
  const totals = new Map<string, { totalPoints: number; games: number }>();
  for (const week of weeks) {
    for (const [playerId, points] of Object.entries(week)) {
      const entry = totals.get(playerId) ?? { totalPoints: 0, games: 0 };
      entry.totalPoints += points;
      if (points > 0) entry.games += 1;
      totals.set(playerId, entry);
    }
  }
  const stats = new Map<string, SeasonStats>();
  for (const [playerId, { totalPoints, games }] of totals) {
    stats.set(playerId, {
      totalPoints,
      games,
      ppg: games > 0 ? totalPoints / games : 0,
    });
  }
  return stats;
}

/** Modeled positional share of flex-slot starts. */
const FLEX_SHARE: Record<Position, number> = { QB: 0, RB: 0.35, WR: 0.5, TE: 0.15 };
const SUPER_FLEX_SHARE: Record<Position, number> = { QB: 0.8, RB: 0.07, WR: 0.1, TE: 0.03 };

/** Expected starters per position per team, given the lineup slots. */
export function startersPerPosition(slots: LineupSlot[]): Record<Position, number> {
  const starters: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const slot of slots) {
    if (slot === "FLEX") {
      for (const pos of POSITIONS) starters[pos] += FLEX_SHARE[pos];
    } else if (slot === "SUPER_FLEX") {
      for (const pos of POSITIONS) starters[pos] += SUPER_FLEX_SHARE[pos];
    } else {
      starters[slot] += 1;
    }
  }
  return starters;
}

/**
 * League-wide replacement rank per position: starters × teams, padded 25%
 * for churn, minimum 1.
 */
export function replacementRanks(
  slots: LineupSlot[],
  totalRosters: number,
): Record<Position, number> {
  const perTeam = startersPerPosition(slots);
  const ranks = {} as Record<Position, number>;
  for (const pos of POSITIONS) {
    ranks[pos] = Math.max(1, Math.ceil(perTeam[pos] * totalRosters * 1.25));
  }
  return ranks;
}

/**
 * Replacement-level PPG per position: the PPG of the rank-th best player
 * at that position (0 when fewer players than the rank exist).
 */
export function replacementLevels(
  stats: Map<string, SeasonStats>,
  positionOf: (playerId: string) => Position | null,
  ranks: Record<Position, number>,
): Record<Position, number> {
  const byPosition: Record<Position, number[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const [playerId, s] of stats) {
    const pos = positionOf(playerId);
    if (pos && s.games > 0) byPosition[pos].push(s.ppg);
  }
  const levels = {} as Record<Position, number>;
  for (const pos of POSITIONS) {
    const sorted = byPosition[pos].sort((a, b) => b - a);
    levels[pos] = sorted[ranks[pos] - 1] ?? 0;
  }
  return levels;
}

/**
 * PAR per player: PPG − positional replacement PPG. Negative PAR is kept
 * (a below-replacement veteran genuinely drags structural value).
 */
export function computeParMap(
  stats: Map<string, SeasonStats>,
  positionOf: (playerId: string) => Position | null,
  levels: Record<Position, number>,
): Map<string, number> {
  const par = new Map<string, number>();
  for (const [playerId, s] of stats) {
    const pos = positionOf(playerId);
    if (!pos || s.games === 0) continue;
    par.set(playerId, s.ppg - levels[pos]);
  }
  return par;
}
