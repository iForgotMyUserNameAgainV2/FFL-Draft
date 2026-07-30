/**
 * DYNASTY COMMAND — core domain model.
 *
 * All engines (MDI arbitrage, Weibull aging, pick liquidity, trade
 * matchmaking, Max-PF optimization) operate over these types.
 */

export type Position = "QB" | "RB" | "WR" | "TE";

export const POSITIONS: readonly Position[] = ["QB", "RB", "WR", "TE"] as const;

export function isPosition(value: string): value is Position {
  return (POSITIONS as readonly string[]).includes(value);
}

/** Lineup slots supported by the Max-PF optimizer. */
export type LineupSlot =
  | "QB"
  | "RB"
  | "WR"
  | "TE"
  | "FLEX" // RB/WR/TE
  | "SUPER_FLEX"; // QB/RB/WR/TE

export const FLEX_ELIGIBILITY: Record<LineupSlot, readonly Position[]> = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  FLEX: ["RB", "WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export interface PlayerAsset {
  kind: "player";
  /** Sleeper player id. */
  id: string;
  name: string;
  position: Position;
  team: string | null;
  age: number;
  /** Years of NFL experience. */
  yearsExp: number;
  /** Points Above Replacement over the trailing season (per-game basis). */
  par: number;
  /**
   * Contract / roster-security factor in [0, 1].
   * 1 = locked-in multi-year role, 0 = no contractual security.
   */
  contractFactor: number;
  /**
   * Draft capital score in [0, 1] derived from original NFL draft slot
   * (1.01 pick ≈ 1.0, UDFA ≈ 0.05). Persistent prior on talent.
   */
  draftCapital: number;
}

export interface PickAsset {
  kind: "pick";
  /** e.g. "2027-1" (season-round) plus original owner for uniqueness. */
  id: string;
  season: number;
  round: 1 | 2 | 3 | 4;
  /** Roster id of the original owner (Sleeper convention). */
  originalOwnerId: number;
  /** Projected slot within the round (1-12) if known, else null → mid-round. */
  projectedSlot: number | null;
}

export type DynastyAsset = PlayerAsset | PickAsset;

export function isPlayerAsset(asset: DynastyAsset): asset is PlayerAsset {
  return asset.kind === "player";
}

export function isPickAsset(asset: DynastyAsset): asset is PickAsset {
  return asset.kind === "pick";
}

// ---------------------------------------------------------------------------
// Market data
// ---------------------------------------------------------------------------

export type MarketSource = "fantasycalc" | "dynastydealer" | "consensus";

export interface MarketQuote {
  assetId: string;
  source: MarketSource;
  /** Normalized market value (FantasyCalc scale, roughly 0–12000). */
  value: number;
  /** 30-day trend, positive = rising. */
  trend30d: number;
  fetchedAt: string;
}

export interface ConsensusMarketValue {
  assetId: string;
  /** Weighted consensus across sources. */
  value: number;
  trend30d: number;
  sources: MarketQuote[];
}

// ---------------------------------------------------------------------------
// MDI (Market Disparity Index)
// ---------------------------------------------------------------------------

export type MdiSignal = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";

export interface MdiResult {
  asset: DynastyAsset;
  engineValue: number;
  marketValue: number;
  /** Position-adjusted std-dev of market values used as the denominator. */
  sigma: number;
  mdi: number;
  signal: MdiSignal;
}

// ---------------------------------------------------------------------------
// League / rosters
// ---------------------------------------------------------------------------

export interface LeagueSettings {
  leagueId: string;
  name: string;
  totalRosters: number;
  isSuperFlex: boolean;
  isPpr: boolean;
  isTePremium: boolean;
  lineupSlots: LineupSlot[];
  season: number;
  /** Current NFL week (0 during offseason). */
  week: number;
}

export interface TeamRoster {
  rosterId: number;
  ownerId: string;
  ownerName: string;
  players: PlayerAsset[];
  picks: PickAsset[];
  record: { wins: number; losses: number; ties: number };
  pointsFor: number;
  /** Maximum possible points-for with perfect lineups. */
  maxPointsFor: number;
}

export type CompetitiveWindow = "REBUILD" | "RETOOL" | "CONTEND" | "ALL_IN";

export interface TeamProfile {
  roster: TeamRoster;
  /** Total consensus market value of the roster + picks. */
  totalValue: number;
  /** Weibull-weighted "now vs later" split of roster value. */
  winNowValue: number;
  futureValue: number;
  window: CompetitiveWindow;
  /** Per-position starter-quality surplus (+) / deficit (-) scores. */
  positionalBalance: Record<Position, number>;
}

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

export interface TradeSide {
  rosterId: number;
  assets: DynastyAsset[];
  /** Consensus market value surrendered. */
  marketValue: number;
  /** Engine value surrendered. */
  engineValue: number;
  /** Change in need-weighted utility for this team if the trade executes. */
  utilityDelta: number;
}

export interface TradeProposal {
  id: string;
  sideA: TradeSide;
  sideB: TradeSide;
  /** Synergy score M_{A,B} from the matchmaker. */
  synergy: number;
  /** P(both managers perceive the trade as a win), in [0, 1]. */
  winWinProbability: number;
  rationale: string;
}

// ---------------------------------------------------------------------------
// League calendar / liquidity
// ---------------------------------------------------------------------------

export type LeaguePhase =
  | "POSTSEASON" // Jan–Feb: playoffs / championship hangover
  | "PRE_DRAFT" // Mar–Apr: ramp into rookie draft
  | "ROOKIE_DRAFT" // May–Jun: peak pick liquidity
  | "SUMMER" // Jul–Aug: camp optimism
  | "IN_SEASON" // Sep–Dec (weeks 1–14): win-now cash discount on picks
  | "FANTASY_PLAYOFFS"; // Weeks 15–17

// ---------------------------------------------------------------------------
// Sleeper API raw shapes (subset we consume)
// ---------------------------------------------------------------------------

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: Record<string, number>;
  /** Prior season's league in the dynasty lineage (null for year one). */
  previous_league_id: string | null;
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  players: string[] | null;
  starters: string[] | null;
  players_points: Record<string, number> | null;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  players: string[] | null;
  starters: string[] | null;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal?: number;
    ppts?: number;
    ppts_decimal?: number;
  };
}

export interface SleeperUser {
  user_id: string;
  display_name: string;
  metadata?: { team_name?: string };
  avatar: string | null;
}

export interface SleeperPlayer {
  player_id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string | null;
  age?: number | null;
  years_exp?: number | null;
  depth_chart_order?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface SleeperTradedPick {
  season: string;
  round: number;
  roster_id: number; // original owner
  owner_id: number; // current owner
  previous_owner_id: number;
}

export interface SleeperNflState {
  week: number;
  season_type: "pre" | "regular" | "post" | "off";
  season: string;
}
