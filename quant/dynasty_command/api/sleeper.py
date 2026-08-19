"""Source A: Sleeper read API client with retries, timeouts, and validation."""

from __future__ import annotations

import time

import requests
from pydantic import TypeAdapter, ValidationError

from dynasty_command.config import DEFAULT_CONFIG, EngineConfig
from dynasty_command.errors import SleeperApiError
from dynasty_command.models import (
    FANTASY_POSITIONS,
    LeagueSettings,
    SleeperPlayer,
    SleeperRoster,
)

BASE_URL = "https://api.sleeper.app/v1"

_ROSTERS_ADAPTER = TypeAdapter(list[SleeperRoster])


class SleeperClient:
    """Thin, validated client over Sleeper's public read API.

    Every call retries transient failures with exponential backoff and
    raises :class:`SleeperApiError` once retries are exhausted, so callers
    never see raw ``requests`` exceptions or unvalidated JSON.
    """

    def __init__(self, config: EngineConfig = DEFAULT_CONFIG, session: requests.Session | None = None):
        self._config = config
        self._session = session or requests.Session()

    # -- raw transport -------------------------------------------------------

    def _get(self, path: str):
        last_error: Exception | None = None
        for attempt in range(self._config.max_retries + 1):
            try:
                response = self._session.get(
                    f"{BASE_URL}{path}", timeout=self._config.request_timeout_s
                )
                if response.status_code >= 500:
                    raise SleeperApiError(f"Sleeper {response.status_code} for {path}")
                if response.status_code >= 400:
                    # 4xx is not transient — bad league id etc. Fail fast.
                    raise SleeperApiError(
                        f"Sleeper {response.status_code} for {path} (check the id)"
                    )
                return response.json()
            except SleeperApiError as exc:
                if "check the id" in str(exc):
                    raise
                last_error = exc
            except (requests.Timeout, requests.ConnectionError, ValueError) as exc:
                last_error = exc
            if attempt < self._config.max_retries:
                time.sleep(self._config.retry_backoff_s * (2**attempt))
        raise SleeperApiError(f"Sleeper API failed for {path}: {last_error}")

    # -- validated endpoints -------------------------------------------------

    def get_league(self, league_id: str) -> LeagueSettings:
        """League metadata including the scoring settings VORP normalizes on."""
        payload = self._get(f"/league/{league_id}")
        try:
            return LeagueSettings.model_validate(payload)
        except ValidationError as exc:
            raise SleeperApiError(f"Unexpected league payload: {exc}") from exc

    def get_rosters(self, league_id: str) -> list[SleeperRoster]:
        payload = self._get(f"/league/{league_id}/rosters")
        try:
            return _ROSTERS_ADAPTER.validate_python(payload)
        except ValidationError as exc:
            raise SleeperApiError(f"Unexpected rosters payload: {exc}") from exc

    def get_players(self) -> dict[str, SleeperPlayer]:
        """Full NFL player dictionary trimmed to fantasy positions.

        ~5MB payload; Sleeper asks for at most one call per day — cache the
        result if you call this in a loop.
        """
        payload = self._get("/players/nfl")
        if not isinstance(payload, dict):
            raise SleeperApiError("Unexpected players payload: not a mapping")
        players: dict[str, SleeperPlayer] = {}
        for player_id, raw in payload.items():
            try:
                player = SleeperPlayer.model_validate({**raw, "player_id": player_id})
            except (ValidationError, TypeError):
                continue  # skip malformed entries rather than failing the batch
            if player.position in FANTASY_POSITIONS:
                players[player_id] = player
        return players
