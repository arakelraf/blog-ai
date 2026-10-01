import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { articles } from "../db/schema.js";

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 864e5).toISOString();
}

export interface ClickStat {
  key: string;
  clicks: number;
}

export function totalClicks(sinceIso: string): number {
  const row = db.get(sql`SELECT COUNT(*) AS c FROM clicks WHERE ts >= ${sinceIso}`) as { c: number } | undefined;
  return row?.c ?? 0;
}

export function clicksByArticle(sinceIso: string, limit = 100): ClickStat[] {
  return db.all(
    sql`SELECT article_slug AS key, COUNT(*) AS clicks FROM clicks
        WHERE ts >= ${sinceIso} AND article_slug IS NOT NULL
        GROUP BY article_slug ORDER BY clicks DESC LIMIT ${limit}`,
  ) as ClickStat[];
}

export function clicksByBlock(sinceIso: string): ClickStat[] {
  return db.all(
    sql`SELECT block_position AS key, COUNT(*) AS clicks FROM clicks
        WHERE ts >= ${sinceIso} AND block_position IS NOT NULL
        GROUP BY block_position ORDER BY clicks DESC`,
  ) as ClickStat[];
}

export function clicksByProduct(sinceIso: string, limit = 20): ClickStat[] {
  return db.all(
    sql`SELECT product AS key, COUNT(*) AS clicks FROM clicks
        WHERE ts >= ${sinceIso} GROUP BY product ORDER BY clicks DESC LIMIT ${limit}`,
  ) as ClickStat[];
}

/** Published articles with their click counts in a window (for best/worst pages). */
export function pagePerformance(sinceIso: string): { slug: string; title: string; clicks: number }[] {
  const published = db.select().from(articles).where(sql`${articles.status} = 'published'`).all();
  const byArticle = new Map(clicksByArticle(sinceIso).map((s) => [s.key, s.clicks]));
  return published
    .map((a) => ({ slug: a.slug, title: a.title, clicks: byArticle.get(a.slug) ?? 0 }))
    .sort((x, y) => y.clicks - x.clicks);
}
