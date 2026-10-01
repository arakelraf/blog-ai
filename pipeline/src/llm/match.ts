import { z } from "zod";
import type { AnthropicService } from "../services/anthropic.js";
import type { Affiliate } from "../db/schema.js";
import type { RunHandle } from "../lib/runs.js";

export const matchResponseSchema = z.object({
  picks: z.array(
    z.object({
      name: z.string(),
      role: z.enum(["top_pick", "budget", "premium", "alternative"]),
      rationale: z.string(),
    }),
  ),
});
export type MatchResponse = z.infer<typeof matchResponseSchema>;

const SYSTEM =
  "You are an affiliate-marketing editor. Given a content topic and a list of candidate products (with real pricing and pros/cons), choose which products are genuinely relevant to the topic and assign each a role. Never invent products, prices, or facts — only use the candidates provided. Prefer 3-5 picks when available. Exactly one product should be top_pick.";

export async function matchClusterLLM(
  llm: AnthropicService,
  cluster: { title: string; pageType: string; category: string; primaryKeyword: string },
  candidates: Affiliate[],
  run?: RunHandle,
): Promise<MatchResponse> {
  const candidateView = candidates.map((c) => ({
    name: c.name,
    category: c.category,
    rating: c.rating,
    pricing: c.pricing,
    pros: c.pros,
    cons: c.cons,
  }));

  const user = `TOPIC: ${cluster.title}
PAGE TYPE: ${cluster.pageType}
PRIMARY KEYWORD: ${cluster.primaryKeyword}
CATEGORY: ${cluster.category}

CANDIDATE PRODUCTS (JSON):
${JSON.stringify(candidateView, null, 2)}

Return JSON: { "picks": [ { "name": <exact candidate name>, "role": "top_pick"|"budget"|"premium"|"alternative", "rationale": <one sentence> } ] }
Only include candidates that fit this topic. Use names exactly as given.`;

  return llm.completeJson(SYSTEM, user, matchResponseSchema, run, 2000);
}

/** Deterministic fallback when the LLM is not configured. */
export function matchClusterHeuristic(candidates: Affiliate[]): MatchResponse {
  if (candidates.length === 0) return { picks: [] };
  const priceOf = (a: Affiliate) => {
    const first = a.pricing?.[0]?.price ?? "";
    const n = Number(first.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : Infinity;
  };
  const byRating = [...candidates].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const byPrice = [...candidates].sort((a, b) => priceOf(a) - priceOf(b));
  const top = byRating[0]!;
  const budget = byPrice.find((a) => a.id !== top.id) ?? top;
  const premium = [...byPrice].reverse().find((a) => a.id !== top.id && a.id !== budget.id);

  const picks: MatchResponse["picks"] = [{ name: top.name, role: "top_pick", rationale: "Highest-rated option overall." }];
  if (budget.id !== top.id) picks.push({ name: budget.name, role: "budget", rationale: "Lowest entry price." });
  if (premium) picks.push({ name: premium.name, role: "premium", rationale: "Most capable higher-tier option." });
  for (const c of candidates) {
    if (!picks.find((p) => p.name === c.name)) picks.push({ name: c.name, role: "alternative", rationale: "Also worth considering." });
  }
  return { picks: picks.slice(0, 5) };
}
