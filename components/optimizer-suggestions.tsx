"use client";

import { useMemo } from "react";
import { ArrowDownRight, ArrowRightLeft, ArrowUpRight, Waves } from "lucide-react";
import { Badge, SIGNAL_STYLES } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PositionTag } from "@/components/ui/position-tag";
import type { LeagueAnalytics } from "@/lib/league-service";
import { startSitAdvice, type ScoredPlayer } from "@/lib/math/max-pf";
import { PPG_BASELINE } from "@/lib/math/par";
import type { PlayerAsset, TeamProfile } from "@/lib/types/dynasty";
import { POSITIONS, isPlayerAsset } from "@/lib/types/dynasty";
import { formatMdi, formatValue } from "@/lib/utils";

/** Projection metric: live PPG when available, PAR bridged to PPG otherwise. */
function projectedPpg(player: PlayerAsset): number {
  return player.ppg ?? PPG_BASELINE[player.position] + player.par;
}

// ---------------------------------------------------------------------------
// Start / sit
// ---------------------------------------------------------------------------

export function StartSitCard({
  team,
  analytics,
}: {
  team: TeamProfile;
  analytics: LeagueAnalytics;
}) {
  const advice = useMemo(() => {
    const pool: ScoredPlayer[] = team.roster.players.map((p) => ({
      playerId: p.id,
      position: p.position,
      points: projectedPpg(p),
    }));
    return startSitAdvice(pool, team.roster.starters, analytics.settings.lineupSlots);
  }, [team, analytics.settings.lineupSlots]);

  const nameOf = useMemo(() => {
    const map = new Map(team.roster.players.map((p) => [p.id, p]));
    return (id: string) => map.get(id);
  }, [team]);

  const hasLineup = team.roster.starters.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Start / sit</CardTitle>
          {hasLineup && advice.gain > 0.05 && (
            <span className="font-mono text-sm font-bold text-status-good">
              +{advice.gain.toFixed(1)} proj pts/wk
            </span>
          )}
        </div>
        <CardDescription>
          Current lineup vs the optimal lineup, projected on{" "}
          {analytics.parSource === "live" ? "season PPG" : "estimated PPG"}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!hasLineup && (
          <p className="text-sm text-ink-muted">
            No lineup set in Sleeper yet — the optimal lineup projects{" "}
            {advice.optimalPoints.toFixed(1)} points.
          </p>
        )}
        {hasLineup && advice.gain <= 0.05 && (
          <p className="text-sm text-ink-secondary">
            Your lineup is already optimal — no points left on the bench.
          </p>
        )}
        {hasLineup &&
          advice.gain > 0.05 &&
          advice.swaps.map(({ start, sit, delta }) => {
            const inP = nameOf(start.playerId);
            const outP = nameOf(sit.playerId);
            if (!inP || !outP) return null;
            return (
              <div
                key={start.playerId}
                className="hairline flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5"
              >
                <ArrowUpRight className="size-4 shrink-0 text-status-good" aria-hidden />
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">Start {inP.name}</span>{" "}
                  <span className="text-ink-muted">
                    ({inP.position} · {projectedPpg(inP).toFixed(1)} ppg)
                  </span>{" "}
                  <span className="text-ink-secondary">over {outP.name}</span>{" "}
                  <span className="text-ink-muted">
                    ({outP.position} · {projectedPpg(outP).toFixed(1)} ppg)
                  </span>
                </div>
                <span
                  className={`shrink-0 font-mono text-xs font-bold tabular-nums ${
                    delta >= 0 ? "text-status-good" : "text-ink-secondary"
                  }`}
                >
                  {delta >= 0 ? "+" : ""}
                  {delta.toFixed(1)}
                </span>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Waiver wire
// ---------------------------------------------------------------------------

export function WaiverTargetsCard({
  team,
  analytics,
}: {
  team: TeamProfile;
  analytics: LeagueAnalytics;
}) {
  const targets = useMemo(() => {
    const deficits = new Set(
      POSITIONS.filter((pos) => (team.positionalBalance[pos] ?? 0) < -0.3),
    );
    // Worst startable PPG per position on my roster (upgrade threshold).
    const worstStartable = new Map<string, number>();
    for (const pos of POSITIONS) {
      const ppgs = team.roster.players
        .filter((p) => p.position === pos)
        .map(projectedPpg)
        .sort((a, b) => b - a);
      const frontier = pos === "QB" || pos === "TE" ? 1 : 2;
      const v = ppgs[Math.min(frontier, Math.max(0, ppgs.length - 1))];
      if (v !== undefined) worstStartable.set(pos, v);
    }
    return analytics.waivers
      .map((w) => {
        const fillsDeficit = deficits.has(w.player.position);
        const upgrades =
          projectedPpg(w.player) > (worstStartable.get(w.player.position) ?? Infinity);
        const reason = fillsDeficit
          ? `Fills ${w.player.position} deficit`
          : upgrades
            ? `Outscores your ${w.player.position} depth`
            : "Best available";
        const score =
          w.marketValue * (fillsDeficit ? 1.5 : 1) * (upgrades ? 1.3 : 1);
        return { ...w, reason, score, priority: fillsDeficit || upgrades };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [team, analytics.waivers]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Waves className="size-4 text-accent-bright" aria-hidden />
          <CardTitle>Waiver wire targets</CardTitle>
        </div>
        <CardDescription>
          Best unrostered players, prioritized toward your positional deficits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {targets.length === 0 && (
          <p className="text-sm text-ink-muted">
            No waiver data available for this league yet.
          </p>
        )}
        {targets.map((t) => (
          <div
            key={t.player.id}
            className="hairline flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5"
          >
            <PositionTag position={t.player.position} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {t.player.name}
                <span className="ml-1.5 text-[11px] font-normal text-ink-muted">
                  {t.player.team ?? "FA"} · age {t.player.age}
                </span>
              </p>
              <p className="font-mono text-[11px] tabular-nums text-ink-muted">
                {projectedPpg(t.player).toFixed(1)} ppg · mkt {formatValue(t.marketValue)}
                {t.trend30d !== 0 && (
                  <span
                    className={
                      t.trend30d > 0 ? "text-status-good" : "text-status-serious"
                    }
                  >
                    {" "}
                    {t.trend30d > 0 ? "▲" : "▼"}
                    {formatValue(Math.abs(t.trend30d))}
                  </span>
                )}
              </p>
            </div>
            <Badge
              className={
                t.priority
                  ? "bg-accent/10 text-accent-bright border-accent/30"
                  : "bg-surface-3 text-ink-secondary"
              }
            >
              {t.reason}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Trade angles
// ---------------------------------------------------------------------------

export function TradeAnglesCard({
  team,
  analytics,
}: {
  team: TeamProfile;
  analytics: LeagueAnalytics;
}) {
  const ownerByRosterId = useMemo(
    () =>
      new Map(analytics.teams.map((t) => [t.roster.rosterId, t.roster.ownerName])),
    [analytics.teams],
  );

  const { sells, buys } = useMemo(() => {
    const myId = team.roster.rosterId;
    const deficits = new Set(
      POSITIONS.filter((pos) => (team.positionalBalance[pos] ?? 0) < -0.3),
    );
    const sells = analytics.mdi
      .filter(
        (r) =>
          r.rosterId === myId &&
          (r.signal === "SELL" || r.signal === "STRONG_SELL"),
      )
      .slice(0, 4);
    const buyPool = analytics.mdi.filter(
      (r) =>
        r.rosterId !== null &&
        r.rosterId !== myId &&
        (r.signal === "BUY" || r.signal === "STRONG_BUY") &&
        isPlayerAsset(r.asset),
    );
    const deficitBuys = buyPool.filter(
      (r) => isPlayerAsset(r.asset) && deficits.has(r.asset.position),
    );
    const buys = (deficitBuys.length > 0 ? deficitBuys : buyPool).slice(0, 4);
    return { sells, buys };
  }, [analytics.mdi, team]);

  const renderRow = (
    r: (typeof analytics.mdi)[number],
    kind: "sell" | "buy",
  ) => {
    const player = isPlayerAsset(r.asset) ? r.asset : null;
    return (
      <div
        key={r.asset.id}
        className="hairline flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5"
      >
        {kind === "sell" ? (
          <ArrowDownRight className="size-4 shrink-0 text-status-serious" aria-hidden />
        ) : (
          <ArrowUpRight className="size-4 shrink-0 text-status-good" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {player ? player.name : r.asset.id}
            {player && (
              <span className="ml-1.5 text-[11px] font-normal text-ink-muted">
                {player.position} · age {player.age}
              </span>
            )}
          </p>
          <p className="font-mono text-[11px] tabular-nums text-ink-muted">
            MDI {formatMdi(r.mdi)} · mkt {formatValue(r.marketValue)}
            {kind === "buy" && r.rosterId !== null && (
              <span className="font-sans">
                {" "}
                · ask {ownerByRosterId.get(r.rosterId)}
              </span>
            )}
          </p>
        </div>
        <Badge className={SIGNAL_STYLES[r.signal]}>{r.signal.replace("_", " ")}</Badge>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="size-4 text-accent-bright" aria-hidden />
          <CardTitle>Trade angles</CardTitle>
        </div>
        <CardDescription>
          Sell your overpriced assets at market; buy rivals&apos; underpriced
          players at your deficit positions.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="microlabel">Sell high</p>
          {sells.length === 0 && (
            <p className="text-sm text-ink-muted">
              No overpriced assets on your roster — the market is fair on you.
            </p>
          )}
          {sells.map((r) => renderRow(r, "sell"))}
        </div>
        <div className="space-y-2">
          <p className="microlabel">Buy low</p>
          {buys.length === 0 && (
            <p className="text-sm text-ink-muted">No discounted targets right now.</p>
          )}
          {buys.map((r) => renderRow(r, "buy"))}
        </div>
      </CardContent>
    </Card>
  );
}
