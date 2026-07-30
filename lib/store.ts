"use client";

/**
 * Global client state (Zustand): the active league and the manager's own
 * roster selection (per league). Server data lives in React Query caches.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DynastyStore {
  leagueId: string | null;
  recentLeagues: string[];
  /** "My team" selection, keyed by league id. */
  myRosterByLeague: Record<string, number | null>;
  setLeague: (leagueId: string) => void;
  setMyRoster: (leagueId: string, rosterId: number | null) => void;
}

export const useDynastyStore = create<DynastyStore>()(
  persist(
    (set, get) => ({
      leagueId: null,
      recentLeagues: [],
      myRosterByLeague: {},
      setLeague: (leagueId) => {
        const recent = [leagueId, ...get().recentLeagues.filter((l) => l !== leagueId)];
        set({ leagueId, recentLeagues: recent.slice(0, 5) });
      },
      setMyRoster: (leagueId, rosterId) =>
        set({
          myRosterByLeague: { ...get().myRosterByLeague, [leagueId]: rosterId },
        }),
    }),
    { name: "dynasty-command", version: 1 },
  ),
);

/** The selected roster id for a league, or null when viewing all teams. */
export function useMyRosterId(leagueId: string | null | undefined): number | null {
  return useDynastyStore((s) =>
    leagueId ? (s.myRosterByLeague[leagueId] ?? null) : null,
  );
}
