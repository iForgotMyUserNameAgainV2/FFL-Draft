/**
 * Sleeper API client (server-side).
 *
 * Sleeper's read API is public and unauthenticated:
 * https://docs.sleeper.com/
 *
 * The players/nfl payload is ~5MB, so it is fetched with a long
 * revalidation window and trimmed to the fields the engines consume.
 */

import type {
  SleeperLeague,
  SleeperNflState,
  SleeperPlayer,
  SleeperRoster,
  SleeperTradedPick,
  SleeperUser,
} from "@/lib/types/dynasty";

const BASE_URL = "https://api.sleeper.app/v1";

async function sleeperFetch<T>(path: string, revalidateSeconds: number): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    next: { revalidate: revalidateSeconds },
  });
  if (!res.ok) {
    throw new Error(`Sleeper API ${res.status} for ${path}`);
  }
  return (await res.json()) as T;
}

export function getNflState(): Promise<SleeperNflState> {
  return sleeperFetch<SleeperNflState>("/state/nfl", 3600);
}

export function getLeague(leagueId: string): Promise<SleeperLeague> {
  return sleeperFetch<SleeperLeague>(`/league/${leagueId}`, 3600);
}

export function getRosters(leagueId: string): Promise<SleeperRoster[]> {
  return sleeperFetch<SleeperRoster[]>(`/league/${leagueId}/rosters`, 300);
}

export function getUsers(leagueId: string): Promise<SleeperUser[]> {
  return sleeperFetch<SleeperUser[]>(`/league/${leagueId}/users`, 3600);
}

export function getTradedPicks(leagueId: string): Promise<SleeperTradedPick[]> {
  return sleeperFetch<SleeperTradedPick[]>(`/league/${leagueId}/traded_picks`, 300);
}

export interface TrimmedPlayer {
  player_id: string;
  name: string;
  position: string;
  team: string | null;
  age: number | null;
  years_exp: number | null;
}

/**
 * Full NFL player dictionary, trimmed to the fields the engines use.
 * Cached for 24h — Sleeper asks that this endpoint be called at most
 * once per day.
 */
export async function getTrimmedPlayers(): Promise<Record<string, TrimmedPlayer>> {
  const raw = await sleeperFetch<Record<string, SleeperPlayer>>(
    "/players/nfl",
    86400,
  );
  const trimmed: Record<string, TrimmedPlayer> = {};
  for (const [id, p] of Object.entries(raw)) {
    const position = p.position ?? "";
    if (!["QB", "RB", "WR", "TE"].includes(position)) continue;
    trimmed[id] = {
      player_id: id,
      name: p.full_name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
      position,
      team: p.team ?? null,
      age: p.age ?? null,
      years_exp: p.years_exp ?? null,
    };
  }
  return trimmed;
}
