"""Unit tests for the Market Arbitrage Score engine (pure logic, no network)."""

import pytest
from pydantic import ValidationError

from dynasty_command.config import EngineConfig
from dynasty_command.engine.arbitrage import (
    age_penalty_multiplier,
    classify_action,
    efficiency_composite,
    zscores,
)
from dynasty_command.engine.report import (
    PlayerAnalysisInput,
    REPORT_COLUMNS,
    generate_trade_report,
)
from dynasty_command.engine.scoring import calculate_vorp, score_stat_line
from dynasty_command.api.providers import resolve_advanced_stats, resolve_market_value
from dynasty_command.errors import MissingMetricsError
from dynasty_command.models import AdvancedStats, AdvancedStatsWindows

CONFIG = EngineConfig()

PPR_SCORING = {"rec": 1.0, "rec_yd": 0.1, "rec_td": 6.0, "rush_yd": 0.1, "rush_td": 6.0}
STANDARD_SCORING = {"rec": 0.0, "rec_yd": 0.1, "rec_td": 6.0, "rush_yd": 0.1, "rush_td": 6.0}


def stats(tprr=0.20, epa=0.10, cpoe=0.0, routes=0.80) -> AdvancedStats:
    return AdvancedStats(
        TPRR=tprr, EPA_per_play=epa, CPOE=cpoe, Route_Participation=routes
    )


def windows(last4: AdvancedStats, season: AdvancedStats | None = None) -> AdvancedStatsWindows:
    return AdvancedStatsWindows(last4=last4, season=season or last4)


def player_input(
    pid: str,
    *,
    name: str | None = None,
    position: str = "WR",
    age: int = 24,
    market: float = 5000,
    last4: AdvancedStats | None = None,
    season: AdvancedStats | None = None,
    vorp: float | None = 3.0,
) -> PlayerAnalysisInput:
    base = last4 or stats()
    return PlayerAnalysisInput(
        player_id=pid,
        name=name or pid,
        position=position,
        age=age,
        team="DAL",
        stats=windows(base, season),
        market_value=market,
        season_vorp=vorp,
    )


# ---------------------------------------------------------------------------
# VORP: league-settings normalization
# ---------------------------------------------------------------------------


class TestVorp:
    RECEIVER = {"rec": 6.0, "rec_yd": 80.0, "rec_td": 0.5}
    BASELINE = {"rec": 3.0, "rec_yd": 35.0, "rec_td": 0.1}

    def test_scoring_uses_league_settings(self):
        assert score_stat_line(self.RECEIVER, PPR_SCORING) == pytest.approx(
            6 * 1.0 + 80 * 0.1 + 0.5 * 6.0
        )

    def test_unknown_stats_are_ignored(self):
        line = {"rec": 2.0, "made_up_stat": 99.0}
        assert score_stat_line(line, PPR_SCORING) == pytest.approx(2.0)

    def test_ppr_vorp_exceeds_standard_for_target_hogs(self):
        ppr = calculate_vorp(self.RECEIVER, self.BASELINE, PPR_SCORING)
        standard = calculate_vorp(self.RECEIVER, self.BASELINE, STANDARD_SCORING)
        # The 3 extra receptions/game are worth exactly 3 more VORP in PPR.
        assert ppr - standard == pytest.approx(3.0)

    def test_below_replacement_is_negative(self):
        assert calculate_vorp(self.BASELINE, self.RECEIVER, PPR_SCORING) < 0


# ---------------------------------------------------------------------------
# Dynasty Health Filter
# ---------------------------------------------------------------------------


class TestAgePenalty:
    def test_thresholds_from_spec(self):
        assert age_penalty_multiplier("RB", 26, CONFIG) == 1.0  # at threshold: no hit
        assert age_penalty_multiplier("RB", 27, CONFIG) < 1.0  # RB > 26 penalized
        assert age_penalty_multiplier("WR", 28, CONFIG) == 1.0
        assert age_penalty_multiplier("WR", 29, CONFIG) < 1.0

    def test_penalty_is_graduated_and_floored(self):
        one_over = age_penalty_multiplier("RB", 27, CONFIG)
        three_over = age_penalty_multiplier("RB", 29, CONFIG)
        way_over = age_penalty_multiplier("RB", 40, CONFIG)
        assert three_over < one_over
        assert way_over == CONFIG.age_penalty_floor

    def test_unlisted_positions_and_unknown_age_pass_through(self):
        assert age_penalty_multiplier("QB", 38, CONFIG) == 1.0
        assert age_penalty_multiplier("RB", None, CONFIG) == 1.0


# ---------------------------------------------------------------------------
# Arbitrage math
# ---------------------------------------------------------------------------


class TestArbitrage:
    def test_zscores_center_and_degenerate_pools(self):
        z = zscores([1.0, 2.0, 3.0])
        assert z[1] == pytest.approx(0.0)
        assert z[0] < 0 < z[2]
        assert zscores([5.0]) == [0.0]
        assert zscores([2.0, 2.0, 2.0]) == [0.0, 0.0, 0.0]

    def test_efficiency_composite_weighs_by_position(self):
        cpoe_monster = stats(tprr=0.0, epa=0.0, cpoe=6.0, routes=0.0)
        # CPOE moves QBs, not WRs.
        assert efficiency_composite(cpoe_monster, "QB") > efficiency_composite(
            cpoe_monster, "WR"
        )

    def test_classify_action_thresholds(self):
        sigma = 1000.0
        assert classify_action(400.0, sigma, CONFIG) == "Buy"  # +0.4σ
        assert classify_action(-400.0, sigma, CONFIG) == "Sell"
        assert classify_action(100.0, sigma, CONFIG) == "Hold"


# ---------------------------------------------------------------------------
# Trade report
# ---------------------------------------------------------------------------


class TestTradeReport:
    def pool(self):
        elite = stats(tprr=0.30, epa=0.35, routes=0.95)
        good = stats(tprr=0.22, epa=0.15, routes=0.85)
        bad = stats(tprr=0.12, epa=-0.10, routes=0.55)
        return [
            # Elite efficiency priced like a mid player -> should top the board.
            player_input("cheap_stud", market=3000, last4=elite, vorp=6.0),
            player_input("fair_a", market=5000, last4=good, vorp=3.0),
            player_input("fair_b", market=5200, last4=good, vorp=3.2),
            # Weak efficiency at a premium price -> sell.
            player_input("priced_dud", market=9000, last4=bad, vorp=-1.0),
        ]

    def test_sorted_desc_with_required_columns(self):
        frame = generate_trade_report(self.pool(), CONFIG)
        for col in [
            "Player_Name",
            "Arbitrage_Score",
            "Efficiency_Trend",
            "Recommended_Action",
        ]:
            assert col in frame.columns
        assert list(frame.columns) == REPORT_COLUMNS
        scores = frame["Arbitrage_Score"].tolist()
        assert scores == sorted(scores, reverse=True)
        assert frame.iloc[0]["Player_Name"] == "cheap_stud"
        assert frame.iloc[0]["Recommended_Action"] == "Buy"
        assert frame.iloc[-1]["Player_Name"] == "priced_dud"
        assert frame.iloc[-1]["Recommended_Action"] == "Sell"

    def test_efficiency_trend_is_last4_minus_season(self):
        surging = player_input(
            "surger",
            last4=stats(tprr=0.30, epa=0.30, routes=0.95),
            season=stats(tprr=0.18, epa=0.05, routes=0.75),
        )
        frame = generate_trade_report([surging, *self.pool()], CONFIG)
        row = frame[frame["Player_Name"] == "surger"].iloc[0]
        assert row["Efficiency_Trend"] > 0
        flat = frame[frame["Player_Name"] == "fair_a"].iloc[0]
        assert flat["Efficiency_Trend"] == pytest.approx(0.0)

    def test_age_penalty_flows_into_model_ev(self):
        young = player_input("young_rb", position="RB", age=23, market=5000)
        old = player_input("old_rb", position="RB", age=29, market=5000)
        frame = generate_trade_report([young, old, *self.pool()], CONFIG)
        ev = dict(zip(frame["Player_Name"], frame["Model_EV"]))
        assert ev["old_rb"] < ev["young_rb"]

    def test_missing_vorp_renormalizes_to_efficiency_only(self):
        no_vorp = player_input("no_vorp", vorp=None)
        frame = generate_trade_report([no_vorp, *self.pool()], CONFIG)
        assert "no_vorp" in set(frame["Player_Name"])  # still scored, not dropped

    def test_empty_pool_returns_empty_frame(self):
        frame = generate_trade_report([], CONFIG)
        assert frame.empty
        assert list(frame.columns) == REPORT_COLUMNS


# ---------------------------------------------------------------------------
# Provider adapters: validation + containment of external failures
# ---------------------------------------------------------------------------


class TestProviders:
    def test_single_snapshot_becomes_both_windows(self):
        resolved = resolve_advanced_stats(
            lambda pid: {"TPRR": 0.25, "EPA_per_play": 0.1, "CPOE": 1.0, "Route_Participation": 0.9},
            "p1",
        )
        assert resolved.last4 == resolved.season

    def test_windowed_payload_preserves_trend(self):
        resolved = resolve_advanced_stats(
            lambda pid: {
                "last4": {"TPRR": 0.30, "EPA_per_play": 0.2, "CPOE": 0.0, "Route_Participation": 0.9},
                "season": {"TPRR": 0.20, "EPA_per_play": 0.0, "CPOE": 0.0, "Route_Participation": 0.8},
            },
            "p1",
        )
        assert resolved.last4.tprr > resolved.season.tprr

    def test_invalid_metrics_raise_missing_metrics(self):
        with pytest.raises(MissingMetricsError):
            resolve_advanced_stats(lambda pid: {"TPRR": 5.0}, "p1")  # TPRR > 1 invalid
        with pytest.raises(MissingMetricsError):
            resolve_advanced_stats(lambda pid: None, "p1")

    def test_provider_exceptions_are_contained(self):
        def broken(pid):
            raise TimeoutError("upstream died")

        with pytest.raises(MissingMetricsError):
            resolve_advanced_stats(broken, "p1")
        with pytest.raises(MissingMetricsError):
            resolve_market_value(broken, "p1", "Some Player")

    def test_market_value_validation(self):
        assert resolve_market_value(lambda name: 4200, "p1", "A") == 4200.0
        with pytest.raises(MissingMetricsError):
            resolve_market_value(lambda name: -50, "p1", "A")
        with pytest.raises(MissingMetricsError):
            resolve_market_value(lambda name: "not a number", "p1", "A")

    def test_advanced_stats_model_validates_bounds(self):
        with pytest.raises(ValidationError):
            AdvancedStats(TPRR=0.2, EPA_per_play=9.9, CPOE=0.0, Route_Participation=0.5)
