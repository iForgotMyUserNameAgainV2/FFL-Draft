"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, WINDOW_STYLES } from "@/components/ui/badge";
import type { LeagueAnalytics } from "@/lib/league-service";
import { buildSwotReport } from "@/lib/math/swot";
import type { TeamProfile } from "@/lib/types/dynasty";

/**
 * Compact "Your team" autopsy strip for the dashboard: grade, window,
 * verdict, and the single biggest edge and liability, linking through to
 * the full SWOT page.
 */
export function YourTeamBanner({
  team,
  analytics,
  leagueId,
}: {
  team: TeamProfile;
  analytics: LeagueAnalytics;
  leagueId: string;
}) {
  const report = useMemo(
    () =>
      buildSwotReport({
        team,
        league: analytics.teams,
        mdi: analytics.mdi,
        waivers: analytics.waivers,
        proposals: analytics.proposals,
        phase: analytics.phase,
      }),
    [team, analytics],
  );

  const edge = report.strengths[0];
  const liability = report.weaknesses[0];

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-4 py-4">
        <div className="flex shrink-0 items-center gap-4">
          <div className="text-center">
            <p className="microlabel">Grade</p>
            <p className="font-mono text-3xl font-black tabular-nums">
              {report.grade}
            </p>
          </div>
          <div>
            <p className="microlabel mb-1 text-accent-bright">Your team</p>
            <p className="text-sm font-semibold">{team.roster.ownerName}</p>
            <Badge className={`mt-1 ${WINDOW_STYLES[team.window]}`}>
              {team.window}
            </Badge>
          </div>
        </div>

        <div className="min-w-56 flex-1 space-y-1.5 text-[13px] leading-relaxed">
          <p className="text-ink-secondary">{report.verdict}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {edge && (
              <span className="flex items-center gap-1.5 text-ink-muted">
                <ShieldCheck className="size-3.5 shrink-0 text-status-good" aria-hidden />
                {edge.title}
              </span>
            )}
            {liability && (
              <span className="flex items-center gap-1.5 text-ink-muted">
                <AlertTriangle className="size-3.5 shrink-0 text-status-warning" aria-hidden />
                {liability.title}
              </span>
            )}
          </div>
        </div>

        <Link
          href={`/league/${leagueId}/your-team`}
          className="hairline flex shrink-0 items-center gap-1.5 rounded-lg bg-accent/15 px-3 py-2 text-xs font-semibold text-accent-bright transition-colors hover:bg-accent/25"
        >
          Full autopsy
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}
