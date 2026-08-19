"""Trade report orchestration: Sources A+B+C -> ranked arbitrage DataFrame."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from statistics import mean, stdev
from typing import Callable, Optional

import pandas as pd

from dynasty_command.api.providers import (
    AdvancedStatsProvider,
    MarketValueProvider,
    resolve_advanced_stats,
    resolve_market_value,
)
from dynasty_command.api.sleeper import SleeperClient
from dynasty_command.config import DEFAULT_CONFIG, EngineConfig
from dynasty_command.engine.arbitrage import (
    age_penalty_multiplier,
    classify_action,
    efficiency_composite,
    rescale_to_market,
    zscores,
)
from dynasty_command.engine.scoring import calculate_vorp
from dynasty_command.errors import MissingMetricsError
from dynasty_command.models import AdvancedStatsWindows, LeagueSettings, StatLine

logger = logging.getLogger(__name__)

#: `get_season_stats(player_id)` -> per-game stat line (or None).
SeasonStatsProvider = Callable[[str], Optional[StatLine]]
#: `get_baseline_stats(position)` -> replacement-level per-game stat line.
BaselineStatsProvider = Callable[[str], Optional[StatLine]]

REPORT_COLUMNS = [
    "Player_Name",
    "Position",
    "Age",
    "Team",
    "Market_Value",
    "Model_EV",
    "Arbitrage_Score",
    "Efficiency_Trend",
    "Recommended_Action",
]


@dataclass
class PlayerAnalysisInput:
    """Everything the engine needs about one player, sources already resolved."""

    player_id: str
    name: str
    position: str
    age: int | None
    team: str | None
    stats: AdvancedStatsWindows
    market_value: float
    #: Season-long VORP in league points/game; None when season stats are
    #: unavailable, in which case the EV blend renormalizes to efficiency only.
    season_vorp: float | None = None


@dataclass
class SkippedPlayer:
    player_id: str
    name: str
    reason: str


@dataclass
class TradeReport:
    """The DataFrame plus an honest account of who couldn't be scored."""

    frame: pd.DataFrame
    skipped: list[SkippedPlayer] = field(default_factory=list)


def generate_trade_report(
    inputs: list[PlayerAnalysisInput],
    config: EngineConfig = DEFAULT_CONFIG,
) -> pd.DataFrame:
    """Rank players by Arbitrage Score (descending).

    Pipeline per the spec:
      1. z-score the trailing-4-week efficiency composite and season VORP
         across the analyzed pool;
      2. rescale each component onto the market-value distribution;
      3. Normalized_Model_EV = 0.70 x efficiency + 0.30 x VORP
         (weights renormalize to efficiency-only when VORP is missing);
      4. apply the Dynasty Health Filter (RB > 26, WR > 28);
      5. Arbitrage = Normalized_Model_EV − Market_Value.
    """
    if not inputs:
        return pd.DataFrame(columns=REPORT_COLUMNS)

    market_values = [p.market_value for p in inputs]
    market_mean = mean(market_values)
    market_std = stdev(market_values) if len(market_values) > 1 else 0.0
    effective_std = market_std if market_std > 0 else max(market_mean, 1.0)

    eff_last4 = [efficiency_composite(p.stats.last4, p.position) for p in inputs]
    eff_season = [efficiency_composite(p.stats.season, p.position) for p in inputs]
    eff_z = zscores(eff_last4)

    # VORP z-scores over the players that have one; others carry None.
    vorp_players = [p for p in inputs if p.season_vorp is not None]
    vorp_z_list = zscores([p.season_vorp for p in vorp_players])  # type: ignore[arg-type]
    vorp_z = dict(zip((p.player_id for p in vorp_players), vorp_z_list))

    rows = []
    for i, p in enumerate(inputs):
        eff_component = rescale_to_market(eff_z[i], market_mean, effective_std)
        vz = vorp_z.get(p.player_id)
        if vz is not None:
            vorp_component = rescale_to_market(vz, market_mean, effective_std)
            model_ev = (
                config.efficiency_weight * eff_component
                + config.vorp_weight * vorp_component
            )
        else:
            model_ev = eff_component  # weights renormalized: efficiency-only

        model_ev *= age_penalty_multiplier(p.position, p.age, config)
        arbitrage = model_ev - p.market_value

        rows.append(
            {
                "Player_Name": p.name,
                "Position": p.position,
                "Age": p.age,
                "Team": p.team,
                "Market_Value": round(p.market_value, 1),
                "Model_EV": round(model_ev, 1),
                "Arbitrage_Score": round(arbitrage, 1),
                "Efficiency_Trend": round(eff_last4[i] - eff_season[i], 3),
                "Recommended_Action": classify_action(arbitrage, effective_std, config),
            }
        )

    frame = pd.DataFrame(rows, columns=REPORT_COLUMNS)
    return frame.sort_values("Arbitrage_Score", ascending=False, ignore_index=True)


def build_inputs_from_sleeper(
    league_id: str,
    get_advanced_stats: AdvancedStatsProvider,
    get_market_value: MarketValueProvider,
    *,
    get_season_stats: SeasonStatsProvider | None = None,
    get_baseline_stats: BaselineStatsProvider | None = None,
    sleeper: SleeperClient | None = None,
    config: EngineConfig = DEFAULT_CONFIG,
    positions: frozenset[str] = frozenset({"QB", "RB", "WR", "TE"}),
) -> tuple[list[PlayerAnalysisInput], list[SkippedPlayer], LeagueSettings]:
    """Assemble analysis inputs for every rostered player in a league.

    Source A (Sleeper) provides league settings + rosters + identities;
    Sources B/C provide efficiency and market value per player. Players
    with missing metrics are skipped and reported, never fatal.

    ``get_season_stats(player_id)`` / ``get_baseline_stats(position)`` are
    optional stat-line providers feeding league-normalized VORP; without
    them the EV blend runs efficiency-only.
    """
    client = sleeper or SleeperClient(config)
    league = client.get_league(league_id)
    rosters = client.get_rosters(league_id)
    players = client.get_players()

    inputs: list[PlayerAnalysisInput] = []
    skipped: list[SkippedPlayer] = []

    for roster in rosters:
        for player_id in roster.players:
            meta = players.get(player_id)
            if meta is None or meta.position not in positions:
                continue
            try:
                stats = resolve_advanced_stats(get_advanced_stats, player_id)
                market_value = resolve_market_value(get_market_value, player_id, meta.name)
            except MissingMetricsError as exc:
                logger.warning("Skipping %s: %s", meta.name, exc.detail)
                skipped.append(SkippedPlayer(player_id, meta.name, exc.detail))
                continue

            season_vorp: float | None = None
            if get_season_stats is not None and get_baseline_stats is not None:
                try:
                    player_line = get_season_stats(player_id)
                    baseline_line = get_baseline_stats(meta.position)
                    if player_line is not None and baseline_line is not None:
                        season_vorp = calculate_vorp(
                            player_line, baseline_line, league.scoring_settings
                        )
                except Exception as exc:  # stats providers are external
                    logger.warning("VORP unavailable for %s: %s", meta.name, exc)

            inputs.append(
                PlayerAnalysisInput(
                    player_id=player_id,
                    name=meta.name,
                    position=meta.position or "WR",
                    age=meta.age,
                    team=meta.team,
                    stats=stats,
                    market_value=market_value,
                    season_vorp=season_vorp,
                )
            )

    return inputs, skipped, league


def generate_league_trade_report(
    league_id: str,
    get_advanced_stats: AdvancedStatsProvider,
    get_market_value: MarketValueProvider,
    **kwargs,
) -> TradeReport:
    """One-call convenience: Sleeper league -> ranked arbitrage report."""
    config = kwargs.pop("config", DEFAULT_CONFIG)
    inputs, skipped, _league = build_inputs_from_sleeper(
        league_id, get_advanced_stats, get_market_value, config=config, **kwargs
    )
    return TradeReport(frame=generate_trade_report(inputs, config), skipped=skipped)
