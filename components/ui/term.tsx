"use client";

import type { ReactNode } from "react";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";
import { cn } from "@/lib/utils";

/**
 * Inline term with a hover/focus definition tooltip. Dotted underline
 * marks it as explainable; keyboard-focusable for accessibility.
 */
export function Term({
  k,
  children,
  className,
}: {
  k: GlossaryKey;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      tabIndex={0}
      className={cn(
        "group/term relative inline-flex cursor-help items-center underline decoration-ink-muted/50 decoration-dotted underline-offset-[3px] outline-none focus-visible:decoration-accent",
        className,
      )}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-0 top-full z-40 mt-2 w-64 rounded-lg border border-white/10 bg-surface-3 px-3 py-2.5 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-ink-secondary opacity-0 shadow-xl transition-opacity duration-150 group-hover/term:visible group-hover/term:opacity-100 group-focus-visible/term:visible group-focus-visible/term:opacity-100"
      >
        {GLOSSARY[k]}
      </span>
    </span>
  );
}
