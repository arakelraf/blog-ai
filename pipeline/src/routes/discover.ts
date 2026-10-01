import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { db } from "../db/client.js";
import { clusters, keywords, articles } from "../db/schema.js";
import { classifyIntent } from "../domain/intent.js";
import { clusterKeywords, type ScoredKeyword } from "../domain/cluster.js";
import { startRun, spendToday } from "../lib/runs.js";
import { logger } from "../lib/logger.js";

export interface DiscoverResult {
  status: "ok" | "skipped";
  reason?: string;
  seeds: number;
  ideasGathered: number;
  commercialKept: number;
  clustersFound: number;
  clustersCreated: number;
  clustersSkippedExisting: number;
  newClusters: { slug: string; title: string; pageType: string; volume: number; cpc: number; difficulty: number }[];
}

export async function discover(ctx: AppContext): Promise<DiscoverResult> {
  const run = startRun("discover", `${ctx.niche.seeds.length} seeds`);

  // Daily budget guardrail.
  if (spendToday() >= ctx.niche.budget.dailyUsd) {
    run.finish("skipped", "daily budget exceeded");
    return emptyResult("skipped", "daily budget exceeded");
  }

  const market = ctx.niche.markets[0]!;
  const { maxKeywordsPerSeed, minVolume, maxDifficulty } = ctx.niche.discover;

  // 1. Gather ideas.
  const scored: ScoredKeyword[] = [];
  let ideasGathered = 0;
  for (const seed of ctx.niche.seeds) {
    const ideas = await ctx.seo.keywordIdeas(seed.topic, market, maxKeywordsPerSeed);
    ideasGathered += ideas.length;
    for (const idea of ideas) {
      const intent = classifyIntent(idea.keyword);
      if (!intent.commercial || !intent.pageType) continue;
      if (idea.volume < minVolume || idea.difficulty > maxDifficulty) continue;
      scored.push({
        keyword: idea.keyword,
        volume: idea.volume,
        difficulty: idea.difficulty,
        cpc: idea.cpc,
        pageType: intent.pageType,
        source: idea.source,
        category: seed.category,
      });
    }
  }

  // Dedup by keyword (keep highest volume).
  const byKeyword = new Map<string, ScoredKeyword>();
  for (const s of scored) {
    const prev = byKeyword.get(s.keyword);
    if (!prev || s.volume > prev.volume) byKeyword.set(s.keyword, s);
  }
  const commercial = [...byKeyword.values()];

  // 2. Cluster.
  const found = clusterKeywords(commercial);

  // 3. Persist, skipping clusters that already have a cluster row or published article.
  let created = 0;
  let skipped = 0;
  const newClusters: DiscoverResult["newClusters"] = [];

  for (const c of found) {
    const existingCluster = db.select({ id: clusters.id }).from(clusters).where(eq(clusters.slug, c.slug)).get();
    const existingArticle = db.select({ id: articles.id }).from(articles).where(eq(articles.slug, c.slug)).get();
    if (existingCluster || existingArticle) {
      skipped++;
      continue;
    }

    const row = db
      .insert(clusters)
      .values({
        slug: c.slug,
        title: c.title,
        primaryKeyword: c.primaryKeyword,
        pageType: c.pageType,
        category: c.category,
        market: market.code,
        status: "new",
        volume: c.volume,
        difficulty: c.difficulty,
        cpc: c.cpc,
      })
      .returning({ id: clusters.id })
      .get();
    const clusterId = row!.id;

    for (const m of c.members) {
      try {
        db.insert(keywords)
          .values({
            keyword: m.keyword,
            clusterId,
            volume: m.volume,
            difficulty: m.difficulty,
            cpc: m.cpc,
            intent: "commercial",
            pageType: m.pageType,
            source: m.source,
          })
          .run();
      } catch {
        // keyword already stored from a prior run — ignore unique violation
      }
    }
    created++;
    newClusters.push({ slug: c.slug, title: c.title, pageType: c.pageType, volume: c.volume, cpc: c.cpc, difficulty: c.difficulty });
  }

  const result: DiscoverResult = {
    status: "ok",
    seeds: ctx.niche.seeds.length,
    ideasGathered,
    commercialKept: commercial.length,
    clustersFound: found.length,
    clustersCreated: created,
    clustersSkippedExisting: skipped,
    newClusters: newClusters.sort((a, b) => b.volume - a.volume),
  };

  run.finish("ok", `created ${created} clusters from ${commercial.length} commercial keywords`);
  logger.info(result, "discover complete");
  return result;
}

function emptyResult(status: "ok" | "skipped", reason?: string): DiscoverResult {
  return {
    status,
    reason,
    seeds: 0,
    ideasGathered: 0,
    commercialKept: 0,
    clustersFound: 0,
    clustersCreated: 0,
    clustersSkippedExisting: 0,
    newClusters: [],
  };
}

export function registerDiscover(app: FastifyInstance, ctx: AppContext): void {
  app.post("/discover", async () => discover(ctx));
}
