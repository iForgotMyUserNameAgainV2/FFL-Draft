/**
 * FantasyCalc market-value client (server-side).
 *
 * FantasyCalc exposes a public, unauthenticated endpoint of crowd-sourced
 * dynasty trade values derived from real trades:
 *   GET https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&ppr=1
 */

import type { MarketQuote } from "@/lib/types/dynasty";

const BASE_URL = "https://api.fantasycalc.com";

export interface FantasyCalcEntry {
  player: {
    id: number;
    name: string;
    position: string;
    sleeperId?: string | null;
    mflId?: string | null;
  };
  value: number;
  overallRank: number;
  positionRank: number;
  trend30Day: number;
}

export interface FantasyCalcOptions {
  isSuperFlex: boolean;
  ppr: boolean;
  numTeams?: number;
}

/**
 * Fetch current dynasty market values keyed by Sleeper player id.
 * Entries without a Sleeper mapping are skipped.
 */
export async function getFantasyCalcValues(
  options: FantasyCalcOptions,
): Promise<Map<string, MarketQuote>> {
  const params = new URLSearchParams({
    isDynasty: "true",
    numQbs: options.isSuperFlex ? "2" : "1",
    ppr: options.ppr ? "1" : "0",
    numTeams: String(options.numTeams ?? 12),
  });
  const res = await fetch(`${BASE_URL}/values/current?${params}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`FantasyCalc API ${res.status}`);
  }
  const entries = (await res.json()) as FantasyCalcEntry[];

  const quotes = new Map<string, MarketQuote>();
  const fetchedAt = new Date().toISOString();
  for (const entry of entries) {
    const sleeperId = entry.player.sleeperId;
    if (!sleeperId) continue;
    quotes.set(sleeperId, {
      assetId: sleeperId,
      source: "fantasycalc",
      value: entry.value,
      trend30d: entry.trend30Day,
      fetchedAt,
    });
  }
  return quotes;
}
