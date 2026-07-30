"use client";

import { useParams } from "next/navigation";
import { Banknote, Hourglass, Ticket, Trophy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, WINDOW_STYLES } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { RosterTable } from "@/components/roster-table";
import { TeamSwot } from "@/components/team-swot";
import { useLeagueAnalytics } from "@/lib/hooks";
import { useMyRosterId } from "@/lib/store";
import { valuePercentile } from "@/lib/math/swot";
import { formatPct, formatValue } from "@/lib/utils";

export default function YourTeamPage() {
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
        Failed to load your team: {error instanceof Error ? error.message : "unknown error"}
      </p>
    );
  }

  const team =
    data.teams.find((t) => t.roster.rosterId === myRosterId) ?? data.teams[0];
  if (!team) return <p className="text-sm text-ink-muted">No rosters found.</p>;

  const { roster } = team;
  const record = `${roster.record.wins}-${roster.record.losses}${
    roster.record.ties > 0 ? `-${roster.record.ties}` : ""
  }`;
  const percentile = valuePercentile(team, data.teams);
  const winNowShare = team.totalValue > 0 ? team.winNowValue / team.totalValue : 0.5;

  // Draft capital grouped by season, tagging picks acquired from rivals.
  const ownerByRosterId = new Map(
    data.teams.map((t) => [t.roster.rosterId, t.roster.ownerName]),
  );
  const pickSeasons = [...new Set(roster.picks.map((p) => p.season))].sort();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Full autopsy"
        title="Your team"
        description={
          myRosterId === null
            ? `Showing ${roster.ownerName} — pick your team in the header to lock focus.`
            : `${roster.ownerName}, opened up on the table: roster, draft capital, and the complete SWOT read on where you stand.`
        }
        right={<Badge className={WINDOW_STYLES[team.window]}>{team.window}</Badge>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Trophy}
          label="Record"
          value={<span className="font-mono">{record}</span>}
          detail={`${roster.pointsFor.toFixed(1)} points for`}
        />
        <StatTile
          icon={Banknote}
          label="Portfolio value"
          value={<span className="font-mono">{formatValue(team.totalValue)}</span>}
          detail={`${formatPct(percentile)} percentile of the league`}
        />
        <StatTile
          icon={Hourglass}
          label="Win-now share"
          value={<span className="font-mono">{formatPct(winNowShare)}</span>}
          detail={`${formatValue(team.winNowValue)} now · ${formatValue(team.futureValue)} future`}
        />
        <StatTile
          icon={Ticket}
          label="Draft capital"
          value={
            <span className="font-mono">
              {roster.picks.filter((p) => p.round === 1).length} × 1st
            </span>
          }
          detail={`${roster.picks.length} picks over ${pickSeasons.length} seasons`}
        />
      </div>

      <TeamSwot team={team} analytics={data} />

      <Card>
        <CardHeader>
          <CardTitle>Full roster</CardTitle>
          <CardDescription>
            Every player on {roster.ownerName} with the engine&apos;s read: PPG,
            points above replacement, market value, and MDI signal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RosterTable team={team} mdi={data.mdi} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Draft capital</CardTitle>
          <CardDescription>
            Every future pick you control; picks acquired in trades show their
            original owner.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {roster.picks.length === 0 && (
            <p className="text-sm text-ink-muted">
              No future picks — the cupboard is bare.
            </p>
          )}
          {pickSeasons.map((season) => (
            <div key={season} className="flex flex-wrap items-center gap-2">
              <span className="microlabel w-12 shrink-0">{season}</span>
              {roster.picks
                .filter((p) => p.season === season)
                .sort(
                  (a, b) => a.round - b.round || a.originalOwnerId - b.originalOwnerId,
                )
                .map((p) => (
                  <Badge
                    key={p.id}
                    className={
                      p.originalOwnerId === roster.rosterId
                        ? "bg-surface-2 text-ink-secondary"
                        : "bg-accent/10 text-accent-bright border-accent/30"
                    }
                  >
                    R{p.round}
                    {p.originalOwnerId !== roster.rosterId &&
                      ` via ${ownerByRosterId.get(p.originalOwnerId) ?? `Roster ${p.originalOwnerId}`}`}
                  </Badge>
                ))}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
