"use client";

import { Badge, WINDOW_STYLES } from "@/components/ui/badge";
import type { TeamProfile } from "@/lib/types/dynasty";
import { formatPct, formatValue } from "@/lib/utils";
import { lineupEfficiency } from "@/lib/math/max-pf";
import { useDynastyStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * League table: every roster's asset value, win-now vs future split,
 * lineup efficiency, and competitive-window classification.
 */
export function LeagueOverview({ teams }: { teams: TeamProfile[] }) {
  const { myRosterId, setMyRoster } = useDynastyStore();
  const sorted = [...teams].sort((a, b) => b.totalValue - a.totalValue);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-ink-muted">
            <th className="py-2 pr-3 font-medium">Team</th>
            <th className="py-2 pr-3 font-medium">Record</th>
            <th className="py-2 pr-3 text-right font-medium">Total value</th>
            <th className="py-2 pr-3 text-right font-medium">Win-now</th>
            <th className="py-2 pr-3 text-right font-medium">Future</th>
            <th className="py-2 pr-3 text-right font-medium">Lineup eff.</th>
            <th className="py-2 font-medium">Window</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((team) => {
            const { record, pointsFor, maxPointsFor } = team.roster;
            const eff =
              maxPointsFor > 0 ? lineupEfficiency(pointsFor, maxPointsFor) : null;
            const isMine = myRosterId === team.roster.rosterId;
            return (
              <tr
                key={team.roster.rosterId}
                onClick={() => setMyRoster(isMine ? null : team.roster.rosterId)}
                className={cn(
                  "cursor-pointer border-b border-white/5 transition-colors hover:bg-surface-2",
                  isMine && "bg-accent/10",
                )}
                title={isMine ? "Your roster (click to unset)" : "Click to mark as your roster"}
              >
                <td className="py-2.5 pr-3 font-medium">{team.roster.ownerName}</td>
                <td className="py-2.5 pr-3 text-ink-secondary">
                  {record.wins}-{record.losses}
                  {record.ties > 0 ? `-${record.ties}` : ""}
                </td>
                <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                  {formatValue(team.totalValue)}
                </td>
                <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-ink-secondary">
                  {team.totalValue > 0
                    ? formatPct(team.winNowValue / team.totalValue)
                    : "—"}
                </td>
                <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-ink-secondary">
                  {team.totalValue > 0
                    ? formatPct(team.futureValue / team.totalValue)
                    : "—"}
                </td>
                <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-ink-secondary">
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
      <p className="mt-2 text-[11px] text-ink-muted">
        Click a row to mark it as your roster. Win-now vs future split is
        Weibull-weighted by each player&apos;s remaining elite life expectancy.
      </p>
    </div>
  );
}
