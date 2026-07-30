import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Radar,
  Scale,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { SleeperSync } from "@/components/sleeper-sync";
import { Card, CardContent } from "@/components/ui/card";

const ENGINES = [
  {
    icon: TrendingUp,
    title: "MDI Arbitrage",
    formula: "MDI = (V₍engine₎ − V₍market₎) / σ₍pos₎",
    description:
      "A position-adjusted z-score between structural engine value and live consensus market price surfaces every mispriced asset in the league.",
  },
  {
    icon: Radar,
    title: "Weibull Aging Model",
    formula: "S(t) = exp(−(t/η)^β)",
    description:
      "Positional hazard curves with per-position scale and shape: RBs cliff past 26 while QBs hold elite production through 33.",
  },
  {
    icon: Activity,
    title: "Pick Liquidity Engine",
    formula: "M(t): 0.85× → 1.25×",
    description:
      "Seasonal multipliers on rookie capital — in-season cash discounts, rookie-draft-month premiums, and future-year time decay.",
  },
  {
    icon: Scale,
    title: "Trade Matchmaker",
    formula: "M(A,B) = f(Need, Surplus, Windows)",
    description:
      "Game-theoretic synergy matrices pair your surpluses with rival deficits and emit multi-asset proposals with win-win probabilities.",
  },
  {
    icon: Trophy,
    title: "Tank / Contend Optimizer",
    formula: "PF / Max-PF → posture",
    description:
      "Optimal-lineup Max-PF and asset percentile collapse into an explicit REBUILD → ALL-IN posture with actionable directives.",
  },
];

export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      <main className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-14 px-6 py-20">
        {/* Hero */}
        <div className="text-center">
          <p className="microlabel mb-4 text-accent-bright">
            Institutional-grade dynasty intelligence
          </p>
          <h1 className="text-6xl font-black leading-none tracking-tighter sm:text-7xl">
            DYNASTY{" "}
            <span className="bg-gradient-to-br from-accent-bright via-accent to-[#1c5cab] bg-clip-text text-transparent">
              COMMAND
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ink-secondary">
            A game-theoretic trading desk for Sleeper dynasty leagues. Price
            every player and pick, exploit market disparities, and
            out-negotiate eleven rival portfolio managers.
          </p>
        </div>

        {/* Sync + demo */}
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          <SleeperSync />
          <div className="flex w-full items-center gap-3">
            <span className="h-px flex-1 bg-white/10" aria-hidden />
            <span className="text-[11px] uppercase tracking-widest text-ink-muted">or</span>
            <span className="h-px flex-1 bg-white/10" aria-hidden />
          </div>
          <Link
            href="/league/demo/dashboard"
            className="group inline-flex items-center gap-2 text-sm font-medium text-accent-bright transition-colors hover:text-ink-primary"
          >
            Explore the demo league
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </div>

        {/* Engines */}
        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ENGINES.map(({ icon: Icon, title, formula, description }) => (
            <Card
              key={title}
              className="group transition-colors hover:border-accent/30"
            >
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <span className="hairline flex size-9 items-center justify-center rounded-lg bg-accent/10">
                    <Icon className="size-4 text-accent-bright" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="font-mono text-[11px] text-ink-muted">{formula}</p>
                  </div>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
                  {description}
                </p>
              </CardContent>
            </Card>
          ))}
          <Card className="flex items-center justify-center border-dashed">
            <CardContent className="p-5 text-center">
              <p className="font-mono text-[11px] text-ink-muted">
                Sleeper · FantasyCalc · Dynasty Dealer
              </p>
              <p className="mt-1 text-[13px] text-ink-secondary">
                Live market consensus, refreshed hourly.
              </p>
            </CardContent>
          </Card>
        </div>

        <footer className="text-[11px] text-ink-muted">
          Not affiliated with Sleeper. Built for degenerate portfolio managers.
        </footer>
      </main>
    </div>
  );
}
