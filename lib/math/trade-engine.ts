/**
 * Game-Theoretic Trade Matchmaker.
 *
 * Scans all league rosters simultaneously, quantifies each team's
 * positional needs and surpluses, and computes a pairwise synergy matrix
 *
 *   M_{A,B} = f(Need_A, Surplus_B, Window_A, Window_B)
 *
 * High synergy means A's deficits line up with B's surpluses (and vice
 * versa) AND their competitive windows are complementary (a contender and
 * a rebuilder can both "win" the same trade — they are optimizing
 * different objective functions over different time horizons).
 *
 * From the synergy matrix it auto-generates multi-asset proposals and
 * scores each with a win-win probability: the joint likelihood that both
 * managers' need-weighted utility improves.
 */

import type {
  CompetitiveWindow,
  DynastyAsset,
  Position,
  TeamProfile,
  TradeProposal,
  TradeSide,
} from "@/lib/types/dynasty";
import { POSITIONS, isPickAsset, isPlayerAsset } from "@/lib/types/dynasty";

// ---------------------------------------------------------------------------
// Needs & surpluses
// ---------------------------------------------------------------------------

/** Starter-quality baseline per position for a 12-team single-QB league. */
const STARTER_BASELINE: Record<Position, number> = {
  QB: 1.2,
  RB: 2.5,
  WR: 3.0,
  TE: 1.2,
};

/**
 * Positional balance: (startable players rostered - league baseline),
 * where "startable" is weighted by each player's share of positional
 * value. Positive = surplus, negative = deficit.
 */
export function positionalBalance(
  playerValues: Array<{ position: Position; value: number }>,
  startableValueThreshold = 1500,
  baseline: Record<Position, number> = STARTER_BASELINE,
): Record<Position, number> {
  const balance = {} as Record<Position, number>;
  for (const pos of POSITIONS) {
    const startable = playerValues
      .filter((p) => p.position === pos)
      .reduce((s, p) => s + Math.min(1, p.value / startableValueThreshold), 0);
    balance[pos] = startable - baseline[pos];
  }
  return balance;
}

// ---------------------------------------------------------------------------
// Window complementarity
// ---------------------------------------------------------------------------

const WINDOW_SCORE: Record<CompetitiveWindow, number> = {
  REBUILD: 0,
  RETOOL: 1 / 3,
  CONTEND: 2 / 3,
  ALL_IN: 1,
};

/**
 * Window complementarity in [0, 1]: maximal when horizons diverge
 * (rebuilder × contender), minimal when both teams want the same thing.
 */
export function windowComplementarity(
  a: CompetitiveWindow,
  b: CompetitiveWindow,
): number {
  return Math.abs(WINDOW_SCORE[a] - WINDOW_SCORE[b]);
}

// ---------------------------------------------------------------------------
// Synergy matrix
// ---------------------------------------------------------------------------

/**
 * Directed need-fit: how well B's surpluses cover A's deficits, in [0, 1].
 */
export function needFit(
  needA: Record<Position, number>,
  surplusB: Record<Position, number>,
): number {
  let covered = 0;
  let totalNeed = 0;
  for (const pos of POSITIONS) {
    const deficit = Math.max(0, -(needA[pos] ?? 0));
    const surplus = Math.max(0, surplusB[pos] ?? 0);
    totalNeed += deficit;
    covered += Math.min(deficit, surplus);
  }
  if (totalNeed === 0) return 0;
  return covered / totalNeed;
}

/**
 * Symmetric synergy M_{A,B} = mean(directed fits) × (0.5 + 0.5 × window
 * complementarity). Diagonal is 0.
 */
export function synergyScore(a: TeamProfile, b: TeamProfile): number {
  if (a.roster.rosterId === b.roster.rosterId) return 0;
  const fitAB = needFit(a.positionalBalance, b.positionalBalance);
  const fitBA = needFit(b.positionalBalance, a.positionalBalance);
  const fit = (fitAB + fitBA) / 2;
  const windows = windowComplementarity(a.window, b.window);
  return fit * (0.5 + 0.5 * windows);
}

export interface SynergyCell {
  rosterIdA: number;
  rosterIdB: number;
  synergy: number;
}

/** Full pairwise synergy matrix for the league (A < B, symmetric). */
export function synergyMatrix(teams: TeamProfile[]): SynergyCell[] {
  const cells: SynergyCell[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const a = teams[i];
      const b = teams[j];
      if (!a || !b) continue;
      cells.push({
        rosterIdA: a.roster.rosterId,
        rosterIdB: b.roster.rosterId,
        synergy: synergyScore(a, b),
      });
    }
  }
  return cells.sort((x, y) => y.synergy - x.synergy);
}

// ---------------------------------------------------------------------------
// Proposal generation
// ---------------------------------------------------------------------------

export interface AssetValuation {
  asset: DynastyAsset;
  marketValue: number;
  engineValue: number;
  /** Fraction of the asset's value that is win-now (vs future). */
  winNowShare: number;
}

export interface ProposalOptions {
  /** Max assets per side. */
  maxAssetsPerSide?: number;
  /** Acceptable relative market-value imbalance before a trade is rejected. */
  maxImbalance?: number;
  /** Max proposals returned per pair. */
  maxProposals?: number;
}

/**
 * Need-weighted utility of an asset bundle for a team: market value scaled
 * up when it fills a deficit position and matches the team's time horizon.
 */
export function bundleUtility(
  bundle: AssetValuation[],
  team: TeamProfile,
): number {
  const horizonPreference = WINDOW_SCORE[team.window]; // 1 = wants win-now
  return bundle.reduce((sum, { asset, marketValue, winNowShare }) => {
    let needMultiplier = 1;
    if (isPlayerAsset(asset)) {
      const balance = team.positionalBalance[asset.position] ?? 0;
      // Deficit position → up to +35%; surplus position → down to -25%.
      needMultiplier = balance < 0 ? 1 + Math.min(0.35, -balance * 0.2) : Math.max(0.75, 1 - balance * 0.12);
    } else {
      // Picks are pure future value — rebuilders overweight them.
      needMultiplier = 1 + 0.3 * (1 - horizonPreference) - 0.15 * horizonPreference;
    }
    // Horizon alignment: contenders discount future-weighted assets.
    const horizonFit =
      1 - 0.3 * Math.abs(horizonPreference - winNowShare);
    return sum + marketValue * needMultiplier * horizonFit;
  }, 0);
}

/**
 * Win-win probability via a smooth logistic over both sides' utility
 * gains. A trade where both teams gain need-weighted utility relative to
 * what they give up approaches 1; a lopsided trade approaches 0.
 *
 * `scale` is the utility gain that maps to ~73% acceptance for one side.
 * Use `tradeScale` to derive it from trade size — a +500 utility edge is
 * decisive on a 2,000-value swap and noise on a 20,000-value blockbuster.
 */
export function winWinProbability(
  utilityGainA: number,
  utilityGainB: number,
  scale = 400,
): number {
  const pA = logistic(utilityGainA / scale);
  const pB = logistic(utilityGainB / scale);
  return pA * pB;
}

/**
 * Logistic scale proportional to trade size (20% of the bigger side).
 * The proportion encodes manager skepticism: even a clearly favorable
 * blockbuster carries acceptance risk, so probabilities top out around
 * ~90% rather than saturating at 100%.
 */
export function tradeScale(valueA: number, valueB: number): number {
  return Math.max(300, 0.2 * Math.max(valueA, valueB));
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Generate candidate trade proposals between two teams. Strategy: offer
 * A's surplus-position assets for B's surplus-position assets that cover
 * the counterpart's deficits, then balance with picks. Bundles are
 * enumerated over the top surplus assets (bounded, so worst case is a few
 * hundred bundle pairs per team pair).
 */
export function generateProposals(
  teamA: TeamProfile,
  teamB: TeamProfile,
  assetsA: AssetValuation[],
  assetsB: AssetValuation[],
  options: ProposalOptions = {},
): TradeProposal[] {
  const { maxAssetsPerSide = 2, maxImbalance = 0.22, maxProposals = 5 } = options;

  const offerablesA = rankOfferables(assetsA, teamA, teamB);
  const offerablesB = rankOfferables(assetsB, teamB, teamA);

  const bundlesA = enumerateBundles(offerablesA, maxAssetsPerSide);
  const bundlesB = enumerateBundles(offerablesB, maxAssetsPerSide);

  const proposals: TradeProposal[] = [];
  for (const bundleA of bundlesA) {
    for (const bundleB of bundlesB) {
      const valueA = sumMarket(bundleA);
      const valueB = sumMarket(bundleB);
      if (valueA === 0 || valueB === 0) continue;
      const imbalance = Math.abs(valueA - valueB) / Math.max(valueA, valueB);
      if (imbalance > maxImbalance) continue;

      // Utility delta: what you receive (valued by you) minus what you send.
      const utilityDeltaA = bundleUtility(bundleB, teamA) - bundleUtility(bundleA, teamA);
      const utilityDeltaB = bundleUtility(bundleA, teamB) - bundleUtility(bundleB, teamB);
      if (utilityDeltaA <= 0 || utilityDeltaB <= 0) continue;

      const probability = winWinProbability(
        utilityDeltaA,
        utilityDeltaB,
        tradeScale(valueA, valueB),
      );
      const synergy = synergyScore(teamA, teamB);
      proposals.push({
        id: proposalId(teamA, teamB, bundleA, bundleB),
        sideA: toSide(teamA, bundleA, utilityDeltaA),
        sideB: toSide(teamB, bundleB, utilityDeltaB),
        synergy,
        winWinProbability: probability,
        rationale: buildRationale(teamA, teamB, bundleA, bundleB),
      });
    }
  }

  return proposals
    .sort((a, b) => b.winWinProbability - a.winWinProbability)
    .slice(0, maxProposals);
}

/** Rank a team's assets by how tradable they are toward a counterparty. */
function rankOfferables(
  assets: AssetValuation[],
  owner: TeamProfile,
  counterparty: TeamProfile,
): AssetValuation[] {
  return [...assets]
    .filter((a) => a.marketValue > 0)
    .sort((x, y) => offerScore(y, owner, counterparty) - offerScore(x, owner, counterparty))
    .slice(0, 8);
}

function offerScore(
  { asset, marketValue }: AssetValuation,
  owner: TeamProfile,
  counterparty: TeamProfile,
): number {
  let score = marketValue;
  if (isPlayerAsset(asset)) {
    const ownerBalance = owner.positionalBalance[asset.position] ?? 0;
    const theirBalance = counterparty.positionalBalance[asset.position] ?? 0;
    if (ownerBalance > 0) score *= 1.4; // we can spare it
    if (theirBalance < 0) score *= 1.5; // they need it
  } else if (isPickAsset(asset)) {
    // Contenders shop picks; rebuilders keep them.
    score *= WINDOW_SCORE[owner.window] > 0.5 ? 1.35 : 0.7;
  }
  return score;
}

function enumerateBundles(
  assets: AssetValuation[],
  maxSize: number,
): AssetValuation[][] {
  const bundles: AssetValuation[][] = assets.map((a) => [a]);
  if (maxSize >= 2) {
    for (let i = 0; i < assets.length; i++) {
      for (let j = i + 1; j < assets.length; j++) {
        const a = assets[i];
        const b = assets[j];
        if (a && b) bundles.push([a, b]);
      }
    }
  }
  return bundles;
}

function sumMarket(bundle: AssetValuation[]): number {
  return bundle.reduce((s, a) => s + a.marketValue, 0);
}

function toSide(
  team: TeamProfile,
  bundle: AssetValuation[],
  utilityDelta: number,
): TradeSide {
  return {
    rosterId: team.roster.rosterId,
    assets: bundle.map((b) => b.asset),
    marketValue: sumMarket(bundle),
    engineValue: bundle.reduce((s, a) => s + a.engineValue, 0),
    utilityDelta,
  };
}

function proposalId(
  a: TeamProfile,
  b: TeamProfile,
  bundleA: AssetValuation[],
  bundleB: AssetValuation[],
): string {
  const ids = (bundle: AssetValuation[]) =>
    bundle.map((x) => x.asset.id).sort().join("+");
  return `${a.roster.rosterId}:${ids(bundleA)}__${b.roster.rosterId}:${ids(bundleB)}`;
}

function buildRationale(
  teamA: TeamProfile,
  teamB: TeamProfile,
  bundleA: AssetValuation[],
  bundleB: AssetValuation[],
): string {
  const label = (bundle: AssetValuation[]) =>
    bundle
      .map((x) => (isPlayerAsset(x.asset) ? x.asset.name : x.asset.id))
      .join(" + ");
  return (
    `${teamA.roster.ownerName} (${teamA.window}) sends ${label(bundleA)} for ` +
    `${label(bundleB)} from ${teamB.roster.ownerName} (${teamB.window}); ` +
    `each side nets positive need-weighted utility across complementary windows.`
  );
}
