import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { db } from "../db/client.js";
import { clusters, articles } from "../db/schema.js";
import { classifyIntent } from "../domain/intent.js";
import { clusterKeywords, type ScoredKeyword } from "../domain/cluster.js";
import { generate } from "./generate.js";
import { publish } from "./publish.js";
import { daysAgoIso, clicksByArticle } from "../domain/analytics.js";
import { startRun, spendToday } from "../lib/runs.js";
import { logger } from "../lib/logger.js";
import type { GscRow } from "../services/gsc.js";

// ── GSC ingest: positions 8-20 become priority topics fed back into the pipeline ──
export interface GscIngestResult {
  received: number;
  queued: number;
  refreshed: number;
  created: number;
  items: { query: string; position: number; action: "created" | "refresh" | "skipped" }[];
}

export async function gscIngest(ctx: AppContext, rows?: GscRow[]): Promise<GscIngestResult> {
  const run = startRun("report", "gsc-ingest");
  const seeds = ctx.niche.seeds.map((s) => s.topic);
  const data = (rows && rows.length ? rows : await ctx.gsc.opportunities(seeds)).filter((r) => r.position >= 8 && r.position <= 20);

  const items: GscIngestResult["items"] = [];
  let created = 0;
  let refreshed = 0;

  for (const r of data) {
    const intent = classifyIntent(r.query);
    if (!intent.commercial || !intent.pageType) {
      items.push({ query: r.query, position: r.position, action: "skipped" });
      continue;
    }
    const sk: ScoredKeyword = {
      keyword: r.query.toLowerCase(),
      volume: r.impressions,
      difficulty: 40,
      cpc: 0,
      pageType: intent.pageType,
      source: "gsc",
      category: guessCategory(r.query, ctx),
    };
    const [c] = clusterKeywords([sk]);
    if (!c) continue;

    const existingArticle = db.select().from(articles).where(eq(articles.slug, c.slug)).get();
    if (existingArticle) {
      // Already have a page — queue it for a refresh (improve to climb from page 2).
      if (existingArticle.clusterId) db.update(clusters).set({ status: "refresh" }).where(eq(clusters.id, existingArticle.clusterId)).run();
      refreshed++;
      items.push({ query: r.query, position: r.position, action: "refresh" });
      continue;
    }
    const existingCluster = db.select().from(clusters).where(eq(clusters.slug, c.slug)).get();
    if (!existingCluster) {
      db.insert(clusters)
        .values({ slug: c.slug, title: c.title, primaryKeyword: c.primaryKeyword, pageType: c.pageType, category: c.category, market: "us", status: "new", volume: c.volume, difficulty: c.difficulty, cpc: c.cpc })
        .run();
      created++;
      items.push({ query: r.query, position: r.position, action: "created" });
    } else {
      items.push({ query: r.query, position: r.position, action: "skipped" });
    }
  }

  run.finish("ok", `gsc ingest: created ${created}, refresh ${refreshed}`);
  logger.info({ created, refreshed }, "gsc ingest complete");
  return { received: data.length, queued: created + refreshed, refreshed, created, items };
}

function guessCategory(query: string, ctx: AppContext): string {
  const q = query.toLowerCase();
  for (const s of ctx.niche.seeds) {
    const core = s.topic.toLowerCase().replace(/^ai\s+/, "");
    if (q.includes(core.split(" ")[0]!)) return s.category;
  }
  return ctx.niche.seeds[0]!.category;
}

// ── Refresh: stale (>90d) or click-declining published articles → regenerate ──
export interface RefreshResult {
  status: "ok" | "skipped";
  reason?: string;
  candidates: { slug: string; reason: string }[];
  refreshed: { slug: string }[];
}

export async function refresh(ctx: AppContext): Promise<RefreshResult> {
  const run = startRun("refresh");
  if (spendToday() >= ctx.niche.budget.dailyUsd) {
    run.finish("skipped", "daily budget exceeded");
    return { status: "skipped", reason: "daily budget exceeded", candidates: [], refreshed: [] };
  }

  const staleCutoff = daysAgoIso(ctx.niche.refresh.staleDays);
  const published = db.select().from(articles).where(eq(articles.status, "published")).all();

  const recentWin = daysAgoIso(30);
  const priorWin = daysAgoIso(60);
  const recent = new Map(clicksByArticle(recentWin).map((s) => [s.key, s.clicks]));
  const prior = new Map(clicksByArticle(priorWin).map((s) => [s.key, s.clicks]));

  // Also anything flagged 'refresh' by GSC ingest.
  const flagged = new Set(
    db.select().from(clusters).where(eq(clusters.status, "refresh")).all().map((c) => c.slug),
  );

  const candidates: RefreshResult["candidates"] = [];
  for (const a of published) {
    const lastTouch = a.refreshedAt ?? a.publishedAt ?? a.createdAt;
    const isStale = lastTouch < staleCutoff;
    const recentClicks = recent.get(a.slug) ?? 0;
    const priorOnly = (prior.get(a.slug) ?? 0) - recentClicks; // clicks in the 30-60d window
    const declining = priorOnly > 5 && recentClicks < priorOnly * 0.6;
    if (isStale) candidates.push({ slug: a.slug, reason: `stale (>${ctx.niche.refresh.staleDays}d)` });
    else if (declining) candidates.push({ slug: a.slug, reason: "clicks declining" });
    else if (flagged.has(a.slug)) candidates.push({ slug: a.slug, reason: "GSC: on page 2, improve" });
  }

  const refreshed: RefreshResult["refreshed"] = [];
  for (const c of candidates) {
    try {
      await generate(ctx, { slug: c.slug });
      await publish(ctx, { slug: c.slug });
      db.update(articles).set({ refreshedAt: new Date().toISOString() }).where(eq(articles.slug, c.slug)).run();
      refreshed.push({ slug: c.slug });
    } catch (err) {
      logger.error({ err, slug: c.slug }, "refresh failed");
    }
  }

  run.finish("ok", `refresh: ${refreshed.length}/${candidates.length}`);
  return { status: "ok", candidates, refreshed };
}

export function registerRefresh(app: FastifyInstance, ctx: AppContext): void {
  app.post<{ Body: { rows?: GscRow[] } }>("/gsc/ingest", async (req) => gscIngest(ctx, req.body?.rows));
  app.post("/refresh", async () => refresh(ctx));
}
