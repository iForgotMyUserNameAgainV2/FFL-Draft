"use client";

import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ProposalList, TradeBuilder } from "@/components/trade-builder";
import { useLeagueAnalytics } from "@/lib/hooks";
import { useMyRosterId } from "@/lib/store";

export default function TradeMatrixPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { data, isLoading, error } = useLeagueAnalytics(leagueId ?? null);
  const myRosterId = useMyRosterId(leagueId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <p className="text-sm text-status-critical">
        Failed to load trade matrix: {error instanceof Error ? error.message : "unknown error"}
      </p>
    );
  }

  const teamName = (rosterId: number) =>
    data.teams.find((t) => t.roster.rosterId === rosterId)?.roster.ownerName ??
    `Roster ${rosterId}`;
  // With a team selected, surface that team's best matchups first.
  const mySynergy =
    myRosterId === null
      ? []
      : data.synergy.filter(
          (c) => c.rosterIdA === myRosterId || c.rosterIdB === myRosterId,
        );
  const topSynergy = (mySynergy.length > 0 ? mySynergy : data.synergy).slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Game-theoretic matchmaking"
        title="Trade Matrix"
        description="Pairwise synergy M(A,B) = f(Need, Surplus, Windows) across all rosters. High-synergy pairs feed the proposal generator below."
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {myRosterId !== null && mySynergy.length > 0
              ? `Best trade partners for ${teamName(myRosterId)}`
              : "Highest-synergy pairings"}
          </CardTitle>
          <CardDescription>
            Complementary needs and divergent competitive windows.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {topSynergy.map((cell) => (
            <div
              key={`${cell.rosterIdA}-${cell.rosterIdB}`}
              className="rounded-lg border border-white/10 bg-surface-2 px-3 py-2"
            >
              <p className="truncate text-sm font-medium">
                {teamName(cell.rosterIdA)} ⇄ {teamName(cell.rosterIdB)}
              </p>
              <p className="font-mono text-xs tabular-nums text-accent">
                synergy {cell.synergy.toFixed(3)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <section>
        <p className="microlabel mb-1 text-accent-bright">Matchmaker output</p>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">
          Auto-generated proposals
        </h2>
        <ProposalList analytics={data} focusRosterId={myRosterId} />
      </section>

      <section>
        <p className="microlabel mb-1 text-accent-bright">Negotiation desk</p>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">
          Manual trade builder
        </h2>
        <TradeBuilder analytics={data} myRosterId={myRosterId} />
      </section>
    </div>
  );
}
