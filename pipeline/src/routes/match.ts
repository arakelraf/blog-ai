import type { FastifyInstance } from "fastify";
import { eq, and, inArray } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { db } from "../db/client.js";
import { clusters, affiliates, clusterAffiliates, type Affiliate } from "../db/schema.js";
import { computeScore } from "../domain/scoring.js";
import { matchClusterLLM, matchClusterHeuristic } from "../llm/match.js";
import { startRun, spendToday } from "../lib/runs.js";
import { logger } from "../lib/logger.js";

// Suggested networks to join per category (names only — no invented terms).
const NETWORK_SUGGESTIONS: Record<string, string[]> = {
  "ai-writing": ["PartnerStack", "Impact", "direct (Jasper, Writesonic, Copy.ai)"],
  "ai-website-builders": ["Impact", "PartnerStack", "direct (Wix, Squarespace, Hostinger)"],
  "ai-seo": ["Impact", "PartnerStack", "direct (Surfer, Semrush, Ahrefs)"],
  "ai-image": ["PartnerStack", "direct (Canva, Adobe)"],
  "ai-video": ["PartnerStack", "Impact", "direct (Synthesia, HeyGen, Descript)"],
  "ai-chatbots": ["PartnerStack", "Impact"],
  "ai-automation": ["PartnerStack", "Impact", "direct (Make, Zapier)"],
  "ai-coding": ["PartnerStack", "Impact"],
};

export interface MatchResult {
  status: "ok" | "skipped";
  reason?: string;
  clustersConsidered: number;
  matched: number;
  noMonetization: number;
  selectedToday: { slug: string; title: string; score: number; products: number }[];
  noMonetizationReport: { category: string; count: number; suggestNetworks: string[] }[];
}

export async function match(ctx: AppContext): Promise<MatchResult> {
  const run = startRun("match");
  if (spendToday() >= ctx.niche.budget.dailyUsd) {
    run.finish("skipped", "daily budget exceeded");
    return { status: "skipped", reason: "daily budget exceeded", clustersConsidered: 0, matched: 0, noMonetization: 0, selectedToday: [], noMonetizationReport: [] };
  }

  // Reconsider both brand-new clusters and ones previously parked as
  // no_monetization (affiliates may have been added since).
  const newClusters = db
    .select()
    .from(clusters)
    .where(inArray(clusters.status, ["new", "no_monetization"]))
    .all();
  const activeAffiliates = db.select().from(affiliates).where(eq(affiliates.active, true)).all();
  const byCategory = new Map<string, Affiliate[]>();
  for (const a of activeAffiliates) {
    const arr = byCategory.get(a.category) ?? [];
    arr.push(a);
    byCategory.set(a.category, arr);
  }

  let matched = 0;
  let noMon = 0;

  for (const c of newClusters) {
    const candidates = byCategory.get(c.category) ?? [];

    if (candidates.length < 2) {
      db.update(clusters).set({ status: "no_monetization", score: 0 }).where(eq(clusters.id, c.id)).run();
      noMon++;
      continue;
    }

    // Pick products + roles (LLM if available, deterministic otherwise).
    let picks;
    try {
      picks = ctx.llm.isLive
        ? (await matchClusterLLM(ctx.llm, c, candidates, run)).picks
        : matchClusterHeuristic(candidates).picks;
    } catch (err) {
      logger.warn({ err, cluster: c.slug }, "LLM match failed; using heuristic");
      picks = matchClusterHeuristic(candidates).picks;
    }

    // Resolve pick names to affiliate rows.
    const resolved = picks
      .map((p) => ({ aff: candidates.find((a) => a.name.toLowerCase() === p.name.toLowerCase()), p }))
      .filter((x): x is { aff: Affiliate; p: (typeof picks)[number] } => !!x.aff);

    if (resolved.length < 2) {
      db.update(clusters).set({ status: "no_monetization", score: 0 }).where(eq(clusters.id, c.id)).run();
      noMon++;
      continue;
    }

    // Replace prior matches.
    db.delete(clusterAffiliates).where(eq(clusterAffiliates.clusterId, c.id)).run();
    resolved.forEach((r, i) => {
      db.insert(clusterAffiliates)
        .values({ clusterId: c.id, affiliateId: r.aff.id, role: r.p.role, rationale: r.p.rationale, position: i })
        .run();
    });

    const score = computeScore(
      { volume: c.volume, difficulty: c.difficulty, cpc: c.cpc, matchedAffiliates: resolved.length },
      ctx.niche.scoring,
    );
    db.update(clusters).set({ status: "matched", score }).where(eq(clusters.id, c.id)).run();
    matched++;
  }

  // Select today's top-N among all matched clusters above threshold.
  const matchedClusters = db.select().from(clusters).where(eq(clusters.status, "matched")).all();
  const selected = matchedClusters
    .filter((c) => c.score >= ctx.niche.scoring.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, ctx.niche.scoring.topNPerDay);

  const selectedWithCounts = selected.map((c) => {
    const n = db.select().from(clusterAffiliates).where(eq(clusterAffiliates.clusterId, c.id)).all().length;
    return { slug: c.slug, title: c.title, score: c.score, products: n };
  });

  const result: MatchResult = {
    status: "ok",
    clustersConsidered: newClusters.length,
    matched,
    noMonetization: noMon,
    selectedToday: selectedWithCounts,
    noMonetizationReport: buildNoMonetizationReport(),
  };
  run.finish("ok", `matched ${matched}, no_monetization ${noMon}, selected ${selected.length}`);
  logger.info({ matched, noMon, selected: selected.length }, "match complete");
  return result;
}

export function buildNoMonetizationReport(): MatchResult["noMonetizationReport"] {
  const rows = db.select().from(clusters).where(eq(clusters.status, "no_monetization")).all();
  const byCat = new Map<string, number>();
  for (const r of rows) byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
  return [...byCat.entries()]
    .map(([category, count]) => ({ category, count, suggestNetworks: NETWORK_SUGGESTIONS[category] ?? ["Impact", "PartnerStack"] }))
    .sort((a, b) => b.count - a.count);
}

/** Return clusters ready to generate today (used by Stage 4). */
export function selectedClusterIds(ctx: AppContext): number[] {
  const matchedClusters = db
    .select()
    .from(clusters)
    .where(and(eq(clusters.status, "matched")))
    .all();
  return matchedClusters
    .filter((c) => c.score >= ctx.niche.scoring.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, ctx.niche.scoring.topNPerDay)
    .map((c) => c.id);
}

export function registerMatch(app: FastifyInstance, ctx: AppContext): void {
  app.post("/match", async () => match(ctx));
  app.get("/report/no-monetization", async () => ({ report: buildNoMonetizationReport() }));
}
