"use client";

/**
 * React Query hooks over the internal API routes.
 */

import { useQuery } from "@tanstack/react-query";
import type { LeagueAnalytics } from "@/lib/league-service";
import type { SleeperLeague } from "@/lib/types/dynasty";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export function useLeague(leagueId: string | null) {
  return useQuery({
    queryKey: ["league", leagueId],
    queryFn: () =>
      fetchJson<SleeperLeague>(`/api/sleeper?resource=league&leagueId=${leagueId}`),
    enabled: !!leagueId,
    staleTime: 60 * 60 * 1000,
  });
}

export function useLeagueAnalytics(leagueId: string | null) {
  return useQuery({
    queryKey: ["analytics", leagueId],
    queryFn: () => fetchJson<LeagueAnalytics>(`/api/market?leagueId=${leagueId}`),
    enabled: !!leagueId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
