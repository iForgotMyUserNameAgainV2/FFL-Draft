/**
 * GET /api/sleeper?leagueId=...&resource=league|rosters|users|state
 *
 * Thin, cached server-side proxy over the public Sleeper API so the
 * browser never talks to Sleeper directly (keeps caching centralized and
 * lets us trim payloads later).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getLeague,
  getNflState,
  getRosters,
  getUsers,
} from "@/lib/api/sleeper";

const RESOURCES = ["league", "rosters", "users", "state"] as const;
type Resource = (typeof RESOURCES)[number];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const resource = (searchParams.get("resource") ?? "league") as Resource;
  const leagueId = searchParams.get("leagueId");

  if (!RESOURCES.includes(resource)) {
    return NextResponse.json({ error: `Unknown resource '${resource}'` }, { status: 400 });
  }
  if (resource !== "state" && !leagueId) {
    return NextResponse.json({ error: "leagueId is required" }, { status: 400 });
  }

  try {
    switch (resource) {
      case "state":
        return NextResponse.json(await getNflState());
      case "league":
        return NextResponse.json(await getLeague(leagueId!));
      case "rosters":
        return NextResponse.json(await getRosters(leagueId!));
      case "users":
        return NextResponse.json(await getUsers(leagueId!));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sleeper fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
