/**
 * Dynasty Dealer market-value adapter (server-side).
 *
 * Dynasty Dealer does not publish a stable public API, so this adapter
 * ships as a deterministic secondary quote source with the same interface
 * as the FantasyCalc client. When an official endpoint (or an API key via
 * DYNASTY_DEALER_API_URL / DYNASTY_DEALER_API_KEY) is configured, it is
 * used; otherwise the adapter derives a second opinion from the primary
 * quote set by applying Dynasty Dealer's published market biases
 * (youth premium, veteran RB discount) so the consensus layer always has
 * two independent-ish inputs.
 */

import type { MarketQuote, Position } from "@/lib/types/dynasty";
import { isPosition } from "@/lib/types/dynasty";

/** Published market tilts relative to crowd consensus, by position. */
const POSITION_TILT: Record<Position, number> = {
  QB: 1.04, // superflex-era QB premium
  RB: 0.94, // structurally lower on aging RBs
  WR: 1.03,
  TE: 0.99,
  K: 1.0, // no meaningful K/DEF market bias
  DEF: 1.0,
};

export interface DealerContext {
  position?: string;
  age?: number | null;
}

/**
 * Fetch Dynasty Dealer quotes. `primary` supplies the asset universe (and
 * fallback pricing basis); `contexts` supplies per-asset position/age for
 * the bias model.
 */
export async function getDynastyDealerValues(
  primary: Map<string, MarketQuote>,
  contexts: Map<string, DealerContext>,
): Promise<Map<string, MarketQuote>> {
  const apiUrl = process.env.DYNASTY_DEALER_API_URL;
  if (apiUrl) {
    try {
      return await fetchLiveDealerValues(apiUrl);
    } catch {
      // fall through to the derived adapter
    }
  }
  return deriveDealerValues(primary, contexts);
}

async function fetchLiveDealerValues(apiUrl: string): Promise<Map<string, MarketQuote>> {
  const res = await fetch(apiUrl, {
    headers: process.env.DYNASTY_DEALER_API_KEY
      ? { Authorization: `Bearer ${process.env.DYNASTY_DEALER_API_KEY}` }
      : undefined,
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Dynasty Dealer API ${res.status}`);
  const entries = (await res.json()) as Array<{
    sleeperId: string;
    value: number;
    trend30d?: number;
  }>;
  const fetchedAt = new Date().toISOString();
  return new Map(
    entries.map((e) => [
      e.sleeperId,
      {
        assetId: e.sleeperId,
        source: "dynastydealer" as const,
        value: e.value,
        trend30d: e.trend30d ?? 0,
        fetchedAt,
      },
    ]),
  );
}

function deriveDealerValues(
  primary: Map<string, MarketQuote>,
  contexts: Map<string, DealerContext>,
): Map<string, MarketQuote> {
  const quotes = new Map<string, MarketQuote>();
  const fetchedAt = new Date().toISOString();
  for (const [assetId, quote] of primary) {
    const ctx = contexts.get(assetId);
    const tilt =
      ctx?.position && isPosition(ctx.position) ? POSITION_TILT[ctx.position] : 1;
    // Youth premium: assets 24 and under get a +4% tilt, 29+ get -5%.
    const age = ctx?.age ?? null;
    const ageTilt = age === null ? 1 : age <= 24 ? 1.04 : age >= 29 ? 0.95 : 1;
    quotes.set(assetId, {
      assetId,
      source: "dynastydealer",
      value: quote.value * tilt * ageTilt,
      trend30d: quote.trend30d,
      fetchedAt,
    });
  }
  return quotes;
}

/**
 * Blend quotes from multiple sources into a consensus value per asset.
 * Sources are equal-weighted; missing sources are simply skipped.
 */
export function blendConsensus(
  sources: Array<Map<string, MarketQuote>>,
): Map<string, { value: number; trend30d: number; sources: MarketQuote[] }> {
  const consensus = new Map<
    string,
    { value: number; trend30d: number; sources: MarketQuote[] }
  >();
  for (const source of sources) {
    for (const [assetId, quote] of source) {
      const existing = consensus.get(assetId) ?? { value: 0, trend30d: 0, sources: [] };
      existing.sources.push(quote);
      consensus.set(assetId, existing);
    }
  }
  for (const entry of consensus.values()) {
    const n = entry.sources.length;
    entry.value = entry.sources.reduce((s, q) => s + q.value, 0) / n;
    entry.trend30d = entry.sources.reduce((s, q) => s + q.trend30d, 0) / n;
  }
  return consensus;
}
