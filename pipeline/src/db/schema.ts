import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

export const clusters = sqliteTable(
  "clusters",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    primaryKeyword: text("primary_keyword").notNull(),
    pageType: text("page_type").notNull(), // best-list | versus | review | alternatives | deal
    category: text("category").notNull(),
    market: text("market").notNull().default("us"),
    status: text("status").notNull().default("new"),
    // new | matched | no_monetization | generated | published | rejected | refresh
    score: real("score").notNull().default(0),
    volume: integer("volume").notNull().default(0),
    difficulty: real("difficulty").notNull().default(0),
    cpc: real("cpc").notNull().default(0),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => ({ statusIdx: index("clusters_status_idx").on(t.status) }),
);

export const keywords = sqliteTable(
  "keywords",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    keyword: text("keyword").notNull().unique(),
    clusterId: integer("cluster_id").references(() => clusters.id),
    volume: integer("volume").notNull().default(0),
    difficulty: real("difficulty").notNull().default(0),
    cpc: real("cpc").notNull().default(0),
    intent: text("intent").notNull().default("commercial"),
    pageType: text("page_type").notNull(),
    source: text("source").notNull(), // suggestions | related | autocomplete | gsc
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => ({ clusterIdx: index("keywords_cluster_idx").on(t.clusterId) }),
);

export const affiliates = sqliteTable("affiliates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  affiliateLink: text("affiliate_link").notNull(),
  network: text("network"),
  commission: text("commission"), // free text, verbatim from program — never invented
  cookieDays: integer("cookie_days"),
  category: text("category").notNull(),
  pros: text("pros", { mode: "json" }).$type<string[]>().default([]),
  cons: text("cons", { mode: "json" }).$type<string[]>().default([]),
  pricing: text("pricing", { mode: "json" }).$type<{ plan: string; price: string; note?: string }[]>().default([]),
  promoCode: text("promo_code"),
  rating: real("rating"),
  logoUrl: text("logo_url"),
  lastVerified: text("last_verified"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(now),
});

export const clusterAffiliates = sqliteTable("cluster_affiliates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clusterId: integer("cluster_id").notNull().references(() => clusters.id),
  affiliateId: integer("affiliate_id").notNull().references(() => affiliates.id),
  role: text("role").notNull(), // top_pick | budget | premium | alternative
  rationale: text("rationale"),
  position: integer("position").notNull().default(0),
});

export const articles = sqliteTable(
  "articles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clusterId: integer("cluster_id").references(() => clusters.id),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    status: text("status").notNull().default("draft"),
    // draft | review | published | rejected | refresh
    contentJson: text("content_json", { mode: "json" }),
    contentHash: text("content_hash"),
    qgPassed: integer("qg_passed", { mode: "boolean" }).notNull().default(false),
    qgReasons: text("qg_reasons", { mode: "json" }).$type<string[]>().default([]),
    previewUrl: text("preview_url"),
    publishedUrl: text("published_url"),
    publishedAt: text("published_at"),
    refreshedAt: text("refreshed_at"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => ({ statusIdx: index("articles_status_idx").on(t.status) }),
);

export const clicks = sqliteTable("clicks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  articleSlug: text("article_slug"),
  product: text("product").notNull(),
  blockPosition: text("block_position"),
  country: text("country"),
  uaHash: text("ua_hash"),
  ts: text("ts").notNull().default(now),
});

export const runs = sqliteTable("runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  step: text("step").notNull(), // discover | match | generate | publish | report | refresh
  status: text("status").notNull().default("ok"), // ok | error | skipped
  inputSummary: text("input_summary"),
  outputSummary: text("output_summary"),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  apiCostUsd: real("api_cost_usd").notNull().default(0),
  error: text("error"),
  startedAt: text("started_at").notNull().default(now),
  finishedAt: text("finished_at"),
});

export type Cluster = typeof clusters.$inferSelect;
export type Keyword = typeof keywords.$inferSelect;
export type Affiliate = typeof affiliates.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type Run = typeof runs.$inferSelect;
