import { describe, expect, it } from "vitest";
import {
  buildSwotReport,
  gradeFromHealth,
  valuePercentile,
  type SwotInput,
  type SwotMdiEntry,
} from "@/lib/math/swot";
import type {
  PickAsset,
  PlayerAsset,
  Position,
  TeamProfile,
  TradeProposal,
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

type TeamOverrides = Omit<Partial<TeamProfile>, "roster" | "positionalBalance"> & {
  roster?: Partial<TeamProfile["roster"]>;
  positionalBalance?: Partial<Record<Position, number>>;
};

function teamProfile(
  rosterId: number,
  window: TeamProfile["window"],
  overrides: TeamOverrides = {},
): TeamProfile {
  const { roster, positionalBalance, ...rest } = overrides;
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
      maxPointsFor: 1080,
      ...roster,
    },
    totalValue: 30000,
    winNowValue: 15000,
    futureValue: 15000,
    window,
    positionalBalance: { QB: 0, RB: 0, WR: 0, TE: 0, ...positionalBalance },
    ...rest,
  };
}

function mdiEntry(
  asset: PlayerAsset | PickAsset,
  rosterId: number | null,
  overrides: Partial<SwotMdiEntry> = {},
): SwotMdiEntry {
  return {
    asset,
    mdi: 0,
    signal: "HOLD",
    marketValue: 2000,
    rosterId,
    ...overrides,
  };
}

function baseInput(team: TeamProfile, league: TeamProfile[]): SwotInput {
  return {
    team,
    league,
    mdi: team.roster.players.map((p) => mdiEntry(p, team.roster.rosterId)),
    waivers: [],
    proposals: [],
    phase: "SUMMER",
  };
}

// ---------------------------------------------------------------------------
// SWOT engine
// ---------------------------------------------------------------------------

describe("SWOT engine", () => {
  it("handles an empty roster without crashing", () => {
    const team = teamProfile(1, "RETOOL");
    const report = buildSwotReport(baseInput(team, [team]));
    expect(report.verdict).toContain("Team 1");
    expect(report.grade).toBeTruthy();
    expect(report.health).toBeGreaterThanOrEqual(0);
    expect(report.health).toBeLessThanOrEqual(1);
  });

  it("flags positional surpluses as strengths and deficits as weaknesses", () => {
    const wr = player({ id: "wr1", name: "Surplus Star", position: "WR" });
    const team = teamProfile(1, "CONTEND", {
      positionalBalance: { WR: 1.2, TE: -0.9 },
      roster: { players: [wr] },
    });
    const report = buildSwotReport(baseInput(team, [team, teamProfile(2, "REBUILD")]));

    const surplus = report.strengths.find((s) => s.title.includes("WR room is a surplus"));
    expect(surplus).toBeDefined();
    expect(surplus?.detail).toContain("Surplus Star");
    expect(
      report.weaknesses.some((w) => w.title.includes("TE room is a deficit")),
    ).toBe(true);
  });

  it("rates the asset base by league percentile", () => {
    const rich = teamProfile(1, "CONTEND", { totalValue: 60000 });
    const poor = teamProfile(2, "REBUILD", { totalValue: 10000 });
    const mid = teamProfile(3, "RETOOL", { totalValue: 30000 });

    const richReport = buildSwotReport(baseInput(rich, [rich, poor, mid]));
    expect(richReport.strengths.some((s) => s.title === "Elite asset base")).toBe(true);

    const poorReport = buildSwotReport(baseInput(poor, [rich, poor, mid]));
    expect(
      poorReport.weaknesses.some((w) => w.title === "Bottom-tier asset base"),
    ).toBe(true);
  });

  it("treats surplus first-round picks as a strength and pick poverty as a weakness", () => {
    const hoarder = teamProfile(1, "REBUILD", {
      roster: {
        picks: [
          pick({ id: "a", season: 2027, round: 1 }),
          pick({ id: "b", season: 2027, round: 1 }),
          pick({ id: "c", season: 2028, round: 1 }),
          pick({ id: "d", season: 2028, round: 1 }),
        ],
      },
    });
    const report = buildSwotReport(baseInput(hoarder, [hoarder]));
    expect(
      report.strengths.some((s) => s.title === "First-round pick war chest"),
    ).toBe(true);

    const broke = teamProfile(2, "CONTEND", {
      roster: {
        rosterId: 2,
        picks: [
          pick({ id: "e", season: 2027, round: 2 }),
          pick({ id: "f", season: 2028, round: 3 }),
        ],
      },
    });
    const brokeReport = buildSwotReport(baseInput(broke, [broke]));
    expect(
      brokeReport.weaknesses.some((w) => w.title === "Draft capital deficit"),
    ).toBe(true);
  });

  it("surfaces deficit-filling free agents as a priority opportunity", () => {
    const team = teamProfile(1, "CONTEND", {
      positionalBalance: { QB: -1 },
    });
    const input = baseInput(team, [team]);
    input.waivers = [
      {
        player: player({ id: "fa1", name: "Street QB", position: "QB" }),
        marketValue: 1200,
        trend30d: 100,
      },
    ];
    const report = buildSwotReport(input);
    const opp = report.opportunities.find((o) =>
      o.title.includes("Free agents cover a deficit"),
    );
    expect(opp).toBeDefined();
    expect(opp?.detail).toContain("Street QB");
  });

  it("turns rival BUY signals and own SELL signals into trade opportunities", () => {
    const mine = player({ id: "mine", name: "Overpriced Vet", position: "RB" });
    const team = teamProfile(1, "CONTEND", {
      roster: { players: [mine] },
    });
    const rivalPlayer = player({ id: "theirs", name: "Discount Ace", position: "WR" });
    const input = baseInput(team, [team, teamProfile(2, "REBUILD")]);
    input.mdi = [
      mdiEntry(mine, 1, { signal: "SELL", mdi: 1.4 }),
      mdiEntry(rivalPlayer, 2, { signal: "STRONG_BUY", mdi: -1.8 }),
    ];
    const report = buildSwotReport(input);

    const sellHigh = report.opportunities.find((o) =>
      o.title.includes("Sell-high window"),
    );
    expect(sellHigh?.detail).toContain("Overpriced Vet");
    const buyLow = report.opportunities.find((o) => o.title.includes("Buy-low"));
    expect(buyLow?.detail).toContain("Discount Ace");
  });

  it("reports matchmaker-cleared proposals involving the team", () => {
    const team = teamProfile(1, "CONTEND");
    const proposal: TradeProposal = {
      id: "t1",
      sideA: { rosterId: 1, assets: [], marketValue: 5000, engineValue: 5000, utilityDelta: 400 },
      sideB: { rosterId: 2, assets: [], marketValue: 5000, engineValue: 5000, utilityDelta: 350 },
      synergy: 0.6,
      winWinProbability: 0.74,
      rationale: "Team 1 sends depth for Team 2's starter.",
    };
    const input = baseInput(team, [team, teamProfile(2, "REBUILD")]);
    input.proposals = [proposal];
    const report = buildSwotReport(input);
    const opp = report.opportunities.find((o) => o.title.includes("matchmaker-cleared"));
    expect(opp).toBeDefined();
    expect(opp?.detail).toContain("74%");
  });

  it("flags calendar liquidity in the right direction per window", () => {
    const rebuilder = teamProfile(1, "REBUILD");
    const rookieDraft = buildSwotReport({
      ...baseInput(rebuilder, [rebuilder]),
      phase: "ROOKIE_DRAFT", // picks rich → seller's market for rebuilders
    });
    expect(
      rookieDraft.opportunities.some((o) => o.title.includes("Pick market is rich")),
    ).toBe(true);

    const contender = teamProfile(2, "ALL_IN");
    const inSeason = buildSwotReport({
      ...baseInput(contender, [contender]),
      phase: "IN_SEASON", // picks discounted → contender buys future cheap
    });
    expect(
      inSeason.opportunities.some((o) => o.title.includes("discount")),
    ).toBe(true);
  });

  it("detects the Weibull age cliff on valuable veterans as a threat", () => {
    const oldRb = player({ id: "rb1", name: "Cliff Runner", position: "RB", age: 30 });
    const team = teamProfile(1, "ALL_IN", {
      roster: { players: [oldRb] },
    });
    const input = baseInput(team, [team]);
    input.mdi = [mdiEntry(oldRb, 1, { marketValue: 4000 })];
    const report = buildSwotReport(input);
    const threat = report.threats.find((t) => t.title === "Weibull cliff exposure");
    expect(threat).toBeDefined();
    expect(threat?.detail).toContain("Cliff Runner");
  });

  it("flags value concentration in a single player", () => {
    const star = player({ id: "star", name: "Franchise Guy", position: "WR" });
    const depth = player({ id: "d1", name: "Depth Piece", position: "WR" });
    const team = teamProfile(1, "CONTEND", {
      roster: { players: [star, depth] },
    });
    const input = baseInput(team, [team]);
    input.mdi = [
      mdiEntry(star, 1, { marketValue: 9000 }),
      mdiEntry(depth, 1, { marketValue: 1000 }),
    ];
    const report = buildSwotReport(input);
    const threat = report.threats.find((t) => t.title === "Portfolio concentration risk");
    expect(threat).toBeDefined();
    expect(threat?.detail).toContain("Franchise Guy");
    expect(threat?.detail).toContain("90%");
  });

  it("frames the arms race relative to the team's window", () => {
    const me = teamProfile(1, "CONTEND", { totalValue: 30000 });
    const rival = teamProfile(2, "ALL_IN", { totalValue: 45000 });
    const report = buildSwotReport(baseInput(me, [me, rival]));
    expect(report.threats.some((t) => t.title.includes("out-own you"))).toBe(true);

    const rebuilder = teamProfile(3, "REBUILD", {
      totalValue: 20000,
      futureValue: 10000,
    });
    const rebuildReport = buildSwotReport(baseInput(rebuilder, [rebuilder, rival]));
    expect(
      rebuildReport.threats.some((t) => t.title === "Rebuild race is crowded"),
    ).toBe(true);
  });

  it("caps every quadrant and keeps items sorted by score", () => {
    const team = teamProfile(1, "REBUILD", {
      totalValue: 5000,
      positionalBalance: { QB: -1, RB: -1, WR: -1, TE: -1 },
      roster: {
        pointsFor: 700,
        maxPointsFor: 1000,
        picks: [pick({ id: "x", season: 2027, round: 2 })],
      },
    });
    const league = [team, teamProfile(2, "CONTEND", { totalValue: 50000 })];
    const report = buildSwotReport(baseInput(team, league));
    for (const quadrant of [
      report.strengths,
      report.weaknesses,
      report.opportunities,
      report.threats,
    ]) {
      expect(quadrant.length).toBeLessThanOrEqual(5);
      for (let i = 1; i < quadrant.length; i++) {
        expect(quadrant[i - 1]!.score).toBeGreaterThanOrEqual(quadrant[i]!.score);
      }
    }
    // A broke, unbalanced, inefficient roster autopsies badly.
    expect(report.weaknesses.length).toBeGreaterThanOrEqual(4);
    expect(["C", "D"]).toContain(report.grade);
  });

  it("keeps position acronyms capitalized and uses real ordinals in the verdict", () => {
    // 4-team league, one team below mine → 1/3 → 33rd percentile.
    const team = teamProfile(1, "RETOOL", {
      totalValue: 20000,
      positionalBalance: { WR: -1 },
    });
    const league = [
      team,
      teamProfile(2, "REBUILD", { totalValue: 10000 }),
      teamProfile(3, "CONTEND", { totalValue: 40000 }),
      teamProfile(4, "CONTEND", { totalValue: 50000 }),
    ];
    const report = buildSwotReport(baseInput(team, league));
    expect(report.verdict).toContain("33rd percentile");
    expect(report.verdict).toContain("WR room is a deficit");
    expect(report.verdict).not.toContain("wR");
  });

  it("summarizes the biggest edge and liability in the verdict", () => {
    const team = teamProfile(1, "CONTEND", {
      totalValue: 60000,
      positionalBalance: { WR: 1.5, TE: -1 },
    });
    const report = buildSwotReport(
      baseInput(team, [team, teamProfile(2, "REBUILD", { totalValue: 10000 })]),
    );
    expect(report.verdict).toContain("live contender");
    expect(report.verdict).toContain("Biggest edge:");
    expect(report.verdict).toContain("Biggest liability:");
  });
});

describe("SWOT helpers", () => {
  it("computes value percentile within the league", () => {
    const a = teamProfile(1, "CONTEND", { totalValue: 50000 });
    const b = teamProfile(2, "RETOOL", { totalValue: 30000 });
    const c = teamProfile(3, "REBUILD", { totalValue: 10000 });
    expect(valuePercentile(a, [a, b, c])).toBe(1);
    expect(valuePercentile(b, [a, b, c])).toBe(0.5);
    expect(valuePercentile(c, [a, b, c])).toBe(0);
    expect(valuePercentile(a, [a])).toBe(0.5);
  });

  it("maps composite health to letter grades monotonically", () => {
    expect(gradeFromHealth(0.9)).toBe("A+");
    expect(gradeFromHealth(0.7)).toBe("B+");
    expect(gradeFromHealth(0.5)).toBe("C+");
    expect(gradeFromHealth(0.1)).toBe("D");
    const grades = [0, 0.2, 0.4, 0.6, 0.8, 1].map(gradeFromHealth);
    expect(new Set(grades).size).toBeGreaterThan(3);
  });
});
