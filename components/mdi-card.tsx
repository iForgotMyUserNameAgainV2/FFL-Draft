"use client";

import { motion } from "framer-motion";
import { Badge, SIGNAL_STYLES } from "@/components/ui/badge";
import { PositionTag } from "@/components/ui/position-tag";
import type { SerializedMdiResult } from "@/lib/league-service";
import { isPlayerAsset } from "@/lib/types/dynasty";
import { cn, formatMdi, formatValue } from "@/lib/utils";

/** Clamp used by the diverging MDI bar (z-scores beyond ±2 pin the bar). */
const BAR_RANGE = 2;

/**
 * One row of the MDI arbitrage board: rank, asset identity, a diverging
 * MDI bar around zero, engine vs market values, and the trading signal.
 */
export function MdiCard({
  result,
  index,
  ownerName,
}: {
  result: SerializedMdiResult;
  index: number;
  ownerName?: string;
}) {
  const { asset, engineValue, marketValue, mdi, signal } = result;
  const player = isPlayerAsset(asset) ? asset : null;
  const pick = isPlayerAsset(asset) ? null : asset;
  const magnitude = Math.min(Math.abs(mdi), BAR_RANGE) / BAR_RANGE;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.02, 0.3) }}
      className="panel flex items-center gap-4 px-4 py-3 transition-colors hover:border-white/20"
    >
      <span className="w-7 shrink-0 font-mono text-xs text-ink-muted">
        {String(index + 1).padStart(2, "0")}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          {player ? (
            <PositionTag position={player.position} />
          ) : (
            <span className="font-mono text-[11px] font-bold text-ink-secondary">PICK</span>
          )}
          <span className="truncate text-sm font-semibold">
            {player ? player.name : pick ? `${pick.season} Round ${pick.round}` : asset.id}
          </span>
          <span className="hidden text-[11px] text-ink-muted sm:inline">
            {player ? `${player.team ?? "FA"} · age ${player.age}` : null}
          </span>
        </div>
        <p className="mt-1 font-mono text-[11px] tabular-nums text-ink-muted">
          eng {formatValue(engineValue)} · mkt {formatValue(marketValue)}
          {ownerName && <span className="font-sans"> · held by {ownerName}</span>}
        </p>
      </div>

      {/* Diverging MDI bar: left of center = overpriced, right = underpriced */}
      <div className="hidden w-28 shrink-0 sm:block" aria-hidden>
        <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-3/80">
          <span className="absolute left-1/2 top-0 h-full w-px bg-white/25" />
          <span
            className={cn(
              "absolute top-0 h-full rounded-full",
              mdi >= 0 ? "left-1/2 bg-status-good/80" : "right-1/2 bg-status-critical/80",
            )}
            style={{ width: `${magnitude * 50}%` }}
          />
        </div>
      </div>

      <div className="w-24 shrink-0 text-right">
        <span className="font-mono text-sm font-bold tabular-nums">{formatMdi(mdi)}</span>
        <div className="mt-1">
          <Badge className={SIGNAL_STYLES[signal]}>{signal.replace("_", " ")}</Badge>
        </div>
      </div>
    </motion.div>
  );
}
