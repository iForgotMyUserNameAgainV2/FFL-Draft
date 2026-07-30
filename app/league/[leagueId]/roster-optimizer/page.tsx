"use client";

import { useParams } from "next/navigation";
import { Crosshair, Gauge, Landmark, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, WINDOW_STYLES } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { MaxPfChart } from "@/components/max-pf-chart";
import { RosterTable } from "@/components/roster-table";
import {
  StartSitCard,
  TradeAnglesCard,
  WaiverTargetsCard,
} from "@/components/optimizer-suggestions";
import { ProposalList } from "@/components/trade-builder";
import { useLeagueAnalytics } from "@/lib/hooks";
import { useMyRosterId } from "@/lib/store";
import { lineupEfficiency, tankContendPosture } from "@/lib/math/max-pf";
import { formatPct, formatValue } from "@/lib/utils";

export default function RosterOptimizerPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { data, isLoading, error } = useLeagueAnalytics(leagueId ?? null);
  const myRosterId = useMyRosterId(leagueId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-2/3" />
        <div className="grid gap-4 sm:grid-cols-4">
          <Skeleton className="h-32" />
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
        Failed to load optimizer: {error instanceof Error ? error.message : "unknown error"}
      </p>
    );
  }

  const team =
    data.teams.find((t) => t.roster.rosterId === myRosterId) ?? data.teams[0];
  if (!team) return <p className="text-sm text-ink-muted">No rosters found.</p>;

  const { roster } = team;
  const sortedByValue = [...data.teams].sort((a, b) => b.totalValue - a.totalValue);
  const rankIdx = sortedByValue.findIndex(
    (t) => t.roster.rosterId === roster.rosterId,
  );
  const valuePercentile =
    data.teams.length > 1 ? 1 - rankIdx / (data.teams.length - 1) : 0.5;
  const games = roster.record.wins + roster.record.losses + roster.record.ties;
  const efficiency =
    roster.maxPointsFor > 0
      ? lineupEfficiency(roster.pointsFor, roster.maxPointsFor)
      : 1;
  const posture = tankContendPosture({
    valuePercentile,
    winNowShare: team.totalValue > 0 ? team.winNowValue / team.totalValue : 0.5,
    winPct: games > 0 ? roster.record.wins / games : 0.5,
    efficiency,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Win-your-league console"
        title="Roster Optimizer"
        description={
          myRosterId === null
            ? `Showing ${roster.ownerName} — pick your team in the header to lock focus.`
            : `Every lever for ${roster.ownerName}: lineup, waivers, and the trade market.`
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Crosshair}
          label="Posture"
          value={<Badge className={WINDOW_STYLES[posture.window]}>{posture.window}</Badge>}
          detail={`Contend score ${posture.contendScore.toFixed(2)}`}
        />
        <StatTile
          icon={Zap}
          label="Points for"
          value={<span className="font-mono">{roster.pointsFor.toFixed(1)}</span>}
          detail={`Max-PF ${roster.maxPointsFor.toFixed(1)}`}
        />
        <StatTile
          icon={Gauge}
          label="Lineup efficiency"
          value={
            <span className="font-mono">
              {roster.maxPointsFor > 0 ? formatPct(efficiency, 1) : "—"}
            </span>
          }
          detail="Actual PF ÷ maximum possible PF"
        />
        <StatTile
          icon={Landmark}
          label="Asset percentile"
          value={<span className="font-mono">{formatPct(valuePercentile)}</span>}
          detail={`Total value ${formatValue(team.totalValue)}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current roster</CardTitle>
          <CardDescription>
            {roster.ownerName} — every player with the engine&apos;s read: projected
            PPG, points above replacement, market value, and MDI signal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RosterTable team={team} mdi={data.mdi} />
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <StartSitCard team={team} analytics={data} />
        <WaiverTargetsCard team={team} analytics={data} />
      </div>

      <TradeAnglesCard team={team} analytics={data} />

      <section>
        <p className="microlabel mb-1 text-accent-bright">Matchmaker</p>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">
          Ready-made trades for {roster.ownerName}
        </h2>
        <ProposalList
          analytics={data}
          focusRosterId={team.roster.rosterId}
          limit={3}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Actual PF vs Max-PF by week</CardTitle>
          <CardDescription>
            {data.statsSeason
              ? `Weekly starter points against the optimal lineup, ${data.statsSeason} season. The gap is the start/sit leak.`
              : "Weekly scoring data unavailable — sync again once the season starts."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MaxPfChart weekly={data.weekly} rosterId={roster.rosterId} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Strategic directives</CardTitle>
            <CardDescription>
              Generated from value percentile, Weibull win-now share, record, and
              lineup efficiency.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-2 text-sm text-ink-secondary">
              {posture.directives.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Positional balance</CardTitle>
            <CardDescription>
              Startable surplus (+) or deficit (−) vs league baseline — routes the
              matchmaker&apos;s proposals.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {(Object.entries(team.positionalBalance) as Array<[string, number]>).map(
              ([pos, balance]) => (
                <div
                  key={pos}
                  className="hairline rounded-lg bg-surface-2 px-3 py-2 text-center"
                >
                  <p className="microlabel">{pos}</p>
                  <p className="mt-1 font-mono text-lg font-bold tabular-nums">
                    {balance >= 0 ? "+" : ""}
                    {balance.toFixed(2)}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {balance >= 0.5
                      ? "surplus — trade from"
                      : balance <= -0.5
                        ? "deficit — trade for"
                        : "balanced"}
                  </p>
                </div>
              ),
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
