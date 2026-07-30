"use client";

import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProposalList, TradeBuilder } from "@/components/trade-builder";
import { useLeagueAnalytics } from "@/lib/hooks";

export default function TradeMatrixPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { data, isLoading, error } = useLeagueAnalytics(leagueId ?? null);

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
  const topSynergy = data.synergy.slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trade Matrix</h1>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted">
          Pairwise synergy M(A,B) = f(Need, Surplus, Windows) across all rosters.
          High-synergy pairs feed the proposal generator below.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Highest-synergy pairings</CardTitle>
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

      <div>
        <h2 className="mb-3 text-lg font-semibold">Auto-generated proposals</h2>
        <ProposalList analytics={data} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Manual trade builder</h2>
        <TradeBuilder analytics={data} />
      </div>
    </div>
  );
}
