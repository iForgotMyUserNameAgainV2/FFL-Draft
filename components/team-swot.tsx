"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  ShieldCheck,
  Skull,
  Sparkles,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LeagueAnalytics } from "@/lib/league-service";
import { buildSwotReport, type SwotItem } from "@/lib/math/swot";
import type { TeamProfile } from "@/lib/types/dynasty";
import { cn } from "@/lib/utils";

const QUADRANTS: Array<{
  key: "strengths" | "weaknesses" | "opportunities" | "threats";
  label: string;
  icon: LucideIcon;
  accent: string;
  empty: string;
}> = [
  {
    key: "strengths",
    label: "Strengths",
    icon: ShieldCheck,
    accent: "text-status-good",
    empty: "No standout strengths — the roster is league-average everywhere.",
  },
  {
    key: "weaknesses",
    label: "Weaknesses",
    icon: AlertTriangle,
    accent: "text-status-warning",
    empty: "No structural weaknesses detected — a clean bill of health.",
  },
  {
    key: "opportunities",
    label: "Opportunities",
    icon: Sparkles,
    accent: "text-accent-bright",
    empty: "No open market angles right now — check back after values move.",
  },
  {
    key: "threats",
    label: "Threats",
    icon: Skull,
    accent: "text-status-critical",
    empty: "Nothing circling — no age cliffs, concentration, or arms race in view.",
  },
];

/**
 * The full autopsy: coroner's verdict banner plus the four SWOT quadrants,
 * generated from the team profile, MDI board, waivers, and trade market.
 */
export function TeamSwot({
  team,
  analytics,
}: {
  team: TeamProfile;
  analytics: LeagueAnalytics;
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

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center gap-4 py-4">
          <span className="hairline flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent/15">
            <Stethoscope className="size-5 text-accent-bright" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="microlabel mb-1 text-accent-bright">Coroner&apos;s verdict</p>
            <p className="text-sm leading-relaxed text-ink-secondary">{report.verdict}</p>
          </div>
          <div className="shrink-0 text-center">
            <p className="microlabel">Grade</p>
            <p className="font-mono text-3xl font-black tabular-nums">{report.grade}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {QUADRANTS.map(({ key, label, icon: Icon, accent, empty }) => (
          <Card key={key}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Icon className={cn("size-4", accent)} aria-hidden />
                <CardTitle>{label}</CardTitle>
              </div>
              <CardDescription>
                {report[key].length} finding{report[key].length === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {report[key].length === 0 && (
                <p className="text-sm text-ink-muted">{empty}</p>
              )}
              {report[key].map((item) => (
                <SwotRow key={item.title} item={item} accent={accent} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SwotRow({ item, accent }: { item: SwotItem; accent: string }) {
  return (
    <div className="hairline rounded-lg bg-surface-2 px-3 py-2.5">
      <p className={cn("text-sm font-semibold", accent)}>{item.title}</p>
      <p className="mt-0.5 text-[13px] leading-relaxed text-ink-secondary">
        {item.detail}
      </p>
    </div>
  );
}
