# DYNASTY COMMAND

Institutional-grade, game-theoretic Sleeper dynasty football platform, trade
engine, and portfolio manager.

## Stack

- **Next.js 15** (App Router) · **React 19** · **TypeScript** (strict)
- **Tailwind CSS v4** · shadcn-style UI primitives · Lucide icons · Framer Motion
- **TanStack Query v5** (server cache) · **Zustand** (client state)
- **Recharts** (aging curves, radar profiles)
- **Vitest** (engine unit tests)

## Core engines (`lib/math/`)

| Engine | File | Model |
|---|---|---|
| Market Sentiment Arbitrage | `mdi.ts` | `MDI_i = (V_engine − V_market) / σ_position` — position-adjusted z-score over consensus values from FantasyCalc + Dynasty Dealer |
| Positional Hazard Aging | `weibull.ts` | `S(t) = exp(−(t/η)^β)` with position-specific scale/shape (RB cliff past 26, QB stable through 33) |
| Pick Liquidity & Volatility | `liquidity.ts` | Seasonal multiplier `M(t)`: 0.85× in-season cash discount → 1.25× rookie-draft premium, plus future-year discounting and slot skew |
| Trade Matchmaker | `trade-engine.ts` | Synergy matrix `M(A,B) = f(Need_A, Surplus_B, Window_A, Window_B)`, bundle enumeration, and logistic win-win probabilities |
| Tank vs. Contend Optimizer | `max-pf.ts` | Optimal-lineup Max-PF, lineup efficiency, and a contend score mapping to REBUILD / RETOOL / CONTEND / ALL-IN directives |
| Points Above Replacement | `par.ts` | Real weekly scoring → season PPG, positional replacement frontiers from the league's own lineup slots, PAR = PPG − replacement |

## App surface

- `/` — league sync (paste a Sleeper league ID)
- `/league/[leagueId]/dashboard` — portfolio table, longevity radar, survival curves
- `/league/[leagueId]/mdi-arbitrage` — league-wide buy/sell board sorted by |MDI|
- `/league/[leagueId]/trade-matrix` — synergy pairings, auto-proposals, manual builder
- `/league/[leagueId]/roster-optimizer` — Max-PF efficiency + strategic directives

## Data sources

- **Sleeper** — public read API (league, rosters, users, traded picks, players,
  weekly matchups). PAR uses live weekly scoring — the current season once ≥3
  weeks exist, otherwise the previous league in the dynasty lineage — and falls
  back to a rank-based estimate only when no scoring history exists.
- **FantasyCalc** — public crowd-sourced dynasty market values
- **Dynasty Dealer** — adapter with env-configurable endpoint
  (`DYNASTY_DEALER_API_URL`, `DYNASTY_DEALER_API_KEY`); falls back to a
  deterministic derived quote so the consensus layer always has two inputs

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # engine unit tests (Vitest)
npm run typecheck  # strict TS
npm run build      # production build
```
