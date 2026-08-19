"""League-normalized scoring and VORP.

VORP here is *your league's* VORP: the same raw stat line scores
differently in PPR vs standard vs TE-premium, so both the player and the
replacement baseline are scored through the league's actual
``scoring_settings`` (fetched from Sleeper metadata) before subtracting.
"""

from __future__ import annotations

from dynasty_command.models import StatLine


def score_stat_line(stat_line: StatLine, scoring_settings: dict[str, float]) -> float:
    """Fantasy points for a per-game stat line under the league's scoring.

    Only stats the league actually scores contribute; unknown keys in the
    stat line are ignored, so callers can pass full stat dumps safely.
    """
    return sum(
        value * scoring_settings[stat]
        for stat, value in stat_line.items()
        if stat in scoring_settings
    )


def calculate_vorp(
    player_stats: StatLine,
    baseline_stats: StatLine,
    scoring_settings: dict[str, float],
) -> float:
    """Value Over Replacement Player, in league-scored points per game.

    ``baseline_stats`` is the per-game stat line of the replacement-level
    player at the same position (the best freely-available option). A
    negative VORP is meaningful — the player scores below what the waiver
    wire offers in this league's format.
    """
    return score_stat_line(player_stats, scoring_settings) - score_stat_line(
        baseline_stats, scoring_settings
    )
