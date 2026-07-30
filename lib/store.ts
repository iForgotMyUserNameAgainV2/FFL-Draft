"use client";

/**
 * Global client state (Zustand): the active league and the manager's own
 * roster selection. Server data itself lives in React Query caches.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DynastyStore {
  leagueId: string | null;
  myRosterId: number | null;
  recentLeagues: string[];
  setLeague: (leagueId: string) => void;
  setMyRoster: (rosterId: number | null) => void;
}

export const useDynastyStore = create<DynastyStore>()(
  persist(
    (set, get) => ({
      leagueId: null,
      myRosterId: null,
      recentLeagues: [],
      setLeague: (leagueId) => {
        const recent = [leagueId, ...get().recentLeagues.filter((l) => l !== leagueId)];
        set({ leagueId, recentLeagues: recent.slice(0, 5), myRosterId: null });
      },
      setMyRoster: (rosterId) => set({ myRosterId: rosterId }),
    }),
    { name: "dynasty-command" },
  ),
);
