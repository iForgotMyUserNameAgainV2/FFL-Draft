import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";
import type { CompetitiveWindow, MdiSignal } from "@/lib/types/dynasty";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
        className,
      )}
      {...props}
    />
  );
}

/** Signal badges pair color with an explicit label (never color alone). */
export const SIGNAL_STYLES: Record<MdiSignal, string> = {
  STRONG_BUY: "bg-status-good/15 text-status-good border-status-good/40",
  BUY: "bg-status-good/10 text-status-good border-status-good/25",
  HOLD: "bg-surface-3 text-ink-secondary",
  SELL: "bg-status-serious/10 text-status-serious border-status-serious/25",
  STRONG_SELL: "bg-status-critical/15 text-status-critical border-status-critical/40",
};

export const WINDOW_STYLES: Record<CompetitiveWindow, string> = {
  REBUILD: "bg-series-qb/10 text-series-qb border-series-qb/30",
  RETOOL: "bg-surface-3 text-ink-secondary",
  CONTEND: "bg-status-warning/10 text-status-warning border-status-warning/30",
  ALL_IN: "bg-status-critical/10 text-status-critical border-status-critical/30",
};
