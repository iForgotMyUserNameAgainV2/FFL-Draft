"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MdiCard } from "@/components/mdi-card";
import { useLeagueAnalytics } from "@/lib/hooks";
import type { MdiSignal, Position } from "@/lib/types/dynasty";
import { POSITIONS, isPlayerAsset } from "@/lib/types/dynasty";

type SignalFilter = "ALL" | "BUYS" | "SELLS";
type PositionFilter = Position | "ALL" | "PICKS";

const BUY_SIGNALS: MdiSignal[] = ["BUY", "STRONG_BUY"];
const SELL_SIGNALS: MdiSignal[] = ["SELL", "STRONG_SELL"];

export default function MdiArbitragePage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { data, isLoading, error } = useLeagueAnalytics(leagueId ?? null);
  const [signalFilter, setSignalFilter] = useState<SignalFilter>("ALL");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("ALL");

  const results = useMemo(() => {
    if (!data) return [];
    return data.mdi
      .filter((r) => {
        if (signalFilter === "BUYS") return BUY_SIGNALS.includes(r.signal);
        if (signalFilter === "SELLS") return SELL_SIGNALS.includes(r.signal);
        return true;
      })
      .filter((r) => {
        if (positionFilter === "ALL") return true;
        if (positionFilter === "PICKS") return !isPlayerAsset(r.asset);
        return isPlayerAsset(r.asset) && r.asset.position === positionFilter;
      })
      .slice(0, 60);
  }, [data, signalFilter, positionFilter]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return (
      <p className="text-sm text-status-critical">
        Failed to load MDI board: {error instanceof Error ? error.message : "unknown error"}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">MDI Arbitrage Board</h1>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted">
          MDI = (V<sub>engine</sub> − V<sub>market</sub>) / σ<sub>position</sub>. Positive
          scores are assets the structural model prices above the market consensus
          — acquisition targets. Sorted by |MDI|.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", "BUYS", "SELLS"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={signalFilter === f ? "default" : "outline"}
            onClick={() => setSignalFilter(f)}
          >
            {f}
          </Button>
        ))}
        <span className="mx-1 h-5 w-px bg-white/10" aria-hidden />
        {(["ALL", ...POSITIONS, "PICKS"] as const).map((p) => (
          <Button
            key={p}
            size="sm"
            variant={positionFilter === p ? "secondary" : "ghost"}
            onClick={() => setPositionFilter(p)}
          >
            {p}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        {results.map((r, i) => (
          <MdiCard key={r.asset.id + String(r.rosterId)} result={r} index={i} />
        ))}
        {results.length === 0 && (
          <p className="text-sm text-ink-muted">No assets match the current filters.</p>
        )}
      </div>
    </div>
  );
}
