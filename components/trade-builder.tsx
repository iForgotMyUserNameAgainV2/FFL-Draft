"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, Scale } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, WINDOW_STYLES } from "@/components/ui/badge";
import type { LeagueAnalytics } from "@/lib/league-service";
import { isPlayerAsset } from "@/lib/types/dynasty";
import { cn, formatPct, formatValue } from "@/lib/utils";

/**
 * Manual trade builder: pick two rosters, toggle assets on each side, and
 * get a live market-balance read. Asset values come from the same
 * consensus feed the MDI board uses.
 */
export function TradeBuilder({ analytics }: { analytics: LeagueAnalytics }) {
  const teams = analytics.teams;
  const first = teams[0]?.roster.rosterId ?? 0;
  const second = teams[1]?.roster.rosterId ?? 0;
  const [rosterA, setRosterA] = useState<number>(first);
  const [rosterB, setRosterB] = useState<number>(second);
  const [selectedA, setSelectedA] = useState<Set<string>>(new Set());
  const [selectedB, setSelectedB] = useState<Set<string>>(new Set());

  const assetsByRoster = useMemo(() => {
    const map = new Map<number, typeof analytics.mdi>();
    for (const result of analytics.mdi) {
      if (result.rosterId === null) continue;
      const list = map.get(result.rosterId) ?? [];
      list.push(result);
      map.set(result.rosterId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.marketValue - a.marketValue);
    }
    return map;
  }, [analytics.mdi]);

  const valueA = sumSelected(assetsByRoster.get(rosterA) ?? [], selectedA);
  const valueB = sumSelected(assetsByRoster.get(rosterB) ?? [], selectedB);
  const total = Math.max(valueA, valueB);
  const imbalance = total > 0 ? Math.abs(valueA - valueB) / total : 0;
  const verdict =
    valueA === 0 || valueB === 0
      ? null
      : imbalance <= 0.08
        ? { label: "BALANCED", className: "bg-status-good/15 text-status-good border-status-good/40" }
        : imbalance <= 0.22
          ? { label: "NEGOTIABLE", className: "bg-status-warning/10 text-status-warning border-status-warning/30" }
          : { label: "LOPSIDED", className: "bg-status-critical/15 text-status-critical border-status-critical/40" };

  function swapTeam(side: "A" | "B", rosterId: number) {
    if (side === "A") {
      setRosterA(rosterId);
      setSelectedA(new Set());
    } else {
      setRosterB(rosterId);
      setSelectedB(new Set());
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {(["A", "B"] as const).map((side) => {
          const rosterId = side === "A" ? rosterA : rosterB;
          const selected = side === "A" ? selectedA : selectedB;
          const setSelected = side === "A" ? setSelectedA : setSelectedB;
          const team = teams.find((t) => t.roster.rosterId === rosterId);
          const assets = assetsByRoster.get(rosterId) ?? [];
          return (
            <Card key={side}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>Side {side}</CardTitle>
                  {team && (
                    <Badge className={WINDOW_STYLES[team.window]}>{team.window}</Badge>
                  )}
                </div>
                <select
                  aria-label={`Team for side ${side}`}
                  className="h-9 rounded-lg border border-white/15 bg-surface-2 px-2 text-sm"
                  value={rosterId}
                  onChange={(e) => swapTeam(side, Number(e.target.value))}
                >
                  {teams.map((t) => (
                    <option key={t.roster.rosterId} value={t.roster.rosterId}>
                      {t.roster.ownerName}
                    </option>
                  ))}
                </select>
              </CardHeader>
              <CardContent className="max-h-80 space-y-1 overflow-y-auto">
                {assets.map((a) => {
                  const checked = selected.has(a.asset.id);
                  const player = isPlayerAsset(a.asset) ? a.asset : null;
                  return (
                    <label
                      key={a.asset.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2",
                        checked && "bg-accent/10",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = new Set(selected);
                          if (checked) next.delete(a.asset.id);
                          else next.add(a.asset.id);
                          setSelected(next);
                        }}
                        className="accent-[var(--color-accent)]"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {player ? player.name : a.asset.id}
                        <span className="ml-1.5 text-[11px] text-ink-muted">
                          {player ? `${player.position} · ${player.age}` : "pick"}
                        </span>
                      </span>
                      <span className="font-mono text-xs tabular-nums text-ink-secondary">
                        {formatValue(a.marketValue)}
                      </span>
                    </label>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <Scale className="size-4 text-ink-muted" aria-hidden />
            <span className="font-mono text-sm tabular-nums">
              {formatValue(valueA)} <ArrowLeftRight className="inline size-3.5" aria-hidden />{" "}
              {formatValue(valueB)}
            </span>
            {verdict && <Badge className={verdict.className}>{verdict.label}</Badge>}
          </div>
          {verdict && (
            <span className="text-xs text-ink-muted">
              Market imbalance {formatPct(imbalance, 1)} — engine treats ≤22% as
              negotiable when need-weighted utility is positive for both sides.
            </span>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function sumSelected(
  assets: LeagueAnalytics["mdi"],
  selected: Set<string>,
): number {
  return assets
    .filter((a) => selected.has(a.asset.id))
    .reduce((s, a) => s + a.marketValue, 0);
}

/** Auto-generated proposals from the game-theoretic matchmaker. */
export function ProposalList({ analytics }: { analytics: LeagueAnalytics }) {
  const teamName = (rosterId: number) =>
    analytics.teams.find((t) => t.roster.rosterId === rosterId)?.roster.ownerName ??
    `Roster ${rosterId}`;
  if (analytics.proposals.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No positive-sum proposals cleared the win-win threshold — synergy is low
        across current rosters.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {analytics.proposals.map((p, i) => (
        <motion.div
          key={p.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.4) }}
        >
          <Card>
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-xs uppercase tracking-wider text-ink-secondary">
                  {teamName(p.sideA.rosterId)} ⇄ {teamName(p.sideB.rosterId)}
                </CardTitle>
                <span className="font-mono text-sm font-bold text-status-good">
                  {formatPct(p.winWinProbability)} win-win
                </span>
              </div>
              <CardDescription>
                Synergy {p.synergy.toFixed(2)} · {formatValue(p.sideA.marketValue)} ⇄{" "}
                {formatValue(p.sideB.marketValue)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {[p.sideA, p.sideB].map((side, sideIdx) => (
                  <div
                    key={side.rosterId}
                    className="rounded-lg border border-white/10 bg-surface-2 p-3"
                  >
                    <p className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-muted">
                      {teamName(side.rosterId)} sends
                    </p>
                    <ul className="space-y-1">
                      {side.assets.map((asset) => (
                        <li key={asset.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate">
                            {isPlayerAsset(asset) ? asset.name : asset.id}
                          </span>
                          <span className="text-[11px] text-ink-muted">
                            {isPlayerAsset(asset)
                              ? `${asset.position} · ${asset.age}`
                              : `${asset.season} R${asset.round}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 font-mono text-xs tabular-nums text-ink-secondary">
                      {formatValue(sideIdx === 0 ? p.sideA.marketValue : p.sideB.marketValue)}{" "}
                      market · +{formatValue(side.utilityDelta)} utility
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-ink-secondary">{p.rationale}</p>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
