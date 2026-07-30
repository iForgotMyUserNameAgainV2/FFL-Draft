/**
 * GET /api/market?leagueId=...
 *
 * The heavy endpoint: assembles the full league analytics bundle —
 * consensus market values, MDI arbitrage board, team profiles/windows,
 * synergy matrix, and auto-generated trade proposals.
 */

import { NextRequest, NextResponse } from "next/server";
import { buildLeagueAnalytics } from "@/lib/league-service";
import { buildDemoAnalytics, DEMO_LEAGUE_ID } from "@/lib/demo-league";

export async function GET(request: NextRequest) {
  const leagueId = request.nextUrl.searchParams.get("leagueId");
  if (!leagueId) {
    return NextResponse.json({ error: "leagueId is required" }, { status: 400 });
  }
  try {
    const analytics =
      leagueId === DEMO_LEAGUE_ID
        ? buildDemoAnalytics()
        : await buildLeagueAnalytics(leagueId);
    return NextResponse.json(analytics, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "League analytics build failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
