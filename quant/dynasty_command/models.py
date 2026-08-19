"""Pydantic models validating every external payload the engine consumes."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

FANTASY_POSITIONS = {"QB", "RB", "WR", "TE", "K", "DEF"}

#: A per-game stat line keyed by Sleeper scoring keys (rec, rec_yd, pass_td, ...).
StatLine = dict[str, float]


class LeagueSettings(BaseModel):
    """Subset of Sleeper league metadata the engine needs (Source A)."""

    model_config = ConfigDict(extra="ignore")

    league_id: str
    name: str
    total_rosters: int = Field(ge=2)
    scoring_settings: dict[str, float]
    roster_positions: list[str]

    @property
    def is_superflex(self) -> bool:
        return "SUPER_FLEX" in self.roster_positions

    @property
    def is_ppr(self) -> bool:
        return self.scoring_settings.get("rec", 0.0) >= 0.5


class SleeperRoster(BaseModel):
    """One team's roster (Source A)."""

    model_config = ConfigDict(extra="ignore")

    roster_id: int
    owner_id: str | None = None
    players: list[str] = Field(default_factory=list)

    @field_validator("players", mode="before")
    @classmethod
    def _null_to_empty(cls, v):
        return v or []


class SleeperPlayer(BaseModel):
    """Trimmed player-dictionary entry (Source A)."""

    model_config = ConfigDict(extra="ignore")

    player_id: str
    full_name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    position: str | None = None
    team: str | None = None
    age: int | None = None

    @property
    def name(self) -> str:
        if self.full_name:
            return self.full_name
        return f"{self.first_name or ''} {self.last_name or ''}".strip() or self.player_id


class AdvancedStats(BaseModel):
    """Efficiency metrics from the `get_advanced_stats` interface (Source B)."""

    model_config = ConfigDict(extra="ignore")

    tprr: float = Field(alias="TPRR", ge=0, le=1)
    """Targets per route run."""
    epa_per_play: float = Field(alias="EPA_per_play", ge=-2, le=2)
    """Expected points added per play."""
    cpoe: float = Field(alias="CPOE", ge=-25, le=25)
    """Completion percentage over expected (QB-centric), in percentage points."""
    route_participation: float = Field(alias="Route_Participation", ge=0, le=1)
    """Share of team dropbacks the player ran a route on."""


class AdvancedStatsWindows(BaseModel):
    """Source B resolved into the two windows the model blends.

    `get_advanced_stats(player_id)` may return either a single snapshot
    (treated as the trailing-4-week window, with season assumed equal —
    zero trend) or a ``{"last4": ..., "season": ...}`` mapping.
    """

    last4: AdvancedStats
    season: AdvancedStats


class MarketQuote(BaseModel):
    """Consensus trade value from `get_market_value` (Source C)."""

    value: float = Field(ge=0)
