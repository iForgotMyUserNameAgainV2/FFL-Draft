"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Satellite, ArrowRight, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDynastyStore } from "@/lib/store";

/**
 * League sync entry point: paste a Sleeper league ID, validate it against
 * the API, and jump into the command dashboard.
 */
export function SleeperSync() {
  const router = useRouter();
  const { setLeague, recentLeagues } = useDynastyStore();
  const [leagueId, setLeagueId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function connect(id: string) {
    const trimmed = id.trim();
    if (!/^\d{10,}$/.test(trimmed)) {
      setError("Sleeper league IDs are long numeric strings (find it in your league URL).");
      return;
    }
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`/api/sleeper?resource=league&leagueId=${trimmed}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "League not found");
      }
      setLeague(trimmed);
      router.push(`/league/${trimmed}/dashboard`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sync league");
      setSyncing(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="w-full max-w-md space-y-3"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void connect(leagueId);
        }}
        className="flex gap-2"
      >
        <Input
          value={leagueId}
          onChange={(e) => setLeagueId(e.target.value)}
          placeholder="Sleeper league ID, e.g. 1048178119665889280"
          aria-label="Sleeper league ID"
          disabled={syncing}
        />
        <Button type="submit" disabled={syncing}>
          {syncing ? (
            <Satellite className="size-4 animate-pulse" aria-hidden />
          ) : (
            <ArrowRight className="size-4" aria-hidden />
          )}
          {syncing ? "Syncing" : "Sync"}
        </Button>
      </form>
      {error && <p className="text-xs text-status-critical">{error}</p>}
      {recentLeagues.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <History className="size-3.5" aria-hidden />
          {recentLeagues.map((id) => (
            <button
              key={id}
              onClick={() => void connect(id)}
              className="rounded-md border border-white/10 px-2 py-1 font-mono text-[11px] text-ink-secondary hover:bg-surface-2"
            >
              {id}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
