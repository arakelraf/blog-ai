import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { db } from "../db/client.js";
import { clusters, affiliates, clusterAffiliates, articles, type Cluster } from "../db/schema.js";
import { generateArticle, type MatchedProduct, type ClusterInput } from "../llm/generate.js";
import { startRun, spendToday } from "../lib/runs.js";
import { sha256 } from "../lib/util.js";
import { logger } from "../lib/logger.js";
import type { ArticleContent } from "../llm/article-schema.js";

export interface GenerateResult {
  status: "ok" | "skipped";
  reason?: string;
  generated: { slug: string; title: string; products: number; words: number }[];
  errors: { slug: string; error: string }[];
}

function matchedProductsFor(clusterId: number): MatchedProduct[] {
  const links = db.select().from(clusterAffiliates).where(eq(clusterAffiliates.clusterId, clusterId)).all();
  const out: MatchedProduct[] = [];
  for (const link of links.sort((a, b) => a.position - b.position)) {
    const aff = db.select().from(affiliates).where(eq(affiliates.id, link.affiliateId)).get();
    if (aff) out.push({ affiliate: aff, role: link.role as MatchedProduct["role"] });
  }
  return out;
}

function targetClusters(ctx: AppContext, body: GenerateBody): Cluster[] {
  if (body.clusterId) {
    const c = db.select().from(clusters).where(eq(clusters.id, body.clusterId)).get();
    return c ? [c] : [];
  }
  if (body.slug) {
    const c = db.select().from(clusters).where(eq(clusters.slug, body.slug)).get();
    return c ? [c] : [];
  }
  // Default: today's top-N matched clusters above threshold, not yet generated.
  return db
    .select()
    .from(clusters)
    .where(eq(clusters.status, "matched"))
    .all()
    .filter((c) => c.score >= ctx.niche.scoring.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, ctx.niche.scoring.topNPerDay);
}

function wordCount(a: ArticleContent): number {
  const text = JSON.stringify(a).replace(/[^a-zA-Z ]/g, " ");
  return text.split(/\s+/).filter(Boolean).length;
}

interface GenerateBody {
  clusterId?: number;
  slug?: string;
}

export async function generate(ctx: AppContext, body: GenerateBody = {}): Promise<GenerateResult> {
  const run = startRun("generate");
  if (spendToday() >= ctx.niche.budget.dailyUsd) {
    run.finish("skipped", "daily budget exceeded");
    return { status: "skipped", reason: "daily budget exceeded", generated: [], errors: [] };
  }

  const targets = targetClusters(ctx, body);
  const generated: GenerateResult["generated"] = [];
  const errors: GenerateResult["errors"] = [];
  const market = ctx.niche.markets[0]!;

  for (const c of targets) {
    try {
      const matched = matchedProductsFor(c.id);
      if (matched.length < 2) {
        errors.push({ slug: c.slug, error: "fewer than 2 matched products" });
        continue;
      }
      const clusterInput: ClusterInput = {
        title: c.title,
        slug: c.slug,
        primaryKeyword: c.primaryKeyword,
        pageType: c.pageType as ClusterInput["pageType"],
        category: c.category,
      };
      const serp = await ctx.seo.serpSnapshot(c.primaryKeyword, market);
      const article = await generateArticle(ctx.llm, clusterInput, matched, serp, run);

      const contentJson = JSON.stringify(article);
      const hash = sha256(contentJson);

      const existing = db.select().from(articles).where(eq(articles.slug, c.slug)).get();
      if (existing) {
        db.update(articles)
          .set({ title: article.title, contentJson: article, contentHash: hash, status: "draft", qgPassed: false })
          .where(eq(articles.id, existing.id))
          .run();
      } else {
        db.insert(articles)
          .values({ clusterId: c.id, slug: c.slug, title: article.title, status: "draft", contentJson: article, contentHash: hash })
          .run();
      }
      db.update(clusters).set({ status: "generated" }).where(eq(clusters.id, c.id)).run();

      generated.push({ slug: c.slug, title: article.title, products: article.products.length, words: wordCount(article) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, cluster: c.slug }, "generation failed");
      errors.push({ slug: c.slug, error: msg });
    }
  }

  run.finish(errors.length && !generated.length ? "error" : "ok", `generated ${generated.length}, errors ${errors.length}`);
  logger.info({ generated: generated.length, errors: errors.length }, "generate complete");
  return { status: "ok", generated, errors };
}

export function registerGenerate(app: FastifyInstance, ctx: AppContext): void {
  app.post<{ Body: GenerateBody }>("/generate", async (req) => generate(ctx, req.body ?? {}));
}
