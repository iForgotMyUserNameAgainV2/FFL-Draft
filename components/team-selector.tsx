"use client";

import { useParams } from "next/navigation";
import { UserCircle2 } from "lucide-react";
import { useLeagueAnalytics } from "@/lib/hooks";
import { useDynastyStore, useMyRosterId } from "@/lib/store";

/**
 * Global "my team" selector in the league header. The selection persists
 * per league and focuses every feature — dashboard radar, MDI ownership
 * filter, trade builder defaults, and the optimizer — on that roster.
 */
export function TeamSelector() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { data } = useLeagueAnalytics(leagueId ?? null);
  const myRosterId = useMyRosterId(leagueId);
  const setMyRoster = useDynastyStore((s) => s.setMyRoster);

  if (!leagueId || !data) return null;

  return (
    <label className="flex items-center gap-1.5">
      <UserCircle2 className="size-4 shrink-0 text-accent-bright" aria-hidden />
      <span className="sr-only">Your team</span>
      <select
        className="hairline h-8 max-w-44 truncate rounded-lg bg-surface-2 px-2 text-xs font-medium text-ink-primary"
        value={myRosterId ?? ""}
        onChange={(e) =>
          setMyRoster(leagueId, e.target.value === "" ? null : Number(e.target.value))
        }
      >
        <option value="">All teams</option>
        {data.teams.map((t) => (
          <option key={t.roster.rosterId} value={t.roster.rosterId}>
            {t.roster.ownerName}
          </option>
        ))}
      </select>
    </label>
  );
}
