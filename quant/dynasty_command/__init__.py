"""DYNASTY COMMAND quant module.

Market Arbitrage Score engine: Sleeper league data (Source A) + advanced
efficiency metrics (Source B) + consensus market values (Source C)
-> league-normalized VORP -> weighted model EV -> arbitrage report.

Mirrors the TypeScript app's modular layout:
    api/     <-> lib/api    (data sources)
    engine/  <-> lib/math   (pure computation)
"""

from dynasty_command.config import EngineConfig
from dynasty_command.engine.report import generate_trade_report, PlayerAnalysisInput
from dynasty_command.engine.scoring import calculate_vorp, score_stat_line

__all__ = [
    "EngineConfig",
    "PlayerAnalysisInput",
    "calculate_vorp",
    "generate_trade_report",
    "score_stat_line",
]
