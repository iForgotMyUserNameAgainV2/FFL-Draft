/**
 * Demo league — a deterministic, synthetic 12-team superflex dynasty
 * league that exercises every engine without touching external APIs.
 * Reachable at /league/demo/*. Values are generated with a seeded PRNG so
 * the demo is stable across reloads and deployments.
 */

import type {
  LeagueSettings,
  PickAsset,
  PlayerAsset,
  Position,
  TeamRoster,
} from "@/lib/types/dynasty";
import { playerEngineValue } from "@/lib/math/mdi";
import { pickEngineValue, phaseFromDate } from "@/lib/math/liquidity";
import {
  assembleAnalytics,
  type LeagueAnalytics,
  type WeeklyPerformance,
} from "@/lib/league-service";

export const DEMO_LEAGUE_ID = "demo";

/** Mulberry32 — tiny deterministic PRNG. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEAM_NAMES = [
  "Gridiron Capital",
  "Tundra Syndicate",
  "Vertical Threat Fund",
  "Chrome Dome Dynasty",
  "The Compound",
  "Redzone Holdings",
  "Blitz Street LLC",
  "Cellar Door Rebuild",
  "Prime Time Partners",
  "Fourth & Long Trust",
  "Aerial Assets Group",
  "Mudville Nine",
];

interface SeedPlayer {
  name: string;
  position: Position;
  team: string;
  age: number;
  /** Rough dynasty tier, 1 = elite cornerstone … 5 = depth. */
  tier: 1 | 2 | 3 | 4 | 5;
}

const STAR_POOL: SeedPlayer[] = [
  // QBs
  { name: "Josh Allen", position: "QB", team: "BUF", age: 30, tier: 1 },
  { name: "Jayden Daniels", position: "QB", team: "WAS", age: 25, tier: 1 },
  { name: "Patrick Mahomes", position: "QB", team: "KC", age: 30, tier: 1 },
  { name: "C.J. Stroud", position: "QB", team: "HOU", age: 24, tier: 2 },
  { name: "Caleb Williams", position: "QB", team: "CHI", age: 24, tier: 2 },
  { name: "Drake Maye", position: "QB", team: "NE", age: 23, tier: 2 },
  { name: "Lamar Jackson", position: "QB", team: "BAL", age: 29, tier: 1 },
  { name: "Jalen Hurts", position: "QB", team: "PHI", age: 27, tier: 2 },
  { name: "Joe Burrow", position: "QB", team: "CIN", age: 29, tier: 1 },
  { name: "Justin Herbert", position: "QB", team: "LAC", age: 28, tier: 2 },
  { name: "Jordan Love", position: "QB", team: "GB", age: 27, tier: 3 },
  { name: "Anthony Richardson", position: "QB", team: "IND", age: 24, tier: 3 },
  // RBs
  { name: "Bijan Robinson", position: "RB", team: "ATL", age: 24, tier: 1 },
  { name: "Jahmyr Gibbs", position: "RB", team: "DET", age: 24, tier: 1 },
  { name: "Breece Hall", position: "RB", team: "NYJ", age: 25, tier: 2 },
  { name: "De'Von Achane", position: "RB", team: "MIA", age: 24, tier: 2 },
  { name: "Omarion Hampton", position: "RB", team: "LAC", age: 23, tier: 2 },
  { name: "Christian McCaffrey", position: "RB", team: "SF", age: 30, tier: 4 },
  { name: "Saquon Barkley", position: "RB", team: "PHI", age: 29, tier: 3 },
  { name: "Derrick Henry", position: "RB", team: "BAL", age: 32, tier: 4 },
  { name: "Kyren Williams", position: "RB", team: "LAR", age: 25, tier: 3 },
  { name: "James Cook", position: "RB", team: "BUF", age: 26, tier: 3 },
  { name: "Josh Jacobs", position: "RB", team: "GB", age: 28, tier: 3 },
  { name: "Ashton Jeanty", position: "RB", team: "LV", age: 22, tier: 1 },
  // WRs
  { name: "Ja'Marr Chase", position: "WR", team: "CIN", age: 26, tier: 1 },
  { name: "Justin Jefferson", position: "WR", team: "MIN", age: 27, tier: 1 },
  { name: "CeeDee Lamb", position: "WR", team: "DAL", age: 27, tier: 1 },
  { name: "Malik Nabers", position: "WR", team: "NYG", age: 23, tier: 1 },
  { name: "Amon-Ra St. Brown", position: "WR", team: "DET", age: 26, tier: 1 },
  { name: "Marvin Harrison Jr.", position: "WR", team: "ARI", age: 24, tier: 2 },
  { name: "Puka Nacua", position: "WR", team: "LAR", age: 25, tier: 1 },
  { name: "Brian Thomas Jr.", position: "WR", team: "JAX", age: 23, tier: 1 },
  { name: "Garrett Wilson", position: "WR", team: "NYJ", age: 26, tier: 2 },
  { name: "Drake London", position: "WR", team: "ATL", age: 24, tier: 2 },
  { name: "Rome Odunze", position: "WR", team: "CHI", age: 24, tier: 3 },
  { name: "Nico Collins", position: "WR", team: "HOU", age: 27, tier: 2 },
  { name: "A.J. Brown", position: "WR", team: "PHI", age: 29, tier: 3 },
  { name: "Tyreek Hill", position: "WR", team: "MIA", age: 32, tier: 4 },
  { name: "Davante Adams", position: "WR", team: "LAR", age: 33, tier: 5 },
  { name: "DK Metcalf", position: "WR", team: "PIT", age: 28, tier: 3 },
  // TEs
  { name: "Brock Bowers", position: "TE", team: "LV", age: 23, tier: 1 },
  { name: "Sam LaPorta", position: "TE", team: "DET", age: 25, tier: 2 },
  { name: "Trey McBride", position: "TE", team: "ARI", age: 26, tier: 2 },
  { name: "George Kittle", position: "TE", team: "SF", age: 32, tier: 4 },
  { name: "Mark Andrews", position: "TE", team: "BAL", age: 30, tier: 4 },
  { name: "Dalton Kincaid", position: "TE", team: "BUF", age: 26, tier: 3 },
  { name: "Travis Kelce", position: "TE", team: "KC", age: 36, tier: 5 },
  { name: "Kyle Pitts", position: "TE", team: "ATL", age: 25, tier: 3 },
];

const DEPTH_FIRST = ["Tre", "Marcus", "Deon", "Jalen", "Xavier", "Kadarius", "Rashod", "Elijah", "Zay", "Quentin", "Chig", "Romeo"];
const DEPTH_LAST = ["Whitfield", "Calloway", "Bankston", "Merriweather", "Slade", "Okonkwo", "Vandergriff", "Toliver", "Renfrow", "Beckwith", "Larkin", "Dupree"];
const NFL_TEAMS = ["DEN", "SEA", "TB", "NO", "CAR", "TEN", "CLE", "NYG", "MIN", "DAL", "JAX", "WAS"];

function buildDepthPool(rand: () => number): SeedPlayer[] {
  const mix: Position[] = ["RB", "WR", "WR", "TE", "QB", "RB", "WR", "TE"];
  // Unique first/last combinations via a coprime stride through the
  // 12×12 name grid, so no two depth players share a full name.
  const pool: SeedPlayer[] = [];
  for (let i = 0; i < 72; i++) {
    const first = DEPTH_FIRST[i % DEPTH_FIRST.length]!;
    const last = DEPTH_LAST[(Math.floor(i / 12) + i * 5) % DEPTH_LAST.length]!;
    pool.push({
      name: `${first} ${last}`,
      position: mix[i % mix.length]!,
      team: NFL_TEAMS[Math.floor(rand() * NFL_TEAMS.length)]!,
      age: 22 + Math.floor(rand() * 8),
      tier: rand() < 0.3 ? 4 : 5,
    });
  }
  return pool;
}

/** PAR by tier with seeded jitter — feeds the real MDI engine. */
function tierPar(tier: SeedPlayer["tier"], rand: () => number): number {
  const base: Record<SeedPlayer["tier"], number> = { 1: 8.5, 2: 6, 3: 4, 4: 2, 5: 0.5 };
  return Math.max(0, base[tier] + (rand() - 0.5) * 2);
}

export function buildDemoAnalytics(now = new Date()): LeagueAnalytics {
  const rand = mulberry32(0xd1a57);
  const season = now.getUTCFullYear();
  const phase = phaseFromDate(now);

  const settings: LeagueSettings = {
    leagueId: DEMO_LEAGUE_ID,
    name: "The Obsidian Invitational",
    totalRosters: 12,
    isSuperFlex: true,
    isPpr: true,
    isTePremium: false,
    lineupSlots: ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "SUPER_FLEX"],
    season,
    week: 0,
  };

  // --- distribute players: stars snake-drafted, depth round-robin --------
  const stars = [...STAR_POOL];
  const depth = buildDepthPool(rand);
  const rosterPlayers: SeedPlayer[][] = Array.from({ length: 12 }, () => []);
  stars.forEach((p, i) => {
    const round = Math.floor(i / 12);
    const idx = round % 2 === 0 ? i % 12 : 11 - (i % 12);
    rosterPlayers[idx]!.push(p);
  });
  depth.forEach((p, i) => rosterPlayers[i % 12]!.push(p));

  const marketValues = new Map<string, number>();
  const rosters: TeamRoster[] = rosterPlayers.map((seeds, idx) => {
    const rosterId = idx + 1;
    const players: PlayerAsset[] = seeds.map((seed, j) => {
      const id = `demo-${rosterId}-${j}`;
      const asset: PlayerAsset = {
        kind: "player",
        id,
        name: seed.name,
        position: seed.position,
        team: seed.team,
        age: seed.age,
        yearsExp: Math.max(0, seed.age - 22),
        par: tierPar(seed.tier, rand),
        contractFactor: Math.max(0.2, Math.min(1, (5 - Math.max(0, seed.age - 22)) / 4)),
        draftCapital: seed.tier <= 2 ? 0.85 : seed.tier === 3 ? 0.6 : 0.3,
      };
      // Market value = engine value distorted by seeded sentiment noise, so
      // the MDI board has genuine buys and sells in both directions.
      const sentiment = 0.78 + rand() * 0.5;
      marketValues.set(id, Math.round(playerEngineValue(asset) * sentiment));
      return asset;
    });

    const picks: PickAsset[] = [1, 2, 3].flatMap((yearOut) =>
      ([1, 2, 3, 4] as const).map((round) => ({
        kind: "pick" as const,
        id: `${season + yearOut}-R${round}-orig${rosterId}`,
        season: season + yearOut,
        round,
        originalOwnerId: rosterId,
        projectedSlot: null,
      })),
    );

    const wins = Math.floor(rand() * 12);
    const pointsFor = 1250 + rand() * 650;
    return {
      rosterId,
      ownerId: `demo-owner-${rosterId}`,
      ownerName: TEAM_NAMES[idx]!,
      players,
      picks,
      record: { wins, losses: 13 - wins, ties: 0 },
      pointsFor,
      maxPointsFor: pointsFor / (0.86 + rand() * 0.1),
    };
  });

  const marketValueOf = (asset: PlayerAsset | PickAsset): number =>
    asset.kind === "player"
      ? (marketValues.get(asset.id) ?? 0)
      : pickEngineValue(asset, phase, season);

  // --- synthetic weekly performance --------------------------------------
  const weekly: WeeklyPerformance[] = [];
  for (const roster of rosters) {
    const strength = 135 + (roster.pointsFor - 1250) / 12;
    for (let week = 1; week <= 14; week++) {
      const optimal = strength + (rand() - 0.5) * 44;
      const efficiency = 0.84 + rand() * 0.14;
      weekly.push({
        rosterId: roster.rosterId,
        week,
        actual: Number((optimal * efficiency).toFixed(1)),
        optimal: Number(optimal.toFixed(1)),
      });
    }
  }

  return assembleAnalytics({
    settings,
    phase,
    rosters,
    marketValueOf,
    parSource: "live",
    statsSeason: season - 1,
    weekly,
  });
}
