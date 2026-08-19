# dynasty_command (quant module)

Python analytics module computing the **Market Arbitrage Score** for every
rostered player in a Sleeper league. Mirrors the TypeScript app's modular
layout: `api/` (data sources) ↔ `lib/api`, `engine/` (pure math) ↔ `lib/math`.

## Model

```text
Arbitrage = Normalized_Model_EV − Market_Value

Normalized_Model_EV = 0.70 × efficiency(last 4 weeks)   [TPRR, EPA/play, CPOE, route %]
                    + 0.30 × season-long VORP           [league-scoring-normalized]
                    × Dynasty Health Filter             [RB > 26, WR > 28 penalty]
```

- Components are z-scored across the analyzed pool and rescaled onto the
  market-value distribution, so the subtraction is apples-to-apples.
- VORP scores both player and replacement baseline through the league's
  actual `scoring_settings` (fetched from Sleeper metadata) — PPR,
  standard, and TE-premium leagues rank differently by construction.
- When season stats are unavailable the EV blend renormalizes to
  efficiency-only rather than failing.

## Usage

```python
from dynasty_command.engine.report import generate_league_trade_report

# Your existing interfaces:
#   get_advanced_stats(player_id)  -> {"TPRR": .., "EPA_per_play": .., "CPOE": .., "Route_Participation": ..}
#                                     or {"last4": {...}, "season": {...}} for trend data
#   get_market_value(player_name)  -> consensus trade value (number)

report = generate_league_trade_report(
    league_id="1048178119665889280",
    get_advanced_stats=get_advanced_stats,
    get_market_value=get_market_value,
    # Optional, enables the 30% VORP leg:
    # get_season_stats=lambda pid: {...per-game stat line...},
    # get_baseline_stats=lambda pos: {...replacement stat line...},
)

df = report.frame          # pandas DataFrame, sorted by Arbitrage_Score desc
print(df.head(15))
for s in report.skipped:   # players with missing metrics — reported, never fatal
    print("skipped:", s.name, "—", s.reason)
```

Columns: `Player_Name, Position, Age, Team, Market_Value, Model_EV,
Arbitrage_Score, Efficiency_Trend (last-4 vs season delta),
Recommended_Action (Buy/Sell/Hold)`.

Lower-level entry points if you already have data assembled:
`generate_trade_report(inputs: list[PlayerAnalysisInput])`,
`calculate_vorp(player_stats, baseline_stats, scoring_settings)`.

## Guarantees

- **pydantic validation** on every external payload (Sleeper responses,
  advanced stats bounds, market quotes).
- **Robust error handling**: Sleeper calls retry with exponential backoff
  and raise typed `SleeperApiError`; per-player metric failures raise
  `MissingMetricsError`, are logged, and land in `report.skipped`.
- Tunables (blend weights, age thresholds/penalty, Buy/Sell z-thresholds,
  timeouts/retries) live in one validated `EngineConfig`.

## Develop

```bash
cd quant
pip install -e ".[dev]"
pytest            # 21 tests, no network required
```
