"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Command, LayoutDashboard, Scale, TrendingUp, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TeamSelector } from "@/components/team-selector";
import { useLeagueAnalytics } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const NAV = [
  { slug: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { slug: "mdi-arbitrage", label: "MDI Arbitrage", icon: TrendingUp },
  { slug: "trade-matrix", label: "Trade Matrix", icon: Scale },
  { slug: "roster-optimizer", label: "Optimizer", icon: Trophy },
];

export default function LeagueLayout({ children }: { children: React.ReactNode }) {
  const { leagueId } = useParams<{ leagueId: string }>();
  const pathname = usePathname();
  const { data } = useLeagueAnalytics(leagueId ?? null);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-surface-page/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 text-[13px] font-black tracking-tight"
          >
            <span className="hairline flex size-7 items-center justify-center rounded-lg bg-accent/15">
              <Command className="size-3.5 text-accent-bright" aria-hidden />
            </span>
            DYNASTY <span className="text-accent-bright">COMMAND</span>
          </Link>

          <nav className="flex flex-1 gap-1 overflow-x-auto">
            {NAV.map(({ slug, label, icon: Icon }) => {
              const href = `/league/${leagueId}/${slug}`;
              const active = pathname?.startsWith(href);
              return (
                <Link
                  key={slug}
                  href={href}
                  className={cn(
                    "relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-accent/15 text-accent-bright"
                      : "text-ink-secondary hover:bg-surface-2 hover:text-ink-primary",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <TeamSelector />
            {data && (
              <>
                <span className="hidden max-w-44 truncate text-xs font-medium text-ink-secondary lg:inline">
                  {data.settings.name}
                </span>
                <Badge className="hidden bg-surface-2 text-ink-secondary md:inline-flex">
                  {data.phase.replace("_", " ")}
                </Badge>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
