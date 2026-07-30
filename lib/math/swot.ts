/**
 * Team SWOT engine — the full autopsy of a roster.
 *
 * Cross-references every other engine's output for one team:
 *
 *   - Strengths   — positional surpluses, cornerstone assets, asset base,
 *                   youth, pick capital, lineup discipline.
 *   - Weaknesses  — positional deficits, thin asset base, aging value,
 *                   start/sit leaks, pick poverty.
 *   - Opportunities — waiver-wire claims at deficit positions, buy-low MDI
 *                   targets on rival rosters, sell-high windows on own
 *                   assets, matchmaker-cleared trades, calendar liquidity.
 *   - Threats     — age-cliff exposure, value concentration, expiring role
 *                   security, and the league arms race.
 *
 * Pure and data-source agnostic: callers supply the team profile, the
 * league, the MDI board, waiver candidates, and trade proposals.
 */

import type {
  DynastyAsset,
  LeaguePhase,
  MdiSignal,
  PlayerAsset,
  Position,
  TeamProfile,
  TradeProposal,
  WaiverCandidate,
} from "@/lib/types/dynasty";
import { POSITIONS, isPlayerAsset } from "@/lib/types/dynasty";
import { PHASE_MULTIPLIERS } from "@/lib/math/liquidity";
import { lineupEfficiency } from "@/lib/math/max-pf";
import { remainingEliteYears } from "@/lib/math/weibull";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SwotCategory = "STRENGTH" | "WEAKNESS" | "OPPORTUNITY" | "THREAT";

export interface SwotItem {
  category: SwotCategory;
  title: string;
  detail: string;
  /** Relative weight in [0, 1] used for intra-quadrant ordering. */
  score: number;
}

export interface SwotReport {
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
  /** One-paragraph coroner's summary. */
  verdict: string;
  /** Composite roster grade, A+ … D. */
  grade: string;
  /** Composite health score in [0, 1] behind the grade. */
  health: number;
}

/** Structural subset of the MDI board rows the engine needs. */
export interface SwotMdiEntry {
  asset: DynastyAsset;
  mdi: number;
  signal: MdiSignal;
  marketValue: number;
  /** Owning roster, null for unrostered assets. */
  rosterId: number | null;
}

export interface SwotInput {
  team: TeamProfile;
  league: TeamProfile[];
  mdi: SwotMdiEntry[];
  waivers: WaiverCandidate[];
  proposals: TradeProposal[];
  phase: LeaguePhase;
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Positional balance beyond which a position counts as surplus/deficit. */
const BALANCE_EDGE = 0.5;

/** Market value above which a player is a "key" asset for risk analysis. */
const KEY_ASSET_VALUE = 1500;

/** Mean remaining elite years below which a key asset is cliff-exposed. */
const CLIFF_YEARS = 2;

/** Share of roster value in one player that flags concentration risk. */
const CONCENTRATION_SHARE = 0.32;

const MAX_ITEMS_PER_QUADRANT = 5;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function buildSwotReport(input: SwotInput): SwotReport {
  const { team, league, mdi, waivers, proposals, phase } = input;

  const valueOf = buildValueMap(mdi);
  const percentile = valuePercentile(team, league);
  const efficiency =
    team.roster.maxPointsFor > 0
      ? lineupEfficiency(team.roster.pointsFor, team.roster.maxPointsFor)
      : null;

  const strengths = collectStrengths(team, percentile, efficiency, valueOf, mdi);
  const weaknesses = collectWeaknesses(team, percentile, efficiency, valueOf);
  const opportunities = collectOpportunities(team, mdi, waivers, proposals, phase);
  const threats = collectThreats(team, league, valueOf);

  const health = compositeHealth(team, percentile, efficiency);

  return {
    strengths: top(strengths),
    weaknesses: top(weaknesses),
    opportunities: top(opportunities),
    threats: top(threats),
    verdict: buildVerdict(team, percentile, strengths, weaknesses),
    grade: gradeFromHealth(health),
    health,
  };
}

// ---------------------------------------------------------------------------
// Strengths
// ---------------------------------------------------------------------------

function collectStrengths(
  team: TeamProfile,
  percentile: number,
  efficiency: number | null,
  valueOf: (assetId: string) => number,
  mdi: SwotMdiEntry[],
): SwotItem[] {
  const items: SwotItem[] = [];
  const item = (title: string, detail: string, score: number) =>
    items.push({ category: "STRENGTH", title, detail, score });

  // Cornerstones: own players inside the league's top 10 by market value.
  const leagueTop = mdi
    .filter((r) => r.rosterId !== null && isPlayerAsset(r.asset))
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, 10);
  const cornerstones = leagueTop.filter((r) => r.rosterId === team.roster.rosterId);
  if (cornerstones.length > 0) {
    const names = cornerstones
      .map((r) => (isPlayerAsset(r.asset) ? r.asset.name : r.asset.id))
      .join(", ");
    item(
      `${cornerstones.length} league-defining cornerstone${cornerstones.length > 1 ? "s" : ""}`,
      `${names} rank${cornerstones.length > 1 ? "" : "s"} inside the league's top 10 assets by market value — the foundation every contender needs.`,
      0.9 + 0.02 * cornerstones.length,
    );
  }

  // Positional surpluses, with the players that create them.
  for (const pos of POSITIONS) {
    const balance = team.positionalBalance[pos] ?? 0;
    if (balance < BALANCE_EDGE) continue;
    const best = playersAt(team, pos, valueOf).slice(0, 2);
    item(
      `${pos} room is a surplus`,
      `${balance >= 0 ? "+" : ""}${balance.toFixed(2)} startable ${pos}s above the league baseline${
        best.length > 0 ? `, led by ${best.map((p) => p.name).join(" and ")}` : ""
      }. This is trade ammunition.`,
      0.6 + Math.min(0.25, balance * 0.15),
    );
  }

  // Asset base.
  if (percentile >= 0.7) {
    item(
      "Elite asset base",
      `Total portfolio value sits at the ${ordinalPct(percentile)} percentile of the league — you out-own most of your rivals.`,
      0.7 + 0.2 * percentile,
    );
  }

  // Youth: future-weighted value with a real asset base behind it.
  const futureShare = team.totalValue > 0 ? team.futureValue / team.totalValue : 0;
  if (futureShare >= 0.55 && percentile >= 0.45) {
    item(
      "Young, future-proof core",
      `${Math.round(futureShare * 100)}% of roster value is future-weighted on the Weibull aging curves — this team gets better by standing still.`,
      0.55 + 0.3 * futureShare,
    );
  }

  // Pick war chest (native allotment is one 1st per future season).
  const firsts = team.roster.picks.filter((p) => p.round === 1).length;
  const seasons = new Set(team.roster.picks.map((p) => p.season)).size;
  if (seasons > 0 && firsts > seasons) {
    item(
      "First-round pick war chest",
      `${firsts} future 1sts across ${seasons} draft${seasons > 1 ? "s" : ""} — surplus draft capital to consolidate or ride a rebuild.`,
      0.55 + 0.08 * (firsts - seasons),
    );
  }

  // Lineup discipline.
  if (efficiency !== null && efficiency >= 0.95) {
    item(
      "Disciplined start/sit",
      `Lineup efficiency of ${(efficiency * 100).toFixed(1)}% — almost no points left on the bench all season.`,
      0.5 + 0.4 * (efficiency - 0.95) * 20,
    );
  }

  return items;
}

// ---------------------------------------------------------------------------
// Weaknesses
// ---------------------------------------------------------------------------

function collectWeaknesses(
  team: TeamProfile,
  percentile: number,
  efficiency: number | null,
  valueOf: (assetId: string) => number,
): SwotItem[] {
  const items: SwotItem[] = [];
  const item = (title: string, detail: string, score: number) =>
    items.push({ category: "WEAKNESS", title, detail, score });

  // Positional deficits.
  for (const pos of POSITIONS) {
    const balance = team.positionalBalance[pos] ?? 0;
    if (balance > -BALANCE_EDGE) continue;
    const best = playersAt(team, pos, valueOf)[0];
    item(
      `${pos} room is a deficit`,
      `${balance.toFixed(2)} startable ${pos}s vs the league baseline${
        best
          ? ` — ${best.name} is carrying the room alone`
          : ` — no startable ${pos} on the roster`
      }. Every week starts in a hole here.`,
      0.6 + Math.min(0.3, -balance * 0.15),
    );
  }

  // Thin asset base.
  if (percentile <= 0.3) {
    item(
      "Bottom-tier asset base",
      `Total portfolio value sits at the ${ordinalPct(percentile)} percentile — the roster is outgunned before kickoff.`,
      0.75 + 0.2 * (0.3 - percentile),
    );
  }

  // Aging value: share of player value on cliff-exposed players.
  const { atRiskValue, playerValue } = cliffExposure(team, valueOf);
  const agingShare = playerValue > 0 ? atRiskValue / playerValue : 0;
  if (agingShare >= 0.3) {
    item(
      "Value is aging out",
      `${Math.round(agingShare * 100)}% of player value belongs to players with under ${CLIFF_YEARS} mean elite years remaining — it evaporates if not converted.`,
      0.55 + 0.35 * agingShare,
    );
  }

  // Start/sit leak.
  if (efficiency !== null && efficiency < 0.88) {
    item(
      "Start/sit is leaking points",
      `Lineup efficiency of ${(efficiency * 100).toFixed(1)}% — wins are being left on the bench regardless of talent.`,
      0.5 + (0.88 - efficiency),
    );
  }

  // Pick poverty.
  const firsts = team.roster.picks.filter((p) => p.round === 1).length;
  const seasons = new Set(team.roster.picks.map((p) => p.season)).size;
  if (seasons > 0 && firsts < seasons) {
    item(
      "Draft capital deficit",
      `Only ${firsts} future 1st${firsts === 1 ? "" : "s"} across ${seasons} drafts — the rebuild lever is already mortgaged.`,
      0.5 + 0.12 * (seasons - firsts),
    );
  }

  return items;
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

function collectOpportunities(
  team: TeamProfile,
  mdi: SwotMdiEntry[],
  waivers: WaiverCandidate[],
  proposals: TradeProposal[],
  phase: LeaguePhase,
): SwotItem[] {
  const items: SwotItem[] = [];
  const item = (title: string, detail: string, score: number) =>
    items.push({ category: "OPPORTUNITY", title, detail, score });

  const myId = team.roster.rosterId;
  const deficits = new Set(
    POSITIONS.filter((pos) => (team.positionalBalance[pos] ?? 0) < -0.3),
  );

  // Free agency: best claims, prioritized toward deficits.
  const claims = [...waivers]
    .sort(
      (a, b) =>
        b.marketValue * (deficits.has(b.player.position) ? 1.5 : 1) -
        a.marketValue * (deficits.has(a.player.position) ? 1.5 : 1),
    )
    .slice(0, 3);
  if (claims.length > 0) {
    const names = claims
      .map((c) => `${c.player.name} (${c.player.position})`)
      .join(", ");
    const fillsDeficit = claims.some((c) => deficits.has(c.player.position));
    item(
      fillsDeficit ? "Free agents cover a deficit" : "Free-agent value on the wire",
      `${names} ${claims.length > 1 ? "are" : "is"} unrostered — startable value for nothing but waiver priority.`,
      fillsDeficit ? 0.8 : 0.55,
    );
  }

  // Buy low: rival-owned players the engine says the market underprices.
  const buyPool = mdi.filter(
    (r) =>
      r.rosterId !== null &&
      r.rosterId !== myId &&
      isPlayerAsset(r.asset) &&
      (r.signal === "BUY" || r.signal === "STRONG_BUY"),
  );
  const deficitBuys = buyPool.filter(
    (r) => isPlayerAsset(r.asset) && deficits.has(r.asset.position),
  );
  const buys = (deficitBuys.length > 0 ? deficitBuys : buyPool)
    .sort((a, b) => a.mdi - b.mdi)
    .slice(0, 3);
  if (buys.length > 0) {
    const names = buys
      .map((r) => (isPlayerAsset(r.asset) ? `${r.asset.name} (${r.asset.position})` : r.asset.id))
      .join(", ");
    item(
      deficitBuys.length > 0 ? "Buy-low targets at your deficits" : "Buy-low targets on rival rosters",
      `The engine prices ${names} above the current market — underpriced production available in trade.`,
      deficitBuys.length > 0 ? 0.85 : 0.6,
    );
  }

  // Sell high: own assets the market currently overpays for.
  const sells = mdi
    .filter(
      (r) =>
        r.rosterId === myId && (r.signal === "SELL" || r.signal === "STRONG_SELL"),
    )
    .sort((a, b) => b.mdi - a.mdi)
    .slice(0, 3);
  if (sells.length > 0) {
    const names = sells
      .map((r) => (isPlayerAsset(r.asset) ? r.asset.name : r.asset.id))
      .join(", ");
    item(
      "Sell-high window is open",
      `The market currently overpays for ${names} relative to engine value — convert the premium before it corrects.`,
      0.7,
    );
  }

  // Matchmaker: cleared win-win trades involving this roster.
  const myProposals = proposals
    .filter((p) => p.sideA.rosterId === myId || p.sideB.rosterId === myId)
    .sort((a, b) => b.winWinProbability - a.winWinProbability);
  const best = myProposals[0];
  if (best) {
    item(
      `${myProposals.length} matchmaker-cleared trade${myProposals.length > 1 ? "s" : ""}`,
      `Best board: ${best.rationale} Win-win probability ${Math.round(best.winWinProbability * 100)}%.`,
      0.5 + 0.4 * best.winWinProbability,
    );
  }

  // Calendar liquidity.
  const multiplier = PHASE_MULTIPLIERS[phase];
  const rebuilding = team.window === "REBUILD" || team.window === "RETOOL";
  if (multiplier > 1 && rebuilding) {
    item(
      "Pick market is rich — sell into it",
      `League phase ${phase.replace("_", " ")} prices picks at ${multiplier.toFixed(2)}× — the seasonal high point to flip veterans for draft capital.`,
      0.55 + 0.3 * (multiplier - 1),
    );
  } else if (multiplier < 1 && !rebuilding) {
    item(
      "Picks are trading at a discount — buy them",
      `League phase ${phase.replace("_", " ")} prices picks at ${multiplier.toFixed(2)}× — acquire future capital cheap while rivals chase wins.`,
      0.5 + 0.3 * (1 - multiplier),
    );
  }

  return items;
}

// ---------------------------------------------------------------------------
// Threats
// ---------------------------------------------------------------------------

function collectThreats(
  team: TeamProfile,
  league: TeamProfile[],
  valueOf: (assetId: string) => number,
): SwotItem[] {
  const items: SwotItem[] = [];
  const item = (title: string, detail: string, score: number) =>
    items.push({ category: "THREAT", title, detail, score });

  // Age cliff on key assets.
  const cliffPlayers = team.roster.players
    .filter(
      (p) =>
        valueOf(p.id) >= KEY_ASSET_VALUE &&
        remainingEliteYears(p.age, p.position) < CLIFF_YEARS,
    )
    .sort((a, b) => valueOf(b.id) - valueOf(a.id));
  if (cliffPlayers.length > 0) {
    const atRisk = cliffPlayers.reduce((s, p) => s + valueOf(p.id), 0);
    const names = cliffPlayers
      .slice(0, 3)
      .map((p) => `${p.name} (${p.position}, ${p.age})`)
      .join(", ");
    item(
      "Weibull cliff exposure",
      `${names} ${cliffPlayers.length > 1 ? "are" : "is"} inside the positional aging cliff — roughly ${Math.round(atRisk).toLocaleString("en-US")} in value decays to zero on its own.`,
      0.7 + Math.min(0.25, cliffPlayers.length * 0.08),
    );
  }

  // Value concentration.
  const playerValue = team.roster.players.reduce((s, p) => s + valueOf(p.id), 0);
  const topPlayer = [...team.roster.players].sort(
    (a, b) => valueOf(b.id) - valueOf(a.id),
  )[0];
  if (topPlayer && playerValue > 0) {
    const share = valueOf(topPlayer.id) / playerValue;
    if (share >= CONCENTRATION_SHARE) {
      item(
        "Portfolio concentration risk",
        `${topPlayer.name} alone is ${Math.round(share * 100)}% of player value — one injury or suspension craters the franchise.`,
        0.55 + 0.4 * share,
      );
    }
  }

  // Expiring role security on valuable players.
  const insecure = team.roster.players
    .filter((p) => valueOf(p.id) >= KEY_ASSET_VALUE && p.contractFactor <= 0.3)
    .sort((a, b) => valueOf(b.id) - valueOf(a.id))
    .slice(0, 3);
  if (insecure.length > 0) {
    item(
      "Role security expiring",
      `${insecure.map((p) => p.name).join(", ")} ${insecure.length > 1 ? "are" : "is"} past the rookie-contract security window — a depth-chart change reprices ${insecure.length > 1 ? "them" : "him"} overnight.`,
      0.55,
    );
  }

  // Arms race: rivals in a contending window with a bigger portfolio.
  const contending = team.window === "CONTEND" || team.window === "ALL_IN";
  const rivals = league.filter(
    (t) =>
      t.roster.rosterId !== team.roster.rosterId &&
      (t.window === "CONTEND" || t.window === "ALL_IN") &&
      (contending ? t.totalValue > team.totalValue : t.futureValue > team.futureValue),
  );
  if (contending && rivals.length > 0) {
    const top = [...rivals].sort((a, b) => b.totalValue - a.totalValue)[0];
    item(
      `${rivals.length} contender${rivals.length > 1 ? "s" : ""} out-own you`,
      `${top?.roster.ownerName ?? "A rival"} leads the arms race with ${Math.round(
        top?.totalValue ?? 0,
      ).toLocaleString("en-US")} in assets — your title window is contested, not open.`,
      0.5 + Math.min(0.35, rivals.length * 0.07),
    );
  } else if (!contending && rivals.length > 0) {
    item(
      "Rebuild race is crowded",
      `${rivals.length} contending team${rivals.length > 1 ? "s hold" : " holds"} more future value than you — the picks you're counting on will cost more each month.`,
      0.45 + Math.min(0.3, rivals.length * 0.06),
    );
  }

  return items;
}

// ---------------------------------------------------------------------------
// Verdict & grade
// ---------------------------------------------------------------------------

function buildVerdict(
  team: TeamProfile,
  percentile: number,
  strengths: SwotItem[],
  weaknesses: SwotItem[],
): string {
  const windowLine: Record<TeamProfile["window"], string> = {
    REBUILD: "a rebuilder accumulating future value",
    RETOOL: "a retooler one consolidation move from contention",
    CONTEND: "a live contender",
    ALL_IN: "an all-in contender whose window is now",
  };
  const strongest = [...strengths].sort((a, b) => b.score - a.score)[0];
  const weakest = [...weaknesses].sort((a, b) => b.score - a.score)[0];
  const parts = [
    `${team.roster.ownerName} profiles as ${windowLine[team.window]} with a portfolio at the ${ordinalPct(percentile)} percentile of the league.`,
  ];
  if (strongest) parts.push(`Biggest edge: ${lowerFirst(strongest.title)}.`);
  if (weakest) parts.push(`Biggest liability: ${lowerFirst(weakest.title)}.`);
  return parts.join(" ");
}

function compositeHealth(
  team: TeamProfile,
  percentile: number,
  efficiency: number | null,
): number {
  const balanceHealth =
    POSITIONS.filter((pos) => (team.positionalBalance[pos] ?? 0) > -BALANCE_EDGE)
      .length / POSITIONS.length;
  const eff = efficiency ?? 0.92; // neutral prior when no games played
  return Math.min(1, Math.max(0, 0.55 * percentile + 0.25 * balanceHealth + 0.2 * eff));
}

export function gradeFromHealth(health: number): string {
  if (health >= 0.85) return "A+";
  if (health >= 0.75) return "A";
  if (health >= 0.65) return "B+";
  if (health >= 0.55) return "B";
  if (health >= 0.45) return "C+";
  if (health >= 0.35) return "C";
  return "D";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildValueMap(mdi: SwotMdiEntry[]): (assetId: string) => number {
  const map = new Map(mdi.map((r) => [r.asset.id, r.marketValue]));
  return (assetId: string) => map.get(assetId) ?? 0;
}

/** Team's total-value percentile within the league, in [0, 1]. */
export function valuePercentile(team: TeamProfile, league: TeamProfile[]): number {
  if (league.length <= 1) return 0.5;
  const below = league.filter(
    (t) =>
      t.roster.rosterId !== team.roster.rosterId && t.totalValue < team.totalValue,
  ).length;
  return below / (league.length - 1);
}

function playersAt(
  team: TeamProfile,
  pos: Position,
  valueOf: (assetId: string) => number,
): PlayerAsset[] {
  return team.roster.players
    .filter((p) => p.position === pos)
    .sort((a, b) => valueOf(b.id) - valueOf(a.id));
}

function cliffExposure(
  team: TeamProfile,
  valueOf: (assetId: string) => number,
): { atRiskValue: number; playerValue: number } {
  let atRiskValue = 0;
  let playerValue = 0;
  for (const p of team.roster.players) {
    const v = valueOf(p.id);
    playerValue += v;
    if (remainingEliteYears(p.age, p.position) < CLIFF_YEARS) atRiskValue += v;
  }
  return { atRiskValue, playerValue };
}

function top(items: SwotItem[]): SwotItem[] {
  return [...items].sort((a, b) => b.score - a.score).slice(0, MAX_ITEMS_PER_QUADRANT);
}

function ordinalPct(p: number): string {
  return `${Math.round(p * 100)}th`;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
