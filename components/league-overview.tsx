"use client";

import { useParams } from "next/navigation";
import { Badge, WINDOW_STYLES } from "@/components/ui/badge";
import { Term } from "@/components/ui/term";
import type { TeamProfile } from "@/lib/types/dynasty";
import { formatPct, formatValue } from "@/lib/utils";
import { lineupEfficiency } from "@/lib/math/max-pf";
import { useDynastyStore, useMyRosterId } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * League table: every roster's asset value (with an inline bar scaled to
 * the league leader), win-now vs future split, lineup efficiency, and
 * competitive-window classification.
 */
export function LeagueOverview({ teams }: { teams: TeamProfile[] }) {
  const { leagueId } = useParams<{ leagueId: string }>();
  const myRosterId = useMyRosterId(leagueId);
  const setMyRoster = useDynastyStore((s) => s.setMyRoster);
  const sorted = [...teams].sort((a, b) => b.totalValue - a.totalValue);
  const maxValue = sorted[0]?.totalValue ?? 1;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left">
            <th className="microlabel py-2 pr-2 font-semibold">#</th>
            <th className="microlabel py-2 pr-3 font-semibold">Team</th>
            <th className="microlabel py-2 pr-3 font-semibold">Record</th>
            <th className="microlabel py-2 pr-3 text-right font-semibold">
              <Term k="totalValue">Total value</Term>
            </th>
            <th className="microlabel w-32 py-2 pr-3 font-semibold" aria-hidden />
            <th className="microlabel py-2 pr-3 text-right font-semibold">
              <Term k="winNow">Win-now</Term>
            </th>
            <th className="microlabel py-2 pr-3 text-right font-semibold">
              <Term k="efficiency">Eff.</Term>
            </th>
            <th className="microlabel py-2 font-semibold">
              <Term k="window">Window</Term>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((team, rank) => {
            const { record, pointsFor, maxPointsFor } = team.roster;
            const eff =
              maxPointsFor > 0 ? lineupEfficiency(pointsFor, maxPointsFor) : null;
            const isMine = myRosterId === team.roster.rosterId;
            return (
              <tr
                key={team.roster.rosterId}
                onClick={() =>
                  leagueId && setMyRoster(leagueId, isMine ? null : team.roster.rosterId)
                }
                className={cn(
                  "cursor-pointer border-b border-white/5 transition-colors hover:bg-surface-2/70",
                  isMine && "bg-accent/[0.08]",
                )}
                title={isMine ? "Your roster (click to unset)" : "Click to mark as your roster"}
              >
                <td className="py-2.5 pr-2 font-mono text-xs text-ink-muted">
                  {String(rank + 1).padStart(2, "0")}
                </td>
                <td className="py-2.5 pr-3 font-medium">
                  {team.roster.ownerName}
                  {isMine && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-accent-bright">
                      you
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-ink-secondary">
                  {record.wins}-{record.losses}
                  {record.ties > 0 ? `-${record.ties}` : ""}
                </td>
                <td className="py-2.5 pr-3 text-right font-mono text-[13px] tabular-nums">
                  {formatValue(team.totalValue)}
                </td>
                <td className="py-2.5 pr-3">
                  <div className="h-1 w-full overflow-hidden rounded-full bg-surface-3/80">
                    <div
                      className="h-full rounded-full bg-accent/70"
                      style={{ width: `${(team.totalValue / maxValue) * 100}%` }}
                    />
                  </div>
                </td>
                <td className="py-2.5 pr-3 text-right font-mono text-xs tabular-nums text-ink-secondary">
                  {team.totalValue > 0
                    ? formatPct(team.winNowValue / team.totalValue)
                    : "—"}
                </td>
                <td className="py-2.5 pr-3 text-right font-mono text-xs tabular-nums text-ink-secondary">
                  {eff === null ? "—" : formatPct(eff, 1)}
                </td>
                <td className="py-2.5">
                  <Badge className={WINDOW_STYLES[team.window]}>{team.window}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
        Click a row to mark it as your roster. Win-now share is Weibull-weighted
        by each player&apos;s remaining elite life expectancy; Eff. is actual PF ÷ Max-PF.
      </p>
    </div>
  );
}
