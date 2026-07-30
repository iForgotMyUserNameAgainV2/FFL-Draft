import { describe, expect, it } from "vitest";
import {
  WEIBULL_PARAMS,
  ageValueMultiplier,
  conditionalSurvival,
  hazardAtAge,
  remainingEliteYears,
  survival,
  survivalAtAge,
} from "@/lib/math/weibull";
import {
  classifyMdi,
  computeMdiBatch,
  playerEngineValue,
  positionalSigmas,
  stdDev,
} from "@/lib/math/mdi";
import {
  FUTURE_YEAR_DISCOUNT,
  PHASE_MULTIPLIERS,
  liquidityMultiplier,
  phaseFromDate,
  pickEngineValue,
  slotMultiplier,
} from "@/lib/math/liquidity";
import {
  computeOptimalLineup,
  lineupEfficiency,
  startSitAdvice,
  tankContendPosture,
  type ScoredPlayer,
} from "@/lib/math/max-pf";
import {
  needFit,
  positionalBalance,
  synergyMatrix,
  synergyScore,
  tradeScale,
  windowComplementarity,
  winWinProbability,
  generateProposals,
  type AssetValuation,
} from "@/lib/math/trade-engine";
import {
  aggregateSeasonStats,
  computeParMap,
  replacementLevels,
  replacementRanks,
  startersPerPosition,
} from "@/lib/math/par";
import type {
  PickAsset,
  PlayerAsset,
  Position,
  TeamProfile,
} from "@/lib/types/dynasty";

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

function player(overrides: Partial<PlayerAsset> = {}): PlayerAsset {
  return {
    kind: "player",
    id: overrides.id ?? "p1",
    name: overrides.name ?? "Test Player",
    position: overrides.position ?? "WR",
    team: "DAL",
    age: overrides.age ?? 24,
    yearsExp: overrides.yearsExp ?? 2,
    par: overrides.par ?? 5,
    ppg: overrides.ppg ?? null,
    contractFactor: overrides.contractFactor ?? 0.75,
    draftCapital: overrides.draftCapital ?? 0.8,
    ...overrides,
  };
}

function pick(overrides: Partial<PickAsset> = {}): PickAsset {
  return {
    kind: "pick",
    id: overrides.id ?? "2027-R1-orig1",
    season: overrides.season ?? 2027,
    round: overrides.round ?? 1,
    originalOwnerId: 1,
    projectedSlot: overrides.projectedSlot ?? null,
    ...overrides,
  };
}

function teamProfile(
  rosterId: number,
  window: TeamProfile["window"],
  balance: Partial<Record<Position, number>>,
): TeamProfile {
  return {
    roster: {
      rosterId,
      ownerId: String(rosterId),
      ownerName: `Team ${rosterId}`,
      players: [],
      picks: [],
      starters: [],
      record: { wins: 5, losses: 5, ties: 0 },
      pointsFor: 1000,
      maxPointsFor: 1100,
    },
    totalValue: 30000,
    winNowValue: 15000,
    futureValue: 15000,
    window,
    positionalBalance: { QB: 0, RB: 0, WR: 0, TE: 0, ...balance },
  };
}

// ---------------------------------------------------------------------------
// 1. Weibull positional hazard aging model
// ---------------------------------------------------------------------------

describe("Weibull aging model", () => {
  it("S(0) = 1 and S is monotonically decreasing in age", () => {
    for (const pos of ["QB", "RB", "WR", "TE"] as const) {
      expect(survival(0, WEIBULL_PARAMS[pos])).toBe(1);
      let prev = 1;
      for (let age = 20; age <= 40; age++) {
        const s = survivalAtAge(age, pos);
        expect(s).toBeLessThanOrEqual(prev);
        expect(s).toBeGreaterThanOrEqual(0);
        prev = s;
      }
    }
  });

  it("S(eta) = e^-1 by definition of the scale parameter", () => {
    const { eta } = WEIBULL_PARAMS.RB;
    expect(survival(eta, WEIBULL_PARAMS.RB)).toBeCloseTo(Math.exp(-1), 10);
  });

  it("RBs decay much faster than QBs past age 26", () => {
    expect(survivalAtAge(30, "RB")).toBeLessThan(survivalAtAge(30, "QB"));
    // QBs remain stable through 33; RBs have cliffed hard by then.
    expect(survivalAtAge(33, "QB")).toBeGreaterThan(0.5);
    expect(survivalAtAge(33, "RB")).toBeLessThan(0.05);
  });

  it("hazard increases with age (beta > 1 wear-out regime)", () => {
    for (const pos of ["QB", "RB", "WR", "TE"] as const) {
      expect(hazardAtAge(30, pos)).toBeGreaterThan(hazardAtAge(24, pos));
    }
  });

  it("conditional survival is a proper probability and decays with horizon", () => {
    const oneYear = conditionalSurvival(25, 1, "RB");
    const threeYears = conditionalSurvival(25, 3, "RB");
    expect(oneYear).toBeGreaterThan(threeYears);
    expect(oneYear).toBeLessThanOrEqual(1);
    expect(threeYears).toBeGreaterThan(0);
  });

  it("remaining elite years shrink with age and favor QBs over RBs", () => {
    expect(remainingEliteYears(23, "RB")).toBeGreaterThan(remainingEliteYears(28, "RB"));
    expect(remainingEliteYears(28, "QB")).toBeGreaterThan(remainingEliteYears(28, "RB"));
  });

  it("age multiplier is 1 for very young players and near 0 post-cliff", () => {
    expect(ageValueMultiplier(20, "WR")).toBe(1);
    expect(ageValueMultiplier(38, "RB")).toBeLessThan(0.1);
  });
});

// ---------------------------------------------------------------------------
// 2. MDI market sentiment arbitrage
// ---------------------------------------------------------------------------

describe("MDI engine", () => {
  it("stdDev computes sample standard deviation", () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(stdDev([5], 42)).toBe(42); // fallback when n < 2
  });

  it("MDI is the z-score (engine - market) / sigma", () => {
    const young = player({ id: "a", age: 22, par: 9, draftCapital: 1 });
    const engine = playerEngineValue(young);
    const batch = computeMdiBatch(
      [
        { asset: young, marketValue: engine - 500 },
        { asset: player({ id: "b", age: 27, par: 4 }), marketValue: 3000 },
        { asset: player({ id: "c", age: 30, par: 2 }), marketValue: 1000 },
      ],
      "IN_SEASON",
      2026,
    );
    const result = batch.find((r) => r.asset.id === "a")!;
    expect(result.mdi).toBeCloseTo((engine - (engine - 500)) / result.sigma, 8);
    expect(result.mdi).toBeGreaterThan(0);
  });

  it("engine value rewards youth: same production, younger player worth more", () => {
    const young = player({ id: "y", age: 22, position: "RB", par: 7 });
    const old = player({ id: "o", age: 29, position: "RB", par: 7 });
    expect(playerEngineValue(young)).toBeGreaterThan(playerEngineValue(old));
  });

  it("sigma is computed within position groups", () => {
    const sigmas = positionalSigmas([
      { asset: player({ id: "q1", position: "QB" }), marketValue: 9000 },
      { asset: player({ id: "q2", position: "QB" }), marketValue: 1000 },
      { asset: player({ id: "t1", position: "TE" }), marketValue: 2000 },
      { asset: player({ id: "t2", position: "TE" }), marketValue: 2200 },
    ]);
    expect(sigmas.get("QB")!).toBeGreaterThan(sigmas.get("TE")!);
  });

  it("classification thresholds map to signals", () => {
    expect(classifyMdi(1.5)).toBe("STRONG_BUY");
    expect(classifyMdi(0.5)).toBe("BUY");
    expect(classifyMdi(0)).toBe("HOLD");
    expect(classifyMdi(-0.5)).toBe("SELL");
    expect(classifyMdi(-1.5)).toBe("STRONG_SELL");
  });

  it("results are sorted by absolute mispricing", () => {
    const batch = computeMdiBatch(
      [
        { asset: player({ id: "a", age: 24, par: 8 }), marketValue: 100 },
        { asset: player({ id: "b", age: 24, par: 8 }), marketValue: playerEngineValue(player({ id: "b", age: 24, par: 8 })) },
        { asset: player({ id: "c", age: 24, par: 8 }), marketValue: 5000 },
      ],
      "SUMMER",
      2026,
    );
    for (let i = 1; i < batch.length; i++) {
      expect(Math.abs(batch[i - 1]!.mdi)).toBeGreaterThanOrEqual(Math.abs(batch[i]!.mdi));
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Pick liquidity & seasonal volatility
// ---------------------------------------------------------------------------

describe("Pick liquidity engine", () => {
  it("applies the in-season cash discount and draft-month premium", () => {
    expect(liquidityMultiplier("IN_SEASON")).toBeCloseTo(0.85);
    expect(liquidityMultiplier("ROOKIE_DRAFT")).toBeCloseTo(1.25);
    expect(PHASE_MULTIPLIERS.FANTASY_PLAYOFFS).toBeLessThan(PHASE_MULTIPLIERS.IN_SEASON);
  });

  it("maps calendar dates to league phases", () => {
    expect(phaseFromDate(new Date(Date.UTC(2026, 4, 15)))).toBe("ROOKIE_DRAFT"); // May
    expect(phaseFromDate(new Date(Date.UTC(2026, 9, 15)), 6)).toBe("IN_SEASON"); // Oct wk6
    expect(phaseFromDate(new Date(Date.UTC(2026, 11, 20)), 16)).toBe("FANTASY_PLAYOFFS");
    expect(phaseFromDate(new Date(Date.UTC(2026, 0, 10)))).toBe("POSTSEASON"); // Jan
    expect(phaseFromDate(new Date(Date.UTC(2026, 2, 10)))).toBe("PRE_DRAFT"); // Mar
    expect(phaseFromDate(new Date(Date.UTC(2026, 6, 10)))).toBe("SUMMER"); // Jul
  });

  it("the same pick is ~47% richer in draft month than in-season", () => {
    const p = pick({ season: 2027 });
    const inSeason = pickEngineValue(p, "IN_SEASON", 2026);
    const draftMonth = pickEngineValue(p, "ROOKIE_DRAFT", 2026);
    expect(draftMonth / inSeason).toBeCloseTo(1.25 / 0.85, 6);
  });

  it("future-year picks are discounted per year out", () => {
    const near = pickEngineValue(pick({ season: 2027 }), "SUMMER", 2026);
    const far = pickEngineValue(pick({ id: "x", season: 2029 }), "SUMMER", 2026);
    expect(far / near).toBeCloseTo(FUTURE_YEAR_DISCOUNT ** 2, 6);
  });

  it("early picks beat late picks; round 1 beats round 2", () => {
    expect(slotMultiplier(1, 1)).toBeGreaterThan(slotMultiplier(1, 12));
    const early1 = pickEngineValue(pick({ projectedSlot: 1 }), "SUMMER", 2026);
    const late1 = pickEngineValue(pick({ id: "l", projectedSlot: 12 }), "SUMMER", 2026);
    const early2 = pickEngineValue(
      pick({ id: "r2", round: 2, projectedSlot: 1 }),
      "SUMMER",
      2026,
    );
    expect(early1).toBeGreaterThan(late1);
    expect(early1).toBeGreaterThan(early2);
  });
});

// ---------------------------------------------------------------------------
// 4. Game-theoretic trade matchmaker
// ---------------------------------------------------------------------------

describe("Trade matchmaker", () => {
  it("positional balance flags surpluses and deficits vs baseline", () => {
    const balance = positionalBalance([
      { position: "RB", value: 5000 },
      { position: "RB", value: 4000 },
      { position: "RB", value: 3000 },
      { position: "RB", value: 2500 },
      { position: "QB", value: 6000 },
    ]);
    expect(balance.RB).toBeGreaterThan(0.5); // 4 startable RBs vs 2.5 baseline
    expect(balance.WR).toBeLessThan(-2); // zero WRs vs 3.0 baseline
  });

  it("window complementarity peaks for rebuild x all-in", () => {
    expect(windowComplementarity("REBUILD", "ALL_IN")).toBe(1);
    expect(windowComplementarity("CONTEND", "CONTEND")).toBe(0);
  });

  it("needFit measures how well surpluses cover deficits", () => {
    const need: Record<Position, number> = { QB: -1, RB: 0, WR: 0, TE: 0 };
    const perfectSurplus: Record<Position, number> = { QB: 2, RB: 0, WR: 0, TE: 0 };
    const noSurplus: Record<Position, number> = { QB: 0, RB: 3, WR: 0, TE: 0 };
    expect(needFit(need, perfectSurplus)).toBe(1);
    expect(needFit(need, noSurplus)).toBe(0);
  });

  it("synergy is higher for complementary teams and zero on the diagonal", () => {
    const contender = teamProfile(1, "ALL_IN", { RB: -1.5, WR: 1.5 });
    const rebuilder = teamProfile(2, "REBUILD", { RB: 1.5, WR: -1.5 });
    const clone = teamProfile(3, "ALL_IN", { RB: -1.5, WR: 1.5 });
    expect(synergyScore(contender, rebuilder)).toBeGreaterThan(
      synergyScore(contender, clone),
    );
    expect(synergyScore(contender, contender)).toBe(0);
  });

  it("synergy matrix covers all unordered pairs, sorted descending", () => {
    const teams = [
      teamProfile(1, "ALL_IN", { RB: -1 }),
      teamProfile(2, "REBUILD", { RB: 1, WR: -1 }),
      teamProfile(3, "CONTEND", { WR: 1 }),
    ];
    const matrix = synergyMatrix(teams);
    expect(matrix).toHaveLength(3); // C(3,2)
    for (let i = 1; i < matrix.length; i++) {
      expect(matrix[i - 1]!.synergy).toBeGreaterThanOrEqual(matrix[i]!.synergy);
    }
  });

  it("trade scale grows with trade size so probabilities never saturate", () => {
    expect(tradeScale(1200, 1100)).toBe(300); // floor for small swaps
    expect(tradeScale(20000, 18000)).toBeCloseTo(4000);
    // The same absolute utility edge means less on a bigger trade.
    const small = winWinProbability(800, 800, tradeScale(3000, 3000));
    const big = winWinProbability(800, 800, tradeScale(30000, 30000));
    expect(small).toBeGreaterThan(big);
    expect(big).toBeLessThan(0.9); // no blanket 100% win-win
  });

  it("win-win probability is symmetric-ish, bounded, and monotone in gains", () => {
    expect(winWinProbability(0, 0)).toBeCloseTo(0.25, 6);
    expect(winWinProbability(1000, 1000)).toBeGreaterThan(0.8);
    expect(winWinProbability(-2000, 2000)).toBeLessThan(0.1);
    expect(winWinProbability(500, 500)).toBeGreaterThan(winWinProbability(100, 100));
  });

  it("generates balanced, positive-sum proposals between complementary teams", () => {
    const contender = teamProfile(1, "ALL_IN", { RB: -1.5, WR: 1.2 });
    const rebuilder = teamProfile(2, "REBUILD", { RB: 1.5, WR: -1.2 });
    const assetsA: AssetValuation[] = [
      {
        asset: player({ id: "wrA", position: "WR", age: 26, par: 7 }),
        marketValue: 5000,
        engineValue: 5100,
        winNowShare: 0.5,
      },
      {
        asset: pick({ id: "2027-R1-orig1" }),
        marketValue: 4800,
        engineValue: 4800,
        winNowShare: 0,
      },
    ];
    const assetsB: AssetValuation[] = [
      {
        asset: player({ id: "rbB", position: "RB", age: 24, par: 8 }),
        marketValue: 5200,
        engineValue: 5300,
        winNowShare: 0.4,
      },
      {
        asset: player({ id: "rbB2", position: "RB", age: 27, par: 6 }),
        marketValue: 3000,
        engineValue: 2600,
        winNowShare: 0.7,
      },
    ];
    const proposals = generateProposals(contender, rebuilder, assetsA, assetsB);
    expect(proposals.length).toBeGreaterThan(0);
    for (const p of proposals) {
      expect(p.sideA.utilityDelta).toBeGreaterThan(0);
      expect(p.sideB.utilityDelta).toBeGreaterThan(0);
      expect(p.winWinProbability).toBeGreaterThan(0.25);
      const imbalance =
        Math.abs(p.sideA.marketValue - p.sideB.marketValue) /
        Math.max(p.sideA.marketValue, p.sideB.marketValue);
      expect(imbalance).toBeLessThanOrEqual(0.22);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Max-PF tank vs. contend optimizer
// ---------------------------------------------------------------------------

describe("Max-PF optimizer", () => {
  const roster: ScoredPlayer[] = [
    { playerId: "qb1", position: "QB", points: 25 },
    { playerId: "qb2", position: "QB", points: 18 },
    { playerId: "rb1", position: "RB", points: 22 },
    { playerId: "rb2", position: "RB", points: 14 },
    { playerId: "rb3", position: "RB", points: 9 },
    { playerId: "wr1", position: "WR", points: 21 },
    { playerId: "wr2", position: "WR", points: 12 },
    { playerId: "wr3", position: "WR", points: 11 },
    { playerId: "te1", position: "TE", points: 8 },
  ];

  it("fills dedicated slots with the best players, flexes with leftovers", () => {
    const { lineup, maxPoints } = computeOptimalLineup(roster, [
      "QB",
      "RB",
      "RB",
      "WR",
      "WR",
      "TE",
      "FLEX",
      "SUPER_FLEX",
    ]);
    // QB25 + RB22 + RB14 + WR21 + WR12 + TE8 + FLEX(wr3 11) + SF(qb2 18)
    expect(maxPoints).toBe(25 + 22 + 14 + 21 + 12 + 8 + 11 + 18);
    const sfSlot = lineup.find((l) => l.slot === "SUPER_FLEX");
    expect(sfSlot?.player?.playerId).toBe("qb2"); // QB routed to superflex, not a dedicated slot
  });

  it("flex takes the best remaining RB/WR/TE regardless of position", () => {
    const { lineup } = computeOptimalLineup(roster, ["RB", "FLEX"]);
    expect(lineup[0]?.player?.playerId).toBe("rb1");
    expect(lineup[1]?.player?.playerId).toBe("wr1"); // 21 > rb2's 14
  });

  it("handles empty slots gracefully", () => {
    const { lineup, maxPoints } = computeOptimalLineup([], ["QB", "FLEX"]);
    expect(maxPoints).toBe(0);
    expect(lineup.every((l) => l.player === null)).toBe(true);
  });

  it("lineup efficiency is bounded to [0, 1]", () => {
    expect(lineupEfficiency(90, 100)).toBeCloseTo(0.9);
    expect(lineupEfficiency(120, 100)).toBe(1);
    expect(lineupEfficiency(50, 0)).toBe(0);
  });

  it("classifies postures across the tank-contend spectrum", () => {
    const tank = tankContendPosture({
      valuePercentile: 0.1,
      winNowShare: 0.2,
      winPct: 0.15,
      efficiency: 0.9,
    });
    const allIn = tankContendPosture({
      valuePercentile: 0.95,
      winNowShare: 0.8,
      winPct: 0.8,
      efficiency: 0.95,
    });
    expect(tank.window).toBe("REBUILD");
    expect(allIn.window).toBe("ALL_IN");
    expect(allIn.contendScore).toBeGreaterThan(tank.contendScore);
  });

  it("flags start/sit leaks for contenders with low efficiency", () => {
    const leaky = tankContendPosture({
      valuePercentile: 0.9,
      winNowShare: 0.7,
      winPct: 0.7,
      efficiency: 0.8,
    });
    expect(leaky.directives.some((d) => d.includes("efficiency"))).toBe(true);
  });

  it("startSitAdvice finds the swap set and projected gain", () => {
    const pool: ScoredPlayer[] = [
      { playerId: "rb1", position: "RB", points: 18 },
      { playerId: "rb2", position: "RB", points: 12 },
      { playerId: "rb3", position: "RB", points: 9 },
      { playerId: "wr1", position: "WR", points: 15 },
      { playerId: "wr2", position: "WR", points: 7 },
    ];
    // Currently starting the wrong RB (rb3 over rb2) in RB/RB/FLEX.
    const advice = startSitAdvice(pool, ["rb1", "rb3", "wr1"], ["RB", "RB", "FLEX"]);
    // Optimal: rb1 (18) + rb2 (12) + wr1 (15) = 45; current = 18 + 9 + 15 = 42.
    expect(advice.optimalPoints).toBe(45);
    expect(advice.currentPoints).toBe(42);
    expect(advice.gain).toBe(3);
    expect(advice.starts.map((p) => p.playerId)).toEqual(["rb2"]);
    expect(advice.sits.map((p) => p.playerId)).toEqual(["rb3"]);
    expect(advice.swaps).toEqual([
      {
        start: expect.objectContaining({ playerId: "rb2" }),
        sit: expect.objectContaining({ playerId: "rb3" }),
        delta: 3,
      },
    ]);
  });

  it("startSitAdvice pairs swaps same-position first", () => {
    const pool: ScoredPlayer[] = [
      { playerId: "qbGood", position: "QB", points: 20 },
      { playerId: "qbBad", position: "QB", points: 15 },
      { playerId: "rbGood", position: "RB", points: 12 },
      { playerId: "rbBad", position: "RB", points: 8 },
    ];
    // Both leaks at once: wrong QB and wrong RB started.
    const advice = startSitAdvice(pool, ["qbBad", "rbBad"], ["QB", "RB"]);
    expect(advice.gain).toBe(9);
    const byStart = new Map(advice.swaps.map((s) => [s.start.playerId, s]));
    expect(byStart.get("qbGood")?.sit.playerId).toBe("qbBad");
    expect(byStart.get("qbGood")?.delta).toBe(5);
    expect(byStart.get("rbGood")?.sit.playerId).toBe("rbBad");
    expect(byStart.get("rbGood")?.delta).toBe(4);
  });

  it("startSitAdvice reports zero gain for an already-optimal lineup", () => {
    const pool: ScoredPlayer[] = [
      { playerId: "qb1", position: "QB", points: 22 },
      { playerId: "qb2", position: "QB", points: 17 },
    ];
    const advice = startSitAdvice(pool, ["qb1"], ["QB"]);
    expect(advice.gain).toBe(0);
    expect(advice.starts).toHaveLength(0);
    expect(advice.sits).toHaveLength(0);
  });

  it("startSitAdvice ignores starter ids outside the pool (DEF/K slots)", () => {
    const pool: ScoredPlayer[] = [
      { playerId: "rb1", position: "RB", points: 14 },
    ];
    const advice = startSitAdvice(pool, ["rb1", "DEF_SF", "0"], ["RB"]);
    expect(advice.currentPoints).toBe(14);
    expect(advice.gain).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. PAR from live weekly scoring
// ---------------------------------------------------------------------------

describe("PAR engine", () => {
  it("aggregates weekly points into season stats, skipping zero weeks for PPG", () => {
    const stats = aggregateSeasonStats([
      { a: 20, b: 0, c: 8 },
      { a: 10, b: 15, c: 12 },
      { a: 0, b: 15 },
    ]);
    expect(stats.get("a")).toEqual({ totalPoints: 30, games: 2, ppg: 15 });
    expect(stats.get("b")).toEqual({ totalPoints: 30, games: 2, ppg: 15 });
    expect(stats.get("c")).toEqual({ totalPoints: 20, games: 2, ppg: 10 });
  });

  it("derives starters per position from lineup slots including flexes", () => {
    const starters = startersPerPosition([
      "QB",
      "RB",
      "RB",
      "WR",
      "WR",
      "TE",
      "FLEX",
      "SUPER_FLEX",
    ]);
    expect(starters.QB).toBeCloseTo(1.8); // 1 + 0.8 SF share
    expect(starters.RB).toBeGreaterThan(2); // 2 + flex shares
    expect(starters.TE).toBeGreaterThan(1);
  });

  it("replacement ranks scale with league size and pad for churn", () => {
    const ranks12 = replacementRanks(["QB", "RB", "RB", "WR", "WR", "TE"], 12);
    const ranks10 = replacementRanks(["QB", "RB", "RB", "WR", "WR", "TE"], 10);
    expect(ranks12.RB).toBe(Math.ceil(2 * 12 * 1.25));
    expect(ranks12.RB).toBeGreaterThan(ranks10.RB);
    expect(ranks12.QB).toBeGreaterThanOrEqual(1);
  });

  it("replacement level is the frontier player's PPG and PAR is the excess", () => {
    // Three RBs at 20/12/6 ppg; replacement rank 2 → level = 12.
    const stats = aggregateSeasonStats([
      { rb1: 20, rb2: 12, rb3: 6 },
    ]);
    const positionOf = () => "RB" as const;
    const levels = replacementLevels(stats, positionOf, {
      QB: 1,
      RB: 2,
      WR: 1,
      TE: 1,
    });
    expect(levels.RB).toBe(12);
    const par = computeParMap(stats, positionOf, levels);
    expect(par.get("rb1")).toBe(8);
    expect(par.get("rb2")).toBe(0);
    expect(par.get("rb3")).toBe(-6); // below replacement stays negative
  });

  it("returns 0 replacement level when the position pool is thinner than the rank", () => {
    const stats = aggregateSeasonStats([{ te1: 9 }]);
    const levels = replacementLevels(stats, () => "TE" as const, {
      QB: 5,
      RB: 5,
      WR: 5,
      TE: 5,
    });
    expect(levels.TE).toBe(0);
  });
});
