"use client";

import { useMemo } from "react";
import {
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  ClipboardCheck,
  Waves,
} from "lucide-react";
import { Badge, SIGNAL_STYLES } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PositionTag } from "@/components/ui/position-tag";
import { Term } from "@/components/ui/term";
import type { LeagueAnalytics } from "@/lib/league-service";
import {
  buyTargets,
  filterStartSit,
  rankWaivers,
  sellCandidates,
  type AdviceContext,
} from "@/lib/math/advisor";
import { startSitAdvice, type ScoredPlayer } from "@/lib/math/max-pf";
import { PPG_BASELINE } from "@/lib/math/par";
import type { PlayerAsset, Position, TeamProfile } from "@/lib/types/dynasty";
import { POSITIONS } from "@/lib/types/dynasty";
import { formatMdi, formatValue } from "@/lib/utils";

/** Projection metric: live PPG when available, PAR bridged to PPG otherwise. */
function projectedPpg(player: PlayerAsset): number {
  return player.ppg ?? PPG_BASELINE[player.position] + player.par;
}

function adviceContext(team: TeamProfile): AdviceContext {
  return { window: team.window, positionalBalance: team.positionalBalance };
}

/** PPG of the weakest player who'd still crack the starting lineup, per position. */
function startableFloor(team: TeamProfile): Map<Position, number> {
  const floor = new Map<Position, number>();
  for (const pos of POSITIONS) {
    const ppgs = team.roster.players
      .filter((p) => p.position === pos)
      .map(projectedPpg)
      .sort((a, b) => b - a);
    const frontier = pos === "QB" || pos === "TE" ? 1 : 2;
    const v = ppgs[Math.min(frontier, Math.max(0, ppgs.length - 1))];
    if (v !== undefined) floor.set(pos, v);
  }
  return floor;
}

function useStartSit(team: TeamProfile, analytics: LeagueAnalytics) {
  return useMemo(() => {
    const pool: ScoredPlayer[] = team.roster.players.map((p) => ({
      playerId: p.id,
      position: p.position,
      points: projectedPpg(p),
    }));
    const advice = startSitAdvice(
      pool,
      team.roster.starters,
      analytics.settings.lineupSlots,
    );
    return { advice, filtered: filterStartSit(advice) };
  }, [team, analytics.settings.lineupSlots]);
}

function useWaivers(team: TeamProfile, analytics: LeagueAnalytics) {
  return useMemo(
    () =>
      rankWaivers(
        analytics.waivers,
        adviceContext(team),
        startableFloor(team),
        projectedPpg,
      ).slice(0, 6),
    [team, analytics.waivers],
  );
}

function useTradeAngles(team: TeamProfile, analytics: LeagueAnalytics) {
  return useMemo(() => {
    const myId = team.roster.rosterId;
    const ctx = adviceContext(team);
    const mine = analytics.mdi.filter((r) => r.rosterId === myId);
    const rivals = analytics.mdi.filter(
      (r) => r.rosterId !== null && r.rosterId !== myId,
    );
    return {
      sells: sellCandidates(mine, ctx).slice(0, 4),
      buys: buyTargets(rivals, ctx).slice(0, 4),
    };
  }, [team, analytics.mdi]);
}

// ---------------------------------------------------------------------------
// This week's action plan
// ---------------------------------------------------------------------------

export function ActionPlanCard({
  team,
  analytics,
}: {
  team: TeamProfile;
  analytics: LeagueAnalytics;
}) {
  const { filtered } = useStartSit(team, analytics);
  const waivers = useWaivers(team, analytics);
  const { sells, buys } = useTradeAngles(team, analytics);

  const nameOf = useMemo(() => {
    const map = new Map(team.roster.players.map((p) => [p.id, p.name]));
    return (id: string) => map.get(id) ?? id;
  }, [team]);

  const actions: Array<{ title: string; detail: string }> = [];

  const topSwap = filtered.actionable[0];
  if (topSwap) {
    actions.push({
      title: `Fix your lineup: start ${nameOf(topSwap.start.playerId)} over ${nameOf(topSwap.sit.playerId)}`,
      detail: `Worth +${topSwap.delta.toFixed(1)} projected points per week — free wins, no trade required.`,
    });
  }
  const topClaim = waivers.find((w) => w.priority);
  if (topClaim) {
    actions.push({
      title: `Put in a waiver claim for ${topClaim.player.name}`,
      detail: `${topClaim.reason} — ${projectedPpg(topClaim.player).toFixed(1)} projected ppg, costs nothing but priority.`,
    });
  }
  const topBuy = buys[0];
  const topSell = sells[0];
  if (topBuy) {
    const askName =
      analytics.teams.find((t) => t.roster.rosterId === topBuy.result.rosterId)
        ?.roster.ownerName ?? "the owner";
    actions.push({
      title: `Open trade talks for ${topBuy.player.name}`,
      detail: `${topBuy.reason} Ask ${askName}${topSell ? `; dangle ${topSell.player.name} to fund it` : ""}.`,
    });
  } else if (topSell) {
    actions.push({
      title: `Shop ${topSell.player.name} around the league`,
      detail: topSell.reason,
    });
  }
  if (actions.length === 0) {
    actions.push({
      title: "Hold steady",
      detail:
        "Lineup is optimal, no priority waiver adds, and no mispriced trades on the board. Re-check after the next market refresh.",
    });
  }

  return (
    <Card className="border-accent/25">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-accent-bright" aria-hidden />
          <CardTitle>This week&apos;s action plan</CardTitle>
        </div>
        <CardDescription>
          The highest-impact moves for {team.roster.ownerName}, in order. Do these
          first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {actions.map((a, i) => (
          <div key={a.title} className="hairline flex gap-3 rounded-lg bg-surface-2 px-3 py-3">
            <span className="hairline flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-xs font-bold text-accent-bright">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug">{a.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{a.detail}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
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
  const { advice, filtered } = useStartSit(team, analytics);

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
          {hasLineup && filtered.actionableGain > 0 && (
            <span className="font-mono text-sm font-bold text-status-good">
              +{filtered.actionableGain.toFixed(1)} proj pts/wk
            </span>
          )}
        </div>
        <CardDescription>
          Your lineup vs the best possible lineup, projected on{" "}
          <Term k="ppg">{analytics.parSource === "live" ? "season PPG" : "estimated PPG"}</Term>.
          Swaps under {1.0.toFixed(1)} ppg are treated as coin flips, not advice.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!hasLineup && (
          <p className="text-sm text-ink-muted">
            No lineup set in Sleeper yet — the optimal lineup projects{" "}
            {advice.optimalPoints.toFixed(1)} points.
          </p>
        )}
        {hasLineup && filtered.actionable.length === 0 && (
          <p className="text-sm text-ink-secondary">
            No changes worth making — your lineup is within the noise band of
            optimal. Don&apos;t churn it.
          </p>
        )}
        {hasLineup &&
          filtered.actionable.map(({ start, sit, delta }) => {
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
                <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-status-good">
                  +{delta.toFixed(1)}
                </span>
              </div>
            );
          })}
        {hasLineup && filtered.coinFlips.length > 0 && (
          <p className="text-[11px] leading-relaxed text-ink-muted">
            Too close to call:{" "}
            {filtered.coinFlips
              .map(
                (s) =>
                  `${nameOf(s.start.playerId)?.name ?? "?"} vs ${nameOf(s.sit.playerId)?.name ?? "?"} (+${s.delta.toFixed(1)})`,
              )
              .join(", ")}{" "}
            — check matchups before flipping these.
          </p>
        )}
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
  const targets = useWaivers(team, analytics);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Waves className="size-4 text-accent-bright" aria-hidden />
          <CardTitle>Waiver wire targets</CardTitle>
        </div>
        <CardDescription>
          Best unrostered players for a <Term k="window">{team.window}</Term> team,
          prioritized toward your roster holes.
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
  const { sells, buys } = useTradeAngles(team, analytics);
  const ownerByRosterId = useMemo(
    () =>
      new Map(analytics.teams.map((t) => [t.roster.rosterId, t.roster.ownerName])),
    [analytics.teams],
  );

  const renderRow = (
    rec: { result: SerializedMdiResultLike; player: PlayerAsset; reason: string },
    kind: "sell" | "buy",
  ) => (
    <div
      key={rec.player.id}
      className="hairline flex items-start gap-3 rounded-lg bg-surface-2 px-3 py-2.5"
    >
      {kind === "sell" ? (
        <ArrowDownRight className="mt-0.5 size-4 shrink-0 text-status-serious" aria-hidden />
      ) : (
        <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-status-good" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {rec.player.name}
          <span className="ml-1.5 text-[11px] font-normal text-ink-muted">
            {rec.player.position} · age {rec.player.age}
          </span>
        </p>
        <p className="font-mono text-[11px] tabular-nums text-ink-muted">
          <Term k="mdi">MDI</Term> {formatMdi(rec.result.mdi)} · mkt{" "}
          {formatValue(rec.result.marketValue)}
          {kind === "buy" && rec.result.rosterId !== null && (
            <span className="font-sans">
              {" "}
              · ask {ownerByRosterId.get(rec.result.rosterId)}
            </span>
          )}
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-secondary">{rec.reason}</p>
      </div>
      <Badge className={SIGNAL_STYLES[rec.result.signal]}>
        {rec.result.signal.replace("_", " ")}
      </Badge>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="size-4 text-accent-bright" aria-hidden />
          <CardTitle>Trade angles</CardTitle>
        </div>
        <CardDescription>
          Filtered for a <Term k="window">{team.window}</Term> team: you&apos;ll
          never be told to sell into your own holes or buy against your timeline.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="microlabel">Sell high</p>
          {sells.length === 0 && (
            <p className="text-sm text-ink-muted">
              Nothing worth selling — your tradeable pieces are fairly priced and
              your core belongs where it is.
            </p>
          )}
          {sells.map((r) => renderRow(r, "sell"))}
        </div>
        <div className="space-y-2">
          <p className="microlabel">Buy low</p>
          {buys.length === 0 && (
            <p className="text-sm text-ink-muted">
              No discounted targets that fit your timeline right now.
            </p>
          )}
          {buys.map((r) => renderRow(r, "buy"))}
        </div>
      </CardContent>
    </Card>
  );
}

type SerializedMdiResultLike = LeagueAnalytics["mdi"][number];
