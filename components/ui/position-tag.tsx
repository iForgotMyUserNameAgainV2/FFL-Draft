import type { Position } from "@/lib/types/dynasty";
import { cn } from "@/lib/utils";

/**
 * Series-color classes per position (validated categorical slots).
 * K/DEF wear neutral ink — the four chart series colors stay reserved
 * for the core skill positions.
 */
const DOT: Record<Position, string> = {
  QB: "bg-series-qb",
  RB: "bg-series-rb",
  WR: "bg-series-wr",
  TE: "bg-series-te",
  K: "bg-ink-secondary",
  DEF: "bg-ink-secondary",
};

const TEXT: Record<Position, string> = {
  QB: "text-series-qb",
  RB: "text-series-rb",
  WR: "text-series-wr",
  TE: "text-series-te",
  K: "text-ink-secondary",
  DEF: "text-ink-secondary",
};

/**
 * Position marker: color-coded dot + explicit text label so identity is
 * never carried by color alone.
 */
export function PositionTag({
  position,
  className,
}: {
  position: Position;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[11px] font-bold",
        TEXT[position],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT[position])} aria-hidden />
      {position}
    </span>
  );
}
