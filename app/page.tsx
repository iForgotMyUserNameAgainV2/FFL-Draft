import { Activity, Radar, Scale, TrendingUp, Trophy } from "lucide-react";
import { SleeperSync } from "@/components/sleeper-sync";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const ENGINES = [
  {
    icon: TrendingUp,
    title: "MDI Arbitrage",
    description:
      "Market Disparity Index — a position-adjusted z-score between structural engine value and live consensus market price.",
  },
  {
    icon: Radar,
    title: "Weibull Aging Model",
    description:
      "S(t) = exp(−(t/η)^β) positional hazard curves: RB cliffs past 26, QBs stable through 33.",
  },
  {
    icon: Activity,
    title: "Pick Liquidity Engine",
    description:
      "Seasonal M(t) multipliers on rookie capital — 0.85× in-season cash discount, 1.25× draft-month premium.",
  },
  {
    icon: Scale,
    title: "Trade Matchmaker",
    description:
      "Game-theoretic synergy matrices pair your surpluses with rival deficits and emit win-win proposals.",
  },
  {
    icon: Trophy,
    title: "Tank / Contend Optimizer",
    description:
      "Max-PF lineup efficiency plus value percentile → an explicit REBUILD → ALL-IN posture with directives.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-12 px-6 py-16">
      <div className="text-center">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-accent">
          Institutional-grade dynasty intelligence
        </p>
        <h1 className="text-5xl font-black tracking-tight">
          DYNASTY <span className="text-accent">COMMAND</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-ink-secondary">
          A game-theoretic trading desk for Sleeper dynasty leagues: price every
          player and pick, exploit market disparities, and out-negotiate eleven
          rival portfolio managers.
        </p>
      </div>

      <SleeperSync />

      <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ENGINES.map(({ icon: Icon, title, description }) => (
          <Card key={title}>
            <CardHeader className="pb-2">
              <Icon className="size-5 text-accent" aria-hidden />
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <CardDescription className="leading-relaxed">{description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
