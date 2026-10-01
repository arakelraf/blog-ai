import { describe, it, expect } from "vitest";
import { runQualityGate } from "../src/domain/qualitygate.js";
import { generateArticle, type MatchedProduct } from "../src/llm/generate.js";
import { AnthropicService } from "../src/services/anthropic.js";
import { slugify } from "../src/lib/util.js";
import type { Affiliate } from "../src/db/schema.js";

function makeAff(name: string, role: MatchedProduct["role"], price: string): Affiliate {
  return {
    id: Math.floor(Math.random() * 1e6),
    name,
    url: "https://x.example",
    affiliateLink: "https://x.example/aff",
    network: "Impact",
    commission: "30%",
    cookieDays: 60,
    category: "ai-writing",
    pros: ["Fast", "Clean editor"],
    cons: ["No desktop app"],
    pricing: [{ plan: "Starter", price }],
    promoCode: null,
    rating: 4.5,
    logoUrl: null,
    lastVerified: null,
    active: true,
    createdAt: "",
  } as Affiliate;
}

const llm = new AnthropicService({ CLAUDE_MODEL: "x", LLM_EFFORT: "low" } as never, false);
const matched: MatchedProduct[] = [
  { affiliate: makeAff("Quillify", "top_pick", "$29/mo"), role: "top_pick" },
  { affiliate: makeAff("Scribe", "budget", "$0"), role: "budget" },
];
const byName = new Map(matched.map((m) => [slugify(m.affiliate.name), m.affiliate]));
const serp = { keyword: "best ai writing tools", topHeadings: ["Best AI Writing Tools"], peopleAlsoAsk: ["Is there a free AI writer?"] };

describe("runQualityGate", () => {
  it("passes a clean, fact-grounded article", async () => {
    const article = await generateArticle(llm, { title: "Best AI Writing Tools (2026)", slug: "s", primaryKeyword: "best ai writing tools", pageType: "best-list", category: "ai-writing" }, matched, serp);
    const r = runQualityGate(article, byName);
    expect(r.passed).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it("fails when a product has no cons", async () => {
    const article: any = await generateArticle(llm, { title: "T", slug: "s", primaryKeyword: "k", pageType: "best-list", category: "ai-writing" }, matched, serp);
    article.products[0].cons = [];
    expect(runQualityGate(article, byName).passed).toBe(false);
  });

  it("fails on a cliche and on an unbacked price", async () => {
    const article: any = await generateArticle(llm, { title: "T", slug: "s", primaryKeyword: "k", pageType: "best-list", category: "ai-writing" }, matched, serp);
    article.lead = "In today's digital age, this tool costs $999/mo and will revolutionize everything.";
    const r = runQualityGate(article, byName);
    expect(r.passed).toBe(false);
    expect(r.reasons.some((x) => x.includes("cliche"))).toBe(true);
    expect(r.reasons.some((x) => x.includes("$999"))).toBe(true);
  });

  it("fails when fewer than 2 products have affiliate links", async () => {
    const article: any = await generateArticle(llm, { title: "T", slug: "s", primaryKeyword: "k", pageType: "best-list", category: "ai-writing" }, matched, serp);
    article.products[0].affiliateUrl = "";
    expect(runQualityGate(article, byName).passed).toBe(false);
  });
});
