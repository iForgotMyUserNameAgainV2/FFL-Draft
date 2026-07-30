/**
 * League assembly service (server-side).
 *
 * Two layers:
 *  - `assembleAnalytics` — pure engine assembly: given rosters with assets,
 *    a market-value function, and weekly performance, it materializes team
 *    profiles, the MDI board, the synergy matrix, and trade proposals.
 *  - `buildLeagueAnalytics` — the Sleeper-backed entry point behind
 *    /api/market that feeds real league data into the assembly.
 *
 * The split lets the demo league (and future data sources) reuse the exact
 * engine pipeline the live path runs.
 */

import type {
  LeaguePhase,
  LeagueSettings,
  LineupSlot,
  MdiResult,
  PickAsset,
  PlayerAsset,
  Position,
  TeamProfile,
  TeamRoster,
  TradeProposal,
  WaiverCandidate,
} from "@/lib/types/dynasty";
import { isPosition } from "@/lib/types/dynasty";
import {
  getLeague,
  getNflState,
  getRosters,
  getSeasonMatchups,
  getTradedPicks,
  getTrimmedPlayers,
  getUsers,
  type TrimmedPlayer,
} from "@/lib/api/sleeper";
import { getFantasyCalcValues } from "@/lib/api/fantasycalc";
import { blendConsensus, getDynastyDealerValues } from "@/lib/api/dynasty-dealer";
import { computeMdiBatch, playerEngineValue } from "@/lib/math/mdi";
import { phaseFromDate, pickEngineValue } from "@/lib/math/liquidity";
import { remainingEliteYears } from "@/lib/math/weibull";
import {
  computeOptimalLineup,
  lineupEfficiency,
  tankContendPosture,
  type ScoredPlayer,
} from "@/lib/math/max-pf";
import {
  aggregateSeasonStats,
  computeParMap,
  replacementLevels,
  replacementRanks,
  startersPerPosition,
  type SeasonStats,
} from "@/lib/math/par";
import {
  baselineFromLineup,
  generateProposals,
  positionalBalance,
  synergyMatrix,
  type AssetValuation,
  type SynergyCell,
} from "@/lib/math/trade-engine";

export interface WeeklyPerformance {
  rosterId: number;
  week: number;
  /** Points actually scored by the starting lineup. */
  actual: number;
  /** Max-PF: optimal-lineup points from the full roster that week. */
  optimal: number;
}

export interface LeagueAnalytics {
  settings: LeagueSettings;
  phase: LeaguePhase;
  teams: TeamProfile[];
  mdi: SerializedMdiResult[];
  synergy: SynergyCell[];
  proposals: TradeProposal[];
  /** Whether PAR came from real weekly scoring or the rank-based estimate. */
  parSource: "live" | "estimated";
  /** Season the weekly stats were drawn from (null when estimated only). */
  statsSeason: number | null;
  weekly: WeeklyPerformance[];
  /** Top unrostered players worth a waiver claim. */
  waivers: WaiverCandidate[];
}

export interface SerializedMdiResult extends Omit<MdiResult, "asset"> {
  asset: MdiResult["asset"];
  rosterId: number | null;
}

const PICK_SEASONS_AHEAD = 3;

// ---------------------------------------------------------------------------
// Engine assembly (data-source agnostic)
// ---------------------------------------------------------------------------

export interface AssemblyInput {
  settings: LeagueSettings;
  phase: LeaguePhase;
  /** Rosters with player and pick assets already populated. */
  rosters: TeamRoster[];
  /** Consensus market value for any asset. */
  marketValueOf: (asset: PlayerAsset | PickAsset) => number;
  parSource: "live" | "estimated";
  statsSeason: number | null;
  weekly: WeeklyPerformance[];
  waivers?: WaiverCandidate[];
}

export function assembleAnalytics(input: AssemblyInput): LeagueAnalytics {
  const {
    settings,
    phase,
    rosters,
    marketValueOf,
    parSource,
    statsSeason,
    weekly,
    waivers = [],
  } = input;
  const currentSeason = settings.season;

  // League-rule-aware positional baseline: surplus/deficit is measured
  // against what THIS league's lineup actually requires (superflex, 3-WR,
  // K/DEF, etc.), not a generic format.
  const leagueBaseline = baselineFromLineup(startersPerPosition(settings.lineupSlots));

  // --- team profiles -----------------------------------------------------
  const leagueTotals = rosters.map((r) =>
    [...r.players, ...r.picks].reduce((s, a) => s + marketValueOf(a), 0),
  );
  const sortedTotals = [...leagueTotals].sort((a, b) => a - b);

  const teams: TeamProfile[] = rosters.map((roster, idx) => {
    const playerValues = roster.players.map((p) => ({
      position: p.position,
      value: marketValueOf(p),
      winNowShare: winNowShare(p),
    }));
    const pickValues = roster.picks.map((pk) => marketValueOf(pk));

    const playersTotal = playerValues.reduce((s, v) => s + v.value, 0);
    const picksTotal = pickValues.reduce((s, v) => s + v, 0);
    const totalValue = playersTotal + picksTotal;
    const winNowValue = playerValues.reduce((s, v) => s + v.value * v.winNowShare, 0);
    const futureValue = totalValue - winNowValue;

    const total = leagueTotals[idx] ?? 0;
    const valuePercentile =
      sortedTotals.length <= 1
        ? 0.5
        : sortedTotals.findIndex((v) => v >= total) / (sortedTotals.length - 1);

    const games =
      roster.record.wins + roster.record.losses + roster.record.ties;
    const winPct = games > 0 ? roster.record.wins / games : 0.5;
    const efficiency =
      roster.maxPointsFor > 0
        ? lineupEfficiency(roster.pointsFor, roster.maxPointsFor)
        : 1;

    const posture = tankContendPosture({
      valuePercentile,
      winNowShare: totalValue > 0 ? winNowValue / totalValue : 0.5,
      winPct,
      efficiency,
    });

    return {
      roster,
      totalValue,
      winNowValue,
      futureValue,
      window: posture.window,
      positionalBalance: positionalBalance(playerValues, undefined, leagueBaseline),
    };
  });

  // --- MDI across the whole league ---------------------------------------
  // K/DEF have no liquid market to arbitrage — they belong on rosters and
  // in lineups, but not on the MDI board.
  const allAssets = teams.flatMap((t) => [
    ...t.roster.players
      .filter((p) => p.position !== "K" && p.position !== "DEF")
      .map((p) => ({
        asset: p as PlayerAsset | PickAsset,
        rosterId: t.roster.rosterId,
      })),
    ...t.roster.picks.map((p) => ({
      asset: p as PlayerAsset | PickAsset,
      rosterId: t.roster.rosterId,
    })),
  ]);
  const mdiInput = allAssets.map(({ asset }) => ({
    asset,
    marketValue: marketValueOf(asset),
  }));
  const rosterIdByAsset = new Map(
    allAssets.map(({ asset, rosterId }) => [asset.id, rosterId]),
  );
  const mdi = computeMdiBatch(mdiInput, phase, currentSeason).map((r) => ({
    ...r,
    rosterId: rosterIdByAsset.get(r.asset.id) ?? null,
  }));

  // --- synergy + proposals -----------------------------------------------
  const synergy = synergyMatrix(teams);
  const valuationsByRoster = new Map<number, AssetValuation[]>(
    teams.map((t) => [
      t.roster.rosterId,
      [...t.roster.players, ...t.roster.picks].map((asset) => ({
        asset,
        marketValue: marketValueOf(asset),
        engineValue:
          asset.kind === "player"
            ? playerEngineValue(asset)
            : pickEngineValue(asset, phase, currentSeason),
        winNowShare: asset.kind === "player" ? winNowShare(asset) : 0,
      })),
    ]),
  );

  const teamById = new Map(teams.map((t) => [t.roster.rosterId, t]));

  // Pair coverage: the top synergy pairs league-wide, PLUS every team's
  // single best partner — so the optimizer always has focused proposals
  // for whichever roster the manager runs.
  const pairKey = (c: SynergyCell) =>
    `${Math.min(c.rosterIdA, c.rosterIdB)}-${Math.max(c.rosterIdA, c.rosterIdB)}`;
  const seenPairs = new Set<string>();
  const pairs: SynergyCell[] = [];
  const addPair = (cell: SynergyCell | undefined) => {
    if (!cell || seenPairs.has(pairKey(cell))) return;
    seenPairs.add(pairKey(cell));
    pairs.push(cell);
  };
  synergy.slice(0, 8).forEach(addPair);
  for (const t of teams) {
    addPair(
      synergy.find(
        (c) =>
          c.rosterIdA === t.roster.rosterId || c.rosterIdB === t.roster.rosterId,
      ),
    );
  }

  const proposals: TradeProposal[] = [];
  for (const cell of pairs) {
    const teamA = teamById.get(cell.rosterIdA);
    const teamB = teamById.get(cell.rosterIdB);
    if (!teamA || !teamB) continue;
    proposals.push(
      ...generateProposals(
        teamA,
        teamB,
        valuationsByRoster.get(cell.rosterIdA) ?? [],
        valuationsByRoster.get(cell.rosterIdB) ?? [],
        { maxProposals: 3 },
      ),
    );
  }
  proposals.sort((a, b) => b.winWinProbability - a.winWinProbability);

  return {
    settings,
    phase,
    teams,
    mdi,
    synergy,
    proposals: proposals.slice(0, 36),
    parSource,
    statsSeason,
    weekly,
    waivers,
  };
}

// ---------------------------------------------------------------------------
// Sleeper-backed entry point
// ---------------------------------------------------------------------------

export async function buildLeagueAnalytics(leagueId: string): Promise<LeagueAnalytics> {
  const [league, rosters, users, tradedPicks, players, nflState] = await Promise.all([
    getLeague(leagueId),
    getRosters(leagueId),
    getUsers(leagueId),
    getTradedPicks(leagueId),
    getTrimmedPlayers(),
    getNflState(),
  ]);

  const settings = toLeagueSettings(league, nflState.week);
  const phase = phaseFromDate(new Date(), settings.week || undefined);
  const currentSeason = settings.season;

  const [fantasyCalc, liveStats] = await Promise.all([
    getFantasyCalcValues({
      isSuperFlex: settings.isSuperFlex,
      ppr: settings.isPpr,
      numTeams: settings.totalRosters,
    }),
    loadSeasonStats(leagueId, league.previous_league_id, settings, nflState),
  ]);

  // Real PAR from weekly scoring when a season of data exists.
  const parByPlayer = liveStats
    ? buildParMap(liveStats.stats, players, settings)
    : null;

  // Rank within position (for the estimate fallback) from the primary source.
  const positionRanks = buildPositionRanks(fantasyCalc, players);

  const userById = new Map(users.map((u) => [u.user_id, u]));

  // --- assets per roster -----------------------------------------------
  const rosterAssets = rosters.map((roster) => {
    const playerAssets: PlayerAsset[] = (roster.players ?? [])
      .map((pid) => {
        const p = players[pid];
        if (!p || !isPosition(p.position)) return null;
        const rank = positionRanks.get(pid) ?? 60;
        return buildPlayerAsset(
          pid,
          p.name,
          p.position,
          p.team,
          p.age,
          p.years_exp,
          rank,
          parByPlayer?.get(pid) ?? null,
          liveStats?.stats.get(pid)?.ppg ?? null,
        );
      })
      .filter((p): p is PlayerAsset => p !== null);

    const owner = roster.owner_id ? userById.get(roster.owner_id) : undefined;
    const teamRoster: TeamRoster = {
      rosterId: roster.roster_id,
      ownerId: roster.owner_id ?? "",
      ownerName:
        owner?.metadata?.team_name || owner?.display_name || `Roster ${roster.roster_id}`,
      players: playerAssets,
      picks: [],
      starters: (roster.starters ?? []).filter((id) => id !== "0"),
      record: {
        wins: roster.settings.wins,
        losses: roster.settings.losses,
        ties: roster.settings.ties,
      },
      pointsFor: roster.settings.fpts + (roster.settings.fpts_decimal ?? 0) / 100,
      maxPointsFor:
        (roster.settings.ppts ?? 0) + (roster.settings.ppts_decimal ?? 0) / 100,
    };
    return teamRoster;
  });

  assignPickOwnership(rosterAssets, tradedPicks, currentSeason);

  // --- market consensus --------------------------------------------------
  const contexts = new Map(
    Object.entries(players).map(([pid, p]) => [
      pid,
      { position: p.position, age: p.age },
    ]),
  );
  const dealer = await getDynastyDealerValues(fantasyCalc, contexts);
  const consensus = blendConsensus([fantasyCalc, dealer]);

  const marketValueOf = (asset: PlayerAsset | PickAsset): number => {
    if (asset.kind === "player") {
      const quoted = consensus.get(asset.id)?.value;
      if (quoted !== undefined) return quoted;
      // K/DEF (and deep roster-cloggers) have no market quotes — price
      // them at engine value so rosters stay complete and totals honest.
      return asset.position === "K" || asset.position === "DEF"
        ? Math.round(playerEngineValue(asset))
        : 0;
    }
    // Picks trade on the liquidity curve; use engine value as market proxy
    // until a pick-quote source is wired.
    return pickEngineValue(asset, phase, currentSeason);
  };

  const weekly = liveStats
    ? computeWeeklyPerformance(liveStats.weeks, players, settings)
    : [];

  // --- waiver wire: best unrostered players by market value ---------------
  const rosteredIds = new Set(
    rosterAssets.flatMap((r) => r.players.map((p) => p.id)),
  );
  const waivers: WaiverCandidate[] = [];
  for (const [pid, entry] of consensus) {
    if (rosteredIds.has(pid)) continue;
    const p = players[pid];
    if (!p || !isPosition(p.position)) continue;
    waivers.push({
      player: buildPlayerAsset(
        pid,
        p.name,
        p.position,
        p.team,
        p.age,
        p.years_exp,
        positionRanks.get(pid) ?? 80,
        parByPlayer?.get(pid) ?? null,
        liveStats?.stats.get(pid)?.ppg ?? null,
      ),
      marketValue: entry.value,
      trend30d: entry.trend30d,
    });
  }
  waivers.sort((a, b) => b.marketValue - a.marketValue);

  return assembleAnalytics({
    settings,
    phase,
    rosters: rosterAssets,
    marketValueOf,
    parSource: parByPlayer ? "live" : "estimated",
    statsSeason: liveStats?.season ?? null,
    weekly,
    waivers: waivers.slice(0, 40),
  });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

interface LiveSeasonStats {
  season: number;
  stats: Map<string, SeasonStats>;
  weeks: Awaited<ReturnType<typeof getSeasonMatchups>>;
}

/**
 * Pull weekly matchup data for PAR and Max-PF tracking. Prefers the
 * current season once ≥3 weeks are in the books; otherwise falls back to
 * the previous league in the dynasty lineage (offseason case). Returns
 * null when no scoring data exists anywhere (expansion year one).
 */
async function loadSeasonStats(
  leagueId: string,
  previousLeagueId: string | null,
  settings: LeagueSettings,
  nflState: { week: number; season_type: string },
): Promise<LiveSeasonStats | null> {
  const inSeason =
    (nflState.season_type === "regular" || nflState.season_type === "post") &&
    nflState.week >= 3;

  const source = inSeason
    ? { id: leagueId, season: settings.season, toWeek: Math.min(nflState.week, 17) }
    : previousLeagueId
      ? { id: previousLeagueId, season: settings.season - 1, toWeek: 17 }
      : null;
  if (!source) return null;

  const weeks = await getSeasonMatchups(source.id, 1, source.toWeek).catch(
    () => [] as Awaited<ReturnType<typeof getSeasonMatchups>>,
  );
  if (weeks.length === 0) return null;

  const pointsMaps = weeks.flatMap(({ matchups }) =>
    matchups.map((m) => m.players_points ?? {}),
  );
  return { season: source.season, stats: aggregateSeasonStats(pointsMaps), weeks };
}

function buildParMap(
  stats: Map<string, SeasonStats>,
  players: Record<string, TrimmedPlayer>,
  settings: LeagueSettings,
): Map<string, number> {
  const positionOf = (playerId: string): Position | null => {
    const pos = players[playerId]?.position;
    return pos && isPosition(pos) ? pos : null;
  };
  const ranks = replacementRanks(settings.lineupSlots, settings.totalRosters);
  const levels = replacementLevels(stats, positionOf, ranks);
  return computeParMap(stats, positionOf, levels);
}

/**
 * Week-by-week actual starter points vs the optimal (Max-PF) lineup that
 * the roster could have fielded, using the league's real lineup slots.
 */
function computeWeeklyPerformance(
  weeks: Awaited<ReturnType<typeof getSeasonMatchups>>,
  players: Record<string, TrimmedPlayer>,
  settings: LeagueSettings,
): WeeklyPerformance[] {
  const performance: WeeklyPerformance[] = [];
  for (const { week, matchups } of weeks) {
    for (const matchup of matchups) {
      const pool: ScoredPlayer[] = Object.entries(matchup.players_points ?? {})
        .map(([playerId, points]) => {
          const pos = players[playerId]?.position;
          if (!pos || !isPosition(pos)) return null;
          return { playerId, position: pos, points };
        })
        .filter((p): p is ScoredPlayer => p !== null);
      const { maxPoints } = computeOptimalLineup(pool, settings.lineupSlots);
      performance.push({
        rosterId: matchup.roster_id,
        week,
        actual: matchup.points,
        optimal: Math.max(maxPoints, matchup.points),
      });
    }
  }
  return performance;
}

function toLeagueSettings(
  league: Awaited<ReturnType<typeof getLeague>>,
  week: number,
): LeagueSettings {
  const rawSlots = league.roster_positions ?? [];
  const lineupSlots = rawSlots
    .map((s): LineupSlot | null => {
      if (s === "QB" || s === "RB" || s === "WR" || s === "TE") return s;
      if (s === "K" || s === "DEF") return s;
      if (s === "FLEX" || s === "WRRB_FLEX" || s === "REC_FLEX") return "FLEX";
      if (s === "SUPER_FLEX") return "SUPER_FLEX";
      return null; // bench, taxi, IR, IDP not part of the lineup model yet
    })
    .filter((s): s is LineupSlot => s !== null);
  return {
    leagueId: league.league_id,
    name: league.name,
    totalRosters: league.total_rosters,
    isSuperFlex: rawSlots.includes("SUPER_FLEX"),
    isPpr: (league.scoring_settings?.rec ?? 0) >= 0.5,
    isTePremium: (league.scoring_settings?.bonus_rec_te ?? 0) > 0,
    lineupSlots,
    season: Number(league.season),
    week,
  };
}

/**
 * PAR estimate from consensus positional rank: an exponential-decay
 * archetype curve calibrated so Pos1 ≈ position ceiling and PosN falls
 * to replacement (0) around the startable frontier. Fallback when no
 * weekly scoring history exists.
 */
function estimatePar(position: Position, positionRank: number): number {
  const ceilings: Record<Position, number> = {
    QB: 12,
    RB: 10,
    WR: 10,
    TE: 8,
    K: 3,
    DEF: 5,
  };
  const replacementRank: Record<Position, number> = {
    QB: 18,
    RB: 28,
    WR: 38,
    TE: 14,
    K: 14,
    DEF: 14,
  };
  const ceiling = ceilings[position];
  const repl = replacementRank[position];
  const par = ceiling * (1 - Math.log(positionRank) / Math.log(repl + 6));
  return Math.max(0, par);
}

function buildPlayerAsset(
  id: string,
  name: string,
  position: Position,
  team: string | null,
  age: number | null,
  yearsExp: number | null,
  positionRank: number,
  livePar: number | null,
  livePpg: number | null,
): PlayerAsset {
  const exp = yearsExp ?? 3;
  return {
    kind: "player",
    id,
    name,
    position,
    team,
    age: age ?? 26,
    yearsExp: exp,
    par: livePar ?? estimatePar(position, positionRank),
    ppg: livePpg,
    // Rookie-contract security: 4-year deals, tapering after year 4.
    contractFactor: Math.max(0.2, Math.min(1, (5 - exp) / 4)),
    // Draft-capital prior placeholder: young early-rank players carry
    // capital; refined once per-player draft slot ingestion lands.
    draftCapital: Math.max(0.05, Math.min(1, 1 - positionRank / 40)),
  };
}

/** Share of a player's value that is win-now (vs future seasons). */
function winNowShare(player: PlayerAsset): number {
  const remaining = remainingEliteYears(player.age, player.position);
  const baseline = remainingEliteYears(22, player.position);
  if (baseline <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - remaining / baseline));
}

function buildPositionRanks(
  quotes: Map<string, { value: number }>,
  players: Record<string, { position: string }>,
): Map<string, number> {
  const byPosition = new Map<string, Array<{ id: string; value: number }>>();
  for (const [id, quote] of quotes) {
    const pos = players[id]?.position;
    if (!pos) continue;
    const bucket = byPosition.get(pos) ?? [];
    bucket.push({ id, value: quote.value });
    byPosition.set(pos, bucket);
  }
  const ranks = new Map<string, number>();
  for (const bucket of byPosition.values()) {
    bucket.sort((a, b) => b.value - a.value);
    bucket.forEach((entry, i) => ranks.set(entry.id, i + 1));
  }
  return ranks;
}

/**
 * Every roster owns its native picks for the next PICK_SEASONS_AHEAD
 * seasons unless a traded-pick record reassigns them.
 */
function assignPickOwnership(
  rosters: TeamRoster[],
  tradedPicks: Awaited<ReturnType<typeof getTradedPicks>>,
  currentSeason: number,
): void {
  const byId = new Map(rosters.map((r) => [r.rosterId, r]));
  const rounds: Array<PickAsset["round"]> = [1, 2, 3, 4];
  for (let season = currentSeason + 1; season <= currentSeason + PICK_SEASONS_AHEAD; season++) {
    for (const roster of rosters) {
      for (const round of rounds) {
        const trade = tradedPicks.find(
          (t) =>
            Number(t.season) === season &&
            t.round === round &&
            t.roster_id === roster.rosterId,
        );
        const ownerId = trade ? trade.owner_id : roster.rosterId;
        const owner = byId.get(ownerId);
        if (!owner) continue;
        owner.picks.push({
          kind: "pick",
          id: `${season}-R${round}-orig${roster.rosterId}`,
          season,
          round,
          originalOwnerId: roster.rosterId,
          projectedSlot: null,
        });
      }
    }
  }
}
