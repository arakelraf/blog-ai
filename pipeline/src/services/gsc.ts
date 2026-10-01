import type { Env } from "../config/index.js";
import { withRetry } from "../lib/retry.js";
import { logger } from "../lib/logger.js";
import { seededRandom } from "../lib/util.js";

export interface GscRow {
  query: string;
  position: number;
  clicks: number;
  impressions: number;
}

export class GscService {
  constructor(private env: Env, private live: boolean) {}

  get isLive(): boolean {
    return this.live;
  }

  /**
   * Queries ranking on page 1-2 (positions 8-20) — the "almost there" set that
   * responds best to a content refresh. Live uses the Search Console API with a
   * bearer token; otherwise returns deterministic mock rows.
   */
  async opportunities(seeds: string[]): Promise<GscRow[]> {
    if (!this.live) return this.mock(seeds);
    try {
      const site = encodeURIComponent(this.env.GSC_SITE_URL!);
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10);
      const res = await withRetry(
        async () => {
          const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, {
            method: "POST",
            headers: { Authorization: `Bearer ${this.env.GSC_ACCESS_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["query"], rowLimit: 500 }),
          });
          if (!r.ok) throw new Error(`GSC -> ${r.status}`);
          return (await r.json()) as { rows?: { keys: string[]; position: number; clicks: number; impressions: number }[] };
        },
        { label: "gsc query" },
      );
      return (res.rows ?? [])
        .map((row) => ({ query: row.keys[0]!, position: row.position, clicks: row.clicks, impressions: row.impressions }))
        .filter((r) => r.position >= 8 && r.position <= 20);
    } catch (err) {
      logger.error({ err }, "GSC live query failed; using mock");
      return this.mock(seeds);
    }
  }

  private mock(seeds: string[]): GscRow[] {
    return seeds.slice(0, 6).map((s) => {
      const q = `best ${s.toLowerCase()} for agencies`;
      const r = seededRandom(q);
      return {
        query: q,
        position: 8 + Math.round(r * 11), // 8..19
        clicks: Math.round(5 + r * 40),
        impressions: Math.round(500 + r * 4000),
      };
    });
  }
}
