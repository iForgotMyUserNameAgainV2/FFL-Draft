"use client";

import { motion } from "framer-motion";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Badge, SIGNAL_STYLES } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { SerializedMdiResult } from "@/lib/league-service";
import { isPlayerAsset } from "@/lib/types/dynasty";
import { formatMdi, formatValue } from "@/lib/utils";

/**
 * One row of the MDI arbitrage board: asset identity, engine vs market
 * value, and the MDI z-score with its trading signal.
 */
export function MdiCard({ result, index }: { result: SerializedMdiResult; index: number }) {
  const { asset, engineValue, marketValue, mdi, signal } = result;
  const player = isPlayerAsset(asset) ? asset : null;
  const pick = isPlayerAsset(asset) ? null : asset;
  const Icon = mdi > 0.35 ? TrendingUp : mdi < -0.35 ? TrendingDown : Minus;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.4) }}
    >
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">
                {player ? player.name : `Pick ${asset.id}`}
              </span>
              <span className="text-[11px] font-medium text-ink-muted">
                {player
                  ? `${player.position} · ${player.team ?? "FA"} · age ${player.age}`
                  : pick
                    ? `${pick.season} round ${pick.round}`
                    : null}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Engine {formatValue(engineValue)} vs market {formatValue(marketValue)}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5 font-mono text-sm font-bold tabular-nums">
              <Icon className="size-4" aria-hidden />
              {formatMdi(mdi)}
            </div>
            <Badge className={`mt-1 ${SIGNAL_STYLES[signal]}`}>
              {signal.replace("_", " ")}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
