"""Sources B and C: adapters over the interfaces assumed to exist.

The engine never calls ``get_advanced_stats`` / ``get_market_value``
directly — it calls these resolvers, which validate whatever shape the
interfaces return and convert failures into :class:`MissingMetricsError`
so one broken player never sinks the whole report.
"""

from __future__ import annotations

from typing import Any, Protocol

from pydantic import ValidationError

from dynasty_command.errors import MissingMetricsError
from dynasty_command.models import AdvancedStats, AdvancedStatsWindows, MarketQuote


class AdvancedStatsProvider(Protocol):
    """`get_advanced_stats(player_id)` -> TPRR / EPA_per_play / CPOE / Route_Participation."""

    def __call__(self, player_id: str) -> Any: ...


class MarketValueProvider(Protocol):
    """`get_market_value(player_name)` -> current consensus trade value."""

    def __call__(self, player_name: str) -> Any: ...


def resolve_advanced_stats(
    get_advanced_stats: AdvancedStatsProvider, player_id: str
) -> AdvancedStatsWindows:
    """Call Source B and normalize its result into last-4 / season windows.

    Accepts either a single stats mapping (used for both windows — zero
    efficiency trend) or ``{"last4": {...}, "season": {...}}``.
    """
    try:
        raw = get_advanced_stats(player_id)
    except Exception as exc:  # the interface is external — contain it
        raise MissingMetricsError(player_id, f"advanced stats unavailable: {exc}") from exc
    if raw is None:
        raise MissingMetricsError(player_id, "advanced stats returned None")

    payload = raw if isinstance(raw, dict) else _as_dict(raw)
    try:
        if "last4" in payload or "season" in payload:
            last4 = payload.get("last4") or payload.get("season")
            season = payload.get("season") or payload.get("last4")
            return AdvancedStatsWindows(
                last4=AdvancedStats.model_validate(_as_dict(last4)),
                season=AdvancedStats.model_validate(_as_dict(season)),
            )
        snapshot = AdvancedStats.model_validate(payload)
        return AdvancedStatsWindows(last4=snapshot, season=snapshot)
    except ValidationError as exc:
        raise MissingMetricsError(player_id, f"invalid advanced stats: {exc}") from exc


def resolve_market_value(
    get_market_value: MarketValueProvider, player_id: str, player_name: str
) -> float:
    """Call Source C and validate the quote."""
    try:
        raw = get_market_value(player_name)
    except Exception as exc:
        raise MissingMetricsError(player_id, f"market value unavailable: {exc}") from exc
    if raw is None:
        raise MissingMetricsError(player_id, "market value returned None")
    try:
        return MarketQuote(value=float(raw)).value
    except (ValidationError, TypeError, ValueError) as exc:
        raise MissingMetricsError(player_id, f"invalid market value {raw!r}") from exc


def _as_dict(obj: Any) -> dict:
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "model_dump"):
        return obj.model_dump(by_alias=True)
    if hasattr(obj, "_asdict"):
        return obj._asdict()
    if hasattr(obj, "__dict__"):
        return dict(obj.__dict__)
    raise MissingMetricsError("<unknown>", f"cannot interpret stats object {type(obj)}")
