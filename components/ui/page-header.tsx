import type { ReactNode } from "react";

/**
 * Standard page header: eyebrow, title, description, optional right slot.
 * Keeps typographic hierarchy identical across every league view.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <p className="microlabel mb-1.5 text-accent-bright">{eyebrow}</p>
        <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight">{title}</h1>
        {description && (
          <div className="mt-2 text-[13px] leading-relaxed text-ink-muted">
            {description}
          </div>
        )}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}
