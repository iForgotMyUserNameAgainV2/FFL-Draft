"""Engine configuration — every tunable in one validated place."""

from pydantic import BaseModel, Field


class EngineConfig(BaseModel):
    """Weights, thresholds, and transport settings for the arbitrage engine."""

    # -- Normalized_Model_EV blend ------------------------------------------
    efficiency_weight: float = Field(0.70, ge=0, le=1)
    """Weight on the trailing-4-week efficiency component."""
    vorp_weight: float = Field(0.30, ge=0, le=1)
    """Weight on season-long historical VORP."""

    # -- Dynasty Health Filter ----------------------------------------------
    age_thresholds: dict[str, int] = Field(
        default_factory=lambda: {"RB": 26, "WR": 28}
    )
    """Age-Adjusted Threshold per position; above it the penalty applies."""
    age_penalty_per_year: float = Field(0.12, ge=0, le=1)
    """EV haircut per year past the threshold."""
    age_penalty_floor: float = Field(0.55, ge=0, le=1)
    """Penalty multiplier never drops below this."""

    # -- Action classification (z-scored on the market-value distribution) --
    buy_threshold_z: float = 0.35
    sell_threshold_z: float = -0.35

    # -- Transport ----------------------------------------------------------
    request_timeout_s: float = Field(10.0, gt=0)
    max_retries: int = Field(3, ge=0)
    retry_backoff_s: float = Field(1.5, gt=0)

    def model_post_init(self, __context) -> None:  # noqa: D105
        total = self.efficiency_weight + self.vorp_weight
        if abs(total - 1.0) > 1e-9:
            raise ValueError(
                f"efficiency_weight + vorp_weight must equal 1.0 (got {total})"
            )


DEFAULT_CONFIG = EngineConfig()
