"use client";

import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, WINDOW_STYLES } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MaxPfChart } from "@/components/max-pf-chart";
import { useLeagueAnalytics } from "@/lib/hooks";
import { useDynastyStore } from "@/lib/store";
import { lineupEfficiency, tankContendPosture } from "@/lib/math/max-pf";
import { formatPct, formatValue } from "@/lib/utils";

export default function RosterOptimizerPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { data, isLoading, error } = useLeagueAnalytics(leagueId ?? null);
  const { myRosterId, setMyRoster } = useDynastyStore();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tank vs. Contend Optimizer</h1>
          <p className="mt-1 text-xs text-ink-muted">
            Max-PF efficiency and asset positioning for {roster.ownerName}.
          </p>
        </div>
        <select
          aria-label="Select roster"
          className="h-9 rounded-lg border border-white/15 bg-surface-2 px-2 text-sm"
          value={roster.rosterId}
          onChange={(e) => setMyRoster(Number(e.target.value))}
        >
          {data.teams.map((t) => (
            <option key={t.roster.rosterId} value={t.roster.rosterId}>
              {t.roster.ownerName}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Posture" value={<Badge className={WINDOW_STYLES[posture.window]}>{posture.window}</Badge>} detail={`Contend score ${posture.contendScore.toFixed(2)}`} />
        <Tile label="Points for" value={roster.pointsFor.toFixed(1)} detail={`Max-PF ${roster.maxPointsFor.toFixed(1)}`} />
        <Tile
          label="Lineup efficiency"
          value={roster.maxPointsFor > 0 ? formatPct(efficiency, 1) : "—"}
          detail="Actual PF ÷ maximum possible PF"
        />
        <Tile
          label="Asset percentile"
          value={formatPct(valuePercentile)}
          detail={`Total value ${formatValue(team.totalValue)}`}
        />
      </div>

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
            Startable-player surplus (+) or deficit (−) vs league baseline — the
            inputs the trade matchmaker uses to route proposals.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          {(Object.entries(team.positionalBalance) as Array<[string, number]>).map(
            ([pos, balance]) => (
              <div
                key={pos}
                className="rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-center"
              >
                <p className="text-[11px] uppercase tracking-wider text-ink-muted">{pos}</p>
                <p className="mt-1 font-mono text-lg font-bold tabular-nums">
                  {balance >= 0 ? "+" : ""}
                  {balance.toFixed(2)}
                </p>
                <p className="text-[11px] text-ink-muted">
                  {balance >= 0.5 ? "surplus — trade from" : balance <= -0.5 ? "deficit — trade for" : "balanced"}
                </p>
              </div>
            ),
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-[11px] uppercase tracking-wider text-ink-muted">{label}</p>
        <div className="mt-1 text-2xl font-bold">{value}</div>
        <p className="mt-1 text-xs text-ink-muted">{detail}</p>
      </CardContent>
    </Card>
  );
}
