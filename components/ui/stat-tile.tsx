import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * KPI tile: icon chip, micro label, hero value, supporting detail.
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon?: LucideIcon;
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2">
          {Icon && (
            <span className="hairline flex size-7 items-center justify-center rounded-lg bg-accent/10">
              <Icon className="size-3.5 text-accent-bright" aria-hidden />
            </span>
          )}
          <p className="microlabel">{label}</p>
        </div>
        <div className="mt-2.5 text-[1.65rem] font-bold leading-none tracking-tight">
          {value}
        </div>
        {detail && <p className="mt-2 text-xs leading-relaxed text-ink-muted">{detail}</p>}
      </CardContent>
    </Card>
  );
}
