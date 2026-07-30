"use client";

import { useParams } from "next/navigation";
import { Banknote, CalendarClock, Handshake } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { LeagueOverview } from "@/components/league-overview";
import { AgingRadarChart, SurvivalCurvesChart } from "@/components/aging-radar-chart";
import { useLeagueAnalytics } from "@/lib/hooks";
import { useMyRosterId } from "@/lib/store";
import { PHASE_MULTIPLIERS } from "@/lib/math/liquidity";
import { formatValue } from "@/lib/utils";

export default function DashboardPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { data, isLoading, error } = useLeagueAnalytics(leagueId ?? null);
  const myRosterId = useMyRosterId(leagueId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-2/3" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
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
    <div className="space-y-8">
      <PageHeader
        eyebrow="Command dashboard"
        title={data.settings.name}
        description={`${data.settings.totalRosters}-team ${
          data.settings.isSuperFlex ? "superflex" : "1QB"
        } · ${data.settings.isPpr ? "PPR" : "non-PPR"} · ${data.settings.season} season`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          icon={CalendarClock}
          label="League phase"
          value={data.phase.replace("_", " ")}
          detail={
            <>
              Pick multiplier{" "}
              <span className="font-mono text-ink-secondary">
                M(t) = {pickMultiplier.toFixed(2)}×
              </span>{" "}
              — {pickMultiplier > 1 ? "picks trading rich" : "picks at a discount"}
            </>
          }
        />
        <StatTile
          icon={Banknote}
          label="Total market cap"
          value={<span className="font-mono">{formatValue(totalMarket)}</span>}
          detail="Consensus value across all rosters and picks"
        />
        <StatTile
          icon={Handshake}
          label="Live proposals"
          value={<span className="font-mono">{data.proposals.length}</span>}
          detail="Win-win trades cleared by the matchmaker"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>League portfolio table</CardTitle>
          <CardDescription>
            Asset values, Weibull win-now / future splits, and competitive windows.
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
