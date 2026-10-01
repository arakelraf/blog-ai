import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { db } from "../db/client.js";
import { articles, clusters, affiliates, type Affiliate, type Article } from "../db/schema.js";
import { runQualityGate } from "../domain/qualitygate.js";
import { generate } from "./generate.js";
import { startRun, spendToday } from "../lib/runs.js";
import { slugify } from "../lib/util.js";
import { logger } from "../lib/logger.js";
import type { ArticleContent } from "../llm/article-schema.js";

export interface PublishResult {
  status: "ok" | "skipped";
  reason?: string;
  mode: "review" | "auto";
  published: { slug: string; url?: string }[];
  sentForReview: { slug: string }[];
  failedGate: { slug: string; reasons: string[] }[];
}

function affiliatesByName(): Map<string, Affiliate> {
  const map = new Map<string, Affiliate>();
  for (const a of db.select().from(affiliates).all()) map.set(slugify(a.name), a);
  return map;
}

function parseContent(row: Article): ArticleContent {
  return typeof row.contentJson === "string" ? JSON.parse(row.contentJson) : (row.contentJson as ArticleContent);
}

/** Commit the article JSON to the repo (→ Cloudflare rebuild), mark published, ping IndexNow. */
async function doPublish(ctx: AppContext, row: Article, content: ArticleContent): Promise<string> {
  const repoPath = `site/src/content/articles/${row.slug}.json`;
  const res = await ctx.github.commitJson(repoPath, content, `content: publish ${row.slug}`);
  const url = `${ctx.env.SITE_URL}/blog/${row.slug}/`;

  db.update(articles)
    .set({ status: "published", qgPassed: true, publishedUrl: url, publishedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` })
    .where(eq(articles.id, row.id))
    .run();
  if (row.clusterId) db.update(clusters).set({ status: "published" }).where(eq(clusters.id, row.clusterId)).run();

  await ctx.indexnow.submit([url]);
  logger.info({ slug: row.slug, committed: res.committed, url }, "published");
  return url;
}

function previewText(content: ArticleContent, cluster: { score: number } | undefined): string {
  const products = content.products.map((p) => `• <b>${p.name}</b> (${p.role})`).join("\n");
  return [
    `📝 <b>Review needed</b>`,
    `<b>${content.title}</b>`,
    `Keyword: <code>${content.metaTitle}</code>`,
    cluster ? `Score: <b>${cluster.score}</b>` : "",
    `Products:\n${products}`,
    `${content.lead}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function publish(ctx: AppContext, body: { slug?: string } = {}): Promise<PublishResult> {
  const run = startRun("publish");
  const mode = ctx.niche.publish.mode;
  if (spendToday() >= ctx.niche.budget.dailyUsd) {
    run.finish("skipped", "daily budget exceeded");
    return { status: "skipped", reason: "daily budget exceeded", mode, published: [], sentForReview: [], failedGate: [] };
  }

  const drafts = body.slug
    ? db.select().from(articles).where(eq(articles.slug, body.slug)).all()
    : db.select().from(articles).where(eq(articles.status, "draft")).all();

  const byName = affiliatesByName();
  const published: PublishResult["published"] = [];
  const sentForReview: PublishResult["sentForReview"] = [];
  const failedGate: PublishResult["failedGate"] = [];

  for (const row of drafts) {
    const content = parseContent(row);
    const qg = runQualityGate(content, byName);

    if (!qg.passed) {
      db.update(articles).set({ qgPassed: false, qgReasons: qg.reasons }).where(eq(articles.id, row.id)).run();
      await ctx.telegram.notify(`❌ <b>Quality gate failed</b>: ${content.title}\n\n${qg.reasons.map((r) => `• ${r}`).join("\n")}`);
      failedGate.push({ slug: row.slug, reasons: qg.reasons });
      continue;
    }
    db.update(articles).set({ qgPassed: true, qgReasons: [] }).where(eq(articles.id, row.id)).run();

    if (mode === "auto") {
      const url = await doPublish(ctx, row, content);
      await ctx.telegram.notify(`✅ <b>Published</b>: <a href="${url}">${content.title}</a>`);
      published.push({ slug: row.slug, url });
    } else {
      const cluster = row.clusterId ? db.select().from(clusters).where(eq(clusters.id, row.clusterId)).get() : undefined;
      db.update(articles).set({ status: "review" }).where(eq(articles.id, row.id)).run();
      await ctx.telegram.reviewPreview(previewText(content, cluster), [
        { text: "✅ Publish", callback_data: `pub:${row.slug}` },
        { text: "❌ Reject", callback_data: `rej:${row.slug}` },
        { text: "♻️ Regenerate", callback_data: `regen:${row.slug}` },
      ]);
      sentForReview.push({ slug: row.slug });
    }
  }

  run.finish("ok", `published ${published.length}, review ${sentForReview.length}, failed ${failedGate.length}`);
  return { status: "ok", mode, published, sentForReview, failedGate };
}

/** Handle a Telegram inline-button decision (routed in by the n8n review-handler). */
export async function handleReview(ctx: AppContext, action: string, slug: string): Promise<{ result: string; url?: string }> {
  const row = db.select().from(articles).where(eq(articles.slug, slug)).get();
  if (!row) return { result: "not_found" };

  if (action === "publish" || action === "pub") {
    const content = parseContent(row);
    const qg = runQualityGate(content, affiliatesByName());
    if (!qg.passed) {
      await ctx.telegram.notify(`❌ Can't publish ${slug} — quality gate: ${qg.reasons.join("; ")}`);
      return { result: "gate_failed" };
    }
    const url = await doPublish(ctx, row, content);
    await ctx.telegram.notify(`✅ <b>Published</b>: <a href="${url}">${row.title}</a>`);
    return { result: "published", url };
  }

  if (action === "reject" || action === "rej") {
    db.update(articles).set({ status: "rejected" }).where(eq(articles.id, row.id)).run();
    if (row.clusterId) db.update(clusters).set({ status: "rejected" }).where(eq(clusters.id, row.clusterId)).run();
    await ctx.telegram.notify(`🗑 Rejected: ${row.title}`);
    return { result: "rejected" };
  }

  if (action === "regenerate" || action === "regen") {
    if (!row.clusterId) return { result: "no_cluster" };
    const cluster = db.select().from(clusters).where(eq(clusters.id, row.clusterId)).get();
    if (!cluster) return { result: "no_cluster" };
    await generate(ctx, { slug: cluster.slug });
    await publish(ctx, { slug: cluster.slug });
    return { result: "regenerated" };
  }

  return { result: "unknown_action" };
}

export function registerPublish(app: FastifyInstance, ctx: AppContext): void {
  app.post<{ Body: { slug?: string } }>("/publish", async (req) => publish(ctx, req.body ?? {}));
  app.post<{ Body: { action: string; slug: string } }>("/review", async (req) => {
    const { action, slug } = req.body ?? ({} as { action: string; slug: string });
    return handleReview(ctx, action, slug);
  });
}
