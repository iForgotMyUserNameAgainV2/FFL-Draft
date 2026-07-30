"use client";

import { useMemo } from "react";
import { Badge, SIGNAL_STYLES } from "@/components/ui/badge";
import { PositionTag } from "@/components/ui/position-tag";
import { Term } from "@/components/ui/term";
import type { SerializedMdiResult } from "@/lib/league-service";
import type { TeamProfile } from "@/lib/types/dynasty";
import { POSITIONS, isPlayerAsset } from "@/lib/types/dynasty";
import { formatValue } from "@/lib/utils";

/**
 * The selected team's full roster with the engine's read on every player:
 * PPG, PAR, consensus market value, and the MDI trading signal.
 */
export function RosterTable({
  team,
  mdi,
}: {
  team: TeamProfile;
  mdi: SerializedMdiResult[];
}) {
  const mdiByAsset = useMemo(
    () => new Map(mdi.map((r) => [r.asset.id, r])),
    [mdi],
  );

  const rows = POSITIONS.flatMap((pos) =>
    team.roster.players
      .filter((p) => p.position === pos)
      .map((p) => ({ player: p, result: mdiByAsset.get(p.id) }))
      .sort((a, b) => (b.result?.marketValue ?? 0) - (a.result?.marketValue ?? 0)),
  );

  const starterSet = new Set(team.roster.starters);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left">
            <th className="microlabel py-2 pr-3 font-semibold">Pos</th>
            <th className="microlabel py-2 pr-3 font-semibold">Player</th>
            <th className="microlabel py-2 pr-3 font-semibold">
              <Term k="lineup">Lineup</Term>
            </th>
            <th className="microlabel py-2 pr-3 text-right font-semibold">Age</th>
            <th className="microlabel py-2 pr-3 text-right font-semibold">
              <Term k="ppg">PPG</Term>
            </th>
            <th className="microlabel py-2 pr-3 text-right font-semibold">
              <Term k="par">PAR</Term>
            </th>
            <th className="microlabel py-2 pr-3 text-right font-semibold">
              <Term k="marketValue">Market</Term>
            </th>
            <th className="microlabel py-2 font-semibold">
              <Term k="signal">Signal</Term>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ player, result }) => (
            <tr
              key={player.id}
              className="border-b border-white/5 transition-colors hover:bg-surface-2/70"
            >
              <td className="py-2 pr-3">
                <PositionTag position={player.position} />
              </td>
              <td className="py-2 pr-3 font-medium">
                {player.name}
                <span className="ml-1.5 text-[11px] text-ink-muted">
                  {player.team ?? "FA"}
                </span>
              </td>
              <td className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider">
                {starterSet.has(player.id) ? (
                  <span className="text-accent-bright">Starter</span>
                ) : (
                  <span className="text-ink-muted">Bench</span>
                )}
              </td>
              <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-ink-secondary">
                {player.age}
              </td>
              <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-ink-secondary">
                {player.ppg !== null ? player.ppg.toFixed(1) : "—"}
              </td>
              <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-ink-secondary">
                {player.par >= 0 ? "+" : ""}
                {player.par.toFixed(1)}
              </td>
              <td className="py-2 pr-3 text-right font-mono text-[13px] tabular-nums">
                {result ? formatValue(result.marketValue) : "—"}
              </td>
              <td className="py-2">
                {result && isPlayerAsset(result.asset) && (
                  <Badge className={SIGNAL_STYLES[result.signal]}>
                    {result.signal.replace("_", " ")}
                  </Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
