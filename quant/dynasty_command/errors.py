"""Typed errors so callers can distinguish transport failures from data gaps."""


class QuantError(Exception):
    """Base class for all dynasty_command quant errors."""


class SleeperApiError(QuantError):
    """Sleeper API failed after retries (timeout, 5xx, malformed payload)."""


class MissingMetricsError(QuantError):
    """A required per-player metric was unavailable from Source B/C."""

    def __init__(self, player_id: str, detail: str):
        self.player_id = player_id
        self.detail = detail
        super().__init__(f"{player_id}: {detail}")
