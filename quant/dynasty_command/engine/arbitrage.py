"""Arbitrage engine.

    Arbitrage = Normalized_Model_EV − Market_Value

``Normalized_Model_EV`` blends two independently z-scored components —
70% trailing-4-week efficiency, 30% season-long league VORP — each
rescaled onto the market-value distribution so the subtraction is
apples-to-apples, then haircut by the Dynasty Health Filter for players
past their position's Age-Adjusted Threshold.
"""

from __future__ import annotations

from statistics import mean, stdev

from dynasty_command.config import EngineConfig
from dynasty_command.models import AdvancedStats

# Position-specific weights for the efficiency composite. CPOE is a QB
# metric; TPRR/route participation drive pass catchers; RBs split between
# EPA and receiving involvement.
_EFFICIENCY_WEIGHTS: dict[str, dict[str, float]] = {
    "QB": {"epa_per_play": 0.55, "cpoe": 0.35, "tprr": 0.0, "route_participation": 0.10},
    "RB": {"epa_per_play": 0.45, "cpoe": 0.0, "tprr": 0.25, "route_participation": 0.30},
    "WR": {"epa_per_play": 0.20, "cpoe": 0.0, "tprr": 0.45, "route_participation": 0.35},
    "TE": {"epa_per_play": 0.20, "cpoe": 0.0, "tprr": 0.45, "route_participation": 0.35},
}
_DEFAULT_WEIGHTS = _EFFICIENCY_WEIGHTS["WR"]

# Rough league-wide scale of each metric, used to put them on comparable
# footing before weighting (a 0.05 TPRR edge ≈ a 0.15 EPA edge).
_METRIC_SCALE = {"epa_per_play": 0.15, "cpoe": 3.0, "tprr": 0.05, "route_participation": 0.15}


def efficiency_composite(stats: AdvancedStats, position: str) -> float:
    """Collapse TPRR / EPA / CPOE / route participation into one score."""
    weights = _EFFICIENCY_WEIGHTS.get(position, _DEFAULT_WEIGHTS)
    return sum(
        weights[metric] * (getattr(stats, metric) / scale)
        for metric, scale in _METRIC_SCALE.items()
    )


def age_penalty_multiplier(position: str, age: int | None, config: EngineConfig) -> float:
    """Dynasty Health Filter: haircut EV past the Age-Adjusted Threshold.

    Graduated rather than a cliff — one year over the threshold hurts,
    three years over hurts a lot — floored so veterans never zero out.
    """
    if age is None:
        return 1.0
    threshold = config.age_thresholds.get(position)
    if threshold is None or age <= threshold:
        return 1.0
    years_over = age - threshold
    return max(
        config.age_penalty_floor, 1.0 - config.age_penalty_per_year * years_over
    )


def zscores(values: list[float]) -> list[float]:
    """Sample z-scores; a degenerate (constant or tiny) pool maps to zeros."""
    if len(values) < 2:
        return [0.0 for _ in values]
    mu = mean(values)
    sigma = stdev(values)
    if sigma == 0:
        return [0.0 for _ in values]
    return [(v - mu) / sigma for v in values]


def rescale_to_market(z: float, market_mean: float, market_std: float) -> float:
    """Map a component z-score onto the market-value scale (floored at 0)."""
    return max(0.0, market_mean + z * market_std)


def classify_action(arbitrage: float, market_std: float, config: EngineConfig) -> str:
    """Buy / Sell / Hold on the arbitrage score, z-scored vs market spread."""
    sigma = market_std if market_std > 0 else 1.0
    z = arbitrage / sigma
    if z >= config.buy_threshold_z:
        return "Buy"
    if z <= config.sell_threshold_z:
        return "Sell"
    return "Hold"
