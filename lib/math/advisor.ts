/**
 * Advice sanity layer — the common-sense filter between raw engine
 * output and what a manager is actually told to do.
 *
 * Raw MDI/optimizer output is context-blind: it will happily tell a
 * contender to sell their WR1 into a WR hole, or recommend a lineup swap
 * worth 0.2 points a week. This layer applies the judgment a sharp
 * league-winner would:
 *
 *  - Never advise selling from a position you're short at while you're
 *    trying to win now.
 *  - Never advise a rebuilder to buy aging veterans, or a contender to
 *    hoard 24-year-old lottery tickets over immediate starters.
 *  - Ignore lineup swaps inside the noise band — churn loses more than
 *    it gains.
 *  - Explain every recommendation in plain English.
 */

import type {
  CompetitiveWindow,
  PlayerAsset,
  Position,
} from "@/lib/types/dynasty";
import { isPlayerAsset } from "@/lib/types/dynasty";
import type { SerializedMdiResult } from "@/lib/league-service";
import type { StartSitAdvice, StartSitSwap } from "@/lib/math/max-pf";

/** A lineup swap below this projected weekly gain is noise, not signal. */
export const START_SIT_MATERIALITY = 1.0;

/** Positional balance below this counts as a deficit. */
const DEFICIT = -0.3;
/** Positional balance above this counts as a tradeable surplus. */
const SURPLUS = 0.3;

/** Age at which each position's dynasty value starts bleeding fast. */
export const SELL_AGE: Record<Position, number> = {
  QB: 33,
  RB: 26,
  WR: 29,
  TE: 29,
  K: 40, // kickers don't age out of fantasy relevance
  DEF: 99, // team defenses don't age at all
};

/** K/DEF have no liquid dynasty trade market — never trade advice. */
function isTradeable(position: Position): boolean {
  return position !== "K" && position !== "DEF";
}

const WIN_NOW_WINDOWS: CompetitiveWindow[] = ["CONTEND", "ALL_IN"];
const FUTURE_WINDOWS: CompetitiveWindow[] = ["REBUILD", "RETOOL"];

export interface AdviceContext {
  window: CompetitiveWindow;
  positionalBalance: Record<Position, number>;
}

export interface AnnotatedRecommendation {
  result: SerializedMdiResult;
  player: PlayerAsset;
  /** Plain-English justification shown to the manager. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Start / sit
// ---------------------------------------------------------------------------

export interface FilteredStartSit {
  /** Swaps worth acting on (delta ≥ materiality). */
  actionable: StartSitSwap[];
  /** Sub-threshold swaps — mention as coin flips, don't push. */
  coinFlips: StartSitSwap[];
  /** Sum of actionable deltas — the gain worth chasing. */
  actionableGain: number;
}

export function filterStartSit(advice: StartSitAdvice): FilteredStartSit {
  const actionable = advice.swaps.filter((s) => s.delta >= START_SIT_MATERIALITY);
  const coinFlips = advice.swaps.filter(
    (s) => s.delta > 0 && s.delta < START_SIT_MATERIALITY,
  );
  return {
    actionable,
    coinFlips,
    actionableGain: actionable.reduce((sum, s) => sum + s.delta, 0),
  };
}

// ---------------------------------------------------------------------------
// Sell candidates
// ---------------------------------------------------------------------------

/**
 * Sell advice a sane manager would follow:
 *  - Win-now teams only sell from surplus positions — never out of a hole.
 *  - Rebuilders sell aging veterans while they still carry value, even at
 *    HOLD prices, plus anything the market overpays for.
 *  - Nobody is told to dump a fairly-priced cornerstone.
 */
export function sellCandidates(
  myAssets: SerializedMdiResult[],
  ctx: AdviceContext,
): AnnotatedRecommendation[] {
  const out: AnnotatedRecommendation[] = [];
  for (const result of myAssets) {
    if (!isPlayerAsset(result.asset)) continue;
    const player = result.asset;
    if (!isTradeable(player.position)) continue;
    const balance = ctx.positionalBalance[player.position] ?? 0;
    const overpriced = result.signal === "SELL" || result.signal === "STRONG_SELL";
    const aging = player.age >= SELL_AGE[player.position];

    if (WIN_NOW_WINDOWS.includes(ctx.window)) {
      // Contenders never sell into their own holes, aging or not — they
      // need the production this season.
      if (balance <= SURPLUS) continue;
      if (!overpriced) continue;
      out.push({
        result,
        player,
        reason: `Surplus ${player.position} the market overpays for — flip for help where you're thin.`,
      });
    } else {
      // Rebuilders: age is the enemy. Move vets while value remains.
      if (aging && result.marketValue > 500) {
        out.push({
          result,
          player,
          reason: `${player.age}-year-old ${player.position} won't be elite when you're ready to win — convert to youth or picks now.`,
        });
      } else if (overpriced && balance > DEFICIT) {
        out.push({
          result,
          player,
          reason: "Market is paying above our model's price — sell the hype.",
        });
      }
    }
  }
  return out.sort(
    (a, b) => b.result.marketValue - a.result.marketValue,
  );
}

// ---------------------------------------------------------------------------
// Buy targets
// ---------------------------------------------------------------------------

/**
 * Buy advice with timeline fit:
 *  - Everyone prioritizes discounted players at their deficit positions.
 *  - Rebuilders only chase players young enough to matter in 2–3 years.
 *  - Win-now teams prioritize proven per-game production over upside.
 */
export function buyTargets(
  rivalAssets: SerializedMdiResult[],
  ctx: AdviceContext,
): AnnotatedRecommendation[] {
  const rebuild = FUTURE_WINDOWS.includes(ctx.window);
  const candidates: Array<AnnotatedRecommendation & { score: number }> = [];

  for (const result of rivalAssets) {
    if (!isPlayerAsset(result.asset)) continue;
    if (result.signal !== "BUY" && result.signal !== "STRONG_BUY") continue;
    const player = result.asset;
    if (!isTradeable(player.position)) continue;
    const balance = ctx.positionalBalance[player.position] ?? 0;
    const fillsDeficit = balance < DEFICIT;

    // Timeline fit is a hard filter, not a preference.
    if (rebuild && player.age > 25) continue;
    if (!rebuild && player.age >= SELL_AGE[player.position]) continue;

    let score = result.mdi;
    if (fillsDeficit) score += 1.5;
    if (!rebuild) score += (player.ppg ?? 0) / 10;

    const reason = fillsDeficit
      ? `Discounted ${player.position} that plugs your biggest hole.`
      : rebuild
        ? `Underpriced ${player.age}-year-old — value peaks right as your window opens.`
        : `Priced below production — immediate starter points at fair cost.`;

    candidates.push({ result, player, reason, score });
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .map(({ score: _score, ...rest }) => rest);
}

// ---------------------------------------------------------------------------
// Waiver targets
// ---------------------------------------------------------------------------

export interface AnnotatedWaiver {
  player: PlayerAsset;
  marketValue: number;
  trend30d: number;
  reason: string;
  /** True when this claim addresses a real roster need. */
  priority: boolean;
  score: number;
}

export function rankWaivers(
  waivers: Array<{ player: PlayerAsset; marketValue: number; trend30d: number }>,
  ctx: AdviceContext,
  /** Projected PPG of the roster's weakest startable player per position. */
  startableFloor: Map<Position, number>,
  projected: (p: PlayerAsset) => number,
): AnnotatedWaiver[] {
  const rebuild = FUTURE_WINDOWS.includes(ctx.window);
  return waivers
    .map((w) => {
      const balance = ctx.positionalBalance[w.player.position] ?? 0;
      const fillsDeficit = balance < DEFICIT;
      const beatsFloor =
        projected(w.player) > (startableFloor.get(w.player.position) ?? Infinity);
      const youngStash = rebuild && w.player.age <= 24;

      let score = w.marketValue;
      if (fillsDeficit) score *= 1.5;
      if (beatsFloor) score *= 1.3;
      if (youngStash) score *= 1.25;
      // A contender gains nothing from a 27-year-old who can't crack the
      // lineup; a rebuilder gains nothing from old depth at all.
      if (rebuild && w.player.age >= 27 && !beatsFloor) score *= 0.3;

      const reason = fillsDeficit
        ? `Fills your ${w.player.position} hole`
        : beatsFloor
          ? `Outscores your current ${w.player.position} starter`
          : youngStash
            ? "Young stash — free upside for the rebuild"
            : "Best value available";

      return {
        ...w,
        reason,
        priority: fillsDeficit || beatsFloor,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}
