/**
 * Max-PF Tank vs. Contend Optimizer.
 *
 * Two jobs:
 *
 * 1. Lineup optimization — given weekly player scores and the league's
 *    lineup slots (including FLEX / SUPER_FLEX), compute the maximum
 *    possible points (Max-PF) and lineup efficiency (actual PF / Max-PF).
 *
 * 2. Strategic posture — combine roster value percentile, win-now vs
 *    future value split, and lineup efficiency into a tank/contend
 *    recommendation. A tanking team wants to minimize *actual* wins while
 *    preserving Max-PF (asset productivity); a contender wants efficiency
 *    as close to 1.0 as possible.
 */

import type {
  CompetitiveWindow,
  LineupSlot,
  Position,
} from "@/lib/types/dynasty";
import { FLEX_ELIGIBILITY } from "@/lib/types/dynasty";

export interface ScoredPlayer {
  playerId: string;
  position: Position;
  points: number;
}

export interface OptimalLineupResult {
  /** Slot-by-slot assignment, in the order slots were provided. */
  lineup: Array<{ slot: LineupSlot; player: ScoredPlayer | null }>;
  /** Maximum possible points with perfect start/sit decisions. */
  maxPoints: number;
}

/**
 * Fill dedicated slots first (QB/RB/WR/TE), then flex slots from the
 * leftovers, always taking the best remaining eligible player. Dedicated
 * slots are processed before flexes regardless of input order, which makes
 * the greedy assignment optimal for the standard slot taxonomy (dedicated
 * eligibility sets are disjoint; flexes are supersets).
 */
export function computeOptimalLineup(
  players: ScoredPlayer[],
  slots: LineupSlot[],
): OptimalLineupResult {
  const available = [...players].sort((a, b) => b.points - a.points);
  const assignments = new Map<number, ScoredPlayer | null>();

  const slotOrder = slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => flexRank(a.slot) - flexRank(b.slot));

  for (const { slot, index } of slotOrder) {
    const eligible = FLEX_ELIGIBILITY[slot];
    const pickIdx = available.findIndex((p) => eligible.includes(p.position));
    if (pickIdx === -1) {
      assignments.set(index, null);
      continue;
    }
    const [picked] = available.splice(pickIdx, 1);
    assignments.set(index, picked ?? null);
  }

  const lineup = slots.map((slot, index) => ({
    slot,
    player: assignments.get(index) ?? null,
  }));
  const maxPoints = lineup.reduce((s, e) => s + (e.player?.points ?? 0), 0);
  return { lineup, maxPoints };
}

function flexRank(slot: LineupSlot): number {
  if (slot === "SUPER_FLEX") return 2;
  if (slot === "FLEX") return 1;
  return 0;
}

/** Lineup efficiency: actual PF / Max-PF, clamped to [0, 1]. */
export function lineupEfficiency(pointsFor: number, maxPointsFor: number): number {
  if (maxPointsFor <= 0) return 0;
  return Math.min(1, Math.max(0, pointsFor / maxPointsFor));
}

export interface StartSitSwap {
  start: ScoredPlayer;
  sit: ScoredPlayer;
  delta: number;
}

export interface StartSitAdvice {
  /** Projected points of the current starting lineup (pool players only). */
  currentPoints: number;
  /** Projected points of the optimal lineup. */
  optimalPoints: number;
  /** Projected points left on the bench by the current lineup. */
  gain: number;
  /** Players the optimal lineup inserts. */
  starts: ScoredPlayer[];
  /** Currently-started players the optimal lineup benches. */
  sits: ScoredPlayer[];
  /**
   * Start↔sit pairs, matched same-position first (flex cross-position
   * swaps fall back to the lowest-scoring remaining sit). Deltas sum to
   * `gain`.
   */
  swaps: StartSitSwap[];
  optimal: OptimalLineupResult;
}

/**
 * Start/sit advisor: compares the current starters against the optimal
 * lineup over the same projection metric (season PPG). The returned
 * starts/sits are the swap set that closes the gap.
 */
export function startSitAdvice(
  pool: ScoredPlayer[],
  currentStarterIds: string[],
  slots: LineupSlot[],
): StartSitAdvice {
  const optimal = computeOptimalLineup(pool, slots);
  const optimalIds = new Set(
    optimal.lineup.map((e) => e.player?.playerId).filter((id): id is string => !!id),
  );
  const poolIds = new Set(pool.map((p) => p.playerId));
  const currentIds = new Set(currentStarterIds.filter((id) => poolIds.has(id)));

  const currentPoints = pool
    .filter((p) => currentIds.has(p.playerId))
    .reduce((s, p) => s + p.points, 0);
  const starts = pool
    .filter((p) => optimalIds.has(p.playerId) && !currentIds.has(p.playerId))
    .sort((a, b) => b.points - a.points);
  const sits = pool
    .filter((p) => currentIds.has(p.playerId) && !optimalIds.has(p.playerId))
    .sort((a, b) => b.points - a.points);

  const sitsLeft = [...sits];
  const swaps: StartSitSwap[] = [];
  for (const start of starts) {
    if (sitsLeft.length === 0) break;
    let idx = sitsLeft.findIndex((s) => s.position === start.position);
    if (idx === -1) {
      // Cross-position (flex) swap: bench the weakest remaining sit.
      idx = sitsLeft.reduce(
        (min, s, i) => (s.points < (sitsLeft[min]?.points ?? Infinity) ? i : min),
        0,
      );
    }
    const [sit] = sitsLeft.splice(idx, 1);
    if (sit) swaps.push({ start, sit, delta: start.points - sit.points });
  }

  return {
    currentPoints,
    optimalPoints: optimal.maxPoints,
    gain: Math.max(0, optimal.maxPoints - currentPoints),
    starts,
    sits,
    swaps,
    optimal,
  };
}

export interface PostureInputs {
  /** This team's total asset value percentile within the league, [0, 1]. */
  valuePercentile: number;
  /** Share of roster value that is win-now (Weibull-weighted), [0, 1]. */
  winNowShare: number;
  /** Current record win percentage, [0, 1]. */
  winPct: number;
  /** Lineup efficiency to date, [0, 1]. */
  efficiency: number;
}

export interface PostureResult {
  window: CompetitiveWindow;
  /** Continuous contend score in [0, 1]; 0 = full tank, 1 = all-in. */
  contendScore: number;
  /** Actionable guidance strings for the UI. */
  directives: string[];
}

/**
 * Contend score: value percentile is the dominant term (assets win
 * championships), tilted by how win-now the roster is and how the season
 * is actually going.
 */
export function tankContendPosture(inputs: PostureInputs): PostureResult {
  const { valuePercentile, winNowShare, winPct, efficiency } = inputs;
  const contendScore = Math.min(
    1,
    Math.max(
      0,
      0.45 * valuePercentile + 0.3 * winNowShare + 0.25 * winPct,
    ),
  );

  let window: CompetitiveWindow;
  if (contendScore >= 0.75) window = "ALL_IN";
  else if (contendScore >= 0.55) window = "CONTEND";
  else if (contendScore >= 0.35) window = "RETOOL";
  else window = "REBUILD";

  const directives: string[] = [];
  if (window === "REBUILD") {
    directives.push(
      "Convert aging production into rookie picks while the liquidity window is favorable.",
      "Losses are draft capital: prioritize Max-PF asset development over weekly wins.",
    );
  } else if (window === "RETOOL") {
    directives.push(
      "Hold cornerstone assets; trade sideways to consolidate depth into difference-makers.",
    );
  } else if (window === "CONTEND") {
    directives.push(
      "Target win-now veterans from rebuilding rosters at the in-season pick discount.",
    );
  } else {
    directives.push(
      "Championship equity is maxed — spend future firsts for immediate starters.",
    );
  }
  if (efficiency < 0.88 && contendScore >= 0.55) {
    directives.push(
      `Lineup efficiency ${(efficiency * 100).toFixed(1)}% is leaking points — fix start/sit before trading.`,
    );
  }
  return { window, contendScore, directives };
}
