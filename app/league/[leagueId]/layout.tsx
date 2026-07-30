"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Command, LayoutDashboard, Scale, TrendingUp, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { slug: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { slug: "mdi-arbitrage", label: "MDI Arbitrage", icon: TrendingUp },
  { slug: "trade-matrix", label: "Trade Matrix", icon: Scale },
  { slug: "roster-optimizer", label: "Roster Optimizer", icon: Trophy },
];

export default function LeagueLayout({ children }: { children: React.ReactNode }) {
  const { leagueId } = useParams<{ leagueId: string }>();
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-surface-page/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/" className="flex items-center gap-2 font-black tracking-tight">
            <Command className="size-4 text-accent" aria-hidden />
            DYNASTY <span className="text-accent">COMMAND</span>
          </Link>
          <nav className="flex gap-1 overflow-x-auto">
            {NAV.map(({ slug, label, icon: Icon }) => {
              const href = `/league/${leagueId}/${slug}`;
              const active = pathname?.startsWith(href);
              return (
                <Link
                  key={slug}
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-accent/15 text-accent"
                      : "text-ink-secondary hover:bg-surface-2 hover:text-ink-primary",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
