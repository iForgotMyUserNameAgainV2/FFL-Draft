"use client";

import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LeagueOverview } from "@/components/league-overview";
import { AgingRadarChart, SurvivalCurvesChart } from "@/components/aging-radar-chart";
import { useLeagueAnalytics } from "@/lib/hooks";
import { useDynastyStore } from "@/lib/store";
import { PHASE_MULTIPLIERS } from "@/lib/math/liquidity";
import { formatValue } from "@/lib/utils";

export default function DashboardPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { data, isLoading, error } = useLeagueAnalytics(leagueId ?? null);
  const { myRosterId } = useDynastyStore();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <p className="text-sm text-status-critical">
        Failed to load league analytics: {error instanceof Error ? error.message : "unknown error"}
      </p>
    );
  }

  const myTeam =
    data.teams.find((t) => t.roster.rosterId === myRosterId) ?? data.teams[0];
  const totalMarket = data.teams.reduce((s, t) => s + t.totalValue, 0);
  const pickMultiplier = PHASE_MULTIPLIERS[data.phase];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{data.settings.name}</h1>
        <p className="mt-1 text-xs text-ink-muted">
          {data.settings.totalRosters} teams · {data.settings.isSuperFlex ? "Superflex" : "1QB"} ·{" "}
          {data.settings.isPpr ? "PPR" : "non-PPR"} · season {data.settings.season}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="League phase"
          value={data.phase.replace("_", " ")}
          detail={`Pick multiplier M(t) = ${pickMultiplier.toFixed(2)}×`}
        />
        <StatTile
          label="Total market cap"
          value={formatValue(totalMarket)}
          detail="Consensus value across all rosters and picks"
        />
        <StatTile
          label="Live proposals"
          value={String(data.proposals.length)}
          detail="Win-win trades found by the matchmaker"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>League portfolio table</CardTitle>
          <CardDescription>
            Asset values, Weibull win-now/future splits, and competitive windows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeagueOverview teams={data.teams} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Positional longevity radar</CardTitle>
            <CardDescription>
              {myTeam
                ? `Mean remaining elite years by position — ${myTeam.roster.ownerName} vs league mean.`
                : "Select a roster in the table above."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {myTeam && <AgingRadarChart team={myTeam} league={data.teams} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Weibull elite-survival curves</CardTitle>
            <CardDescription>
              S(t) = exp(−(t/η)^β) — probability of sustained elite production by age.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SurvivalCurvesChart />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-[11px] uppercase tracking-wider text-ink-muted">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        <p className="mt-1 text-xs text-ink-muted">{detail}</p>
      </CardContent>
    </Card>
  );
}
