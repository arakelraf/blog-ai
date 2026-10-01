import { describe, it, expect } from "vitest";
import { generateArticle, type MatchedProduct } from "../src/llm/generate.js";
import { articleSchema } from "../src/llm/article-schema.js";
import { AnthropicService } from "../src/services/anthropic.js";
import type { Affiliate } from "../src/db/schema.js";

const aff = (name: string, role: MatchedProduct["role"], price: string): MatchedProduct => ({
  role,
  affiliate: {
    id: Math.floor(Math.random() * 1000),
    name,
    url: "https://x.example",
    affiliateLink: "https://x.example/aff",
    network: "Impact",
    commission: "30%",
    cookieDays: 60,
    category: "ai-writing",
    pros: ["Fast output", "Clean editor"],
    cons: ["No desktop app"],
    pricing: [{ plan: "Starter", price }],
    promoCode: null,
    rating: 4.5,
    logoUrl: null,
    lastVerified: null,
    active: true,
    createdAt: "",
  } as Affiliate,
});

const llm = new AnthropicService({ CLAUDE_MODEL: "x", LLM_EFFORT: "low" } as never, false);

describe("generateArticle (mock prose)", () => {
  it("produces a schema-valid article grounded in affiliate facts", async () => {
    const matched = [aff("Quillify", "top_pick", "$29/mo"), aff("Scribe", "budget", "$0"), aff("DraftForge", "premium", "$99/mo")];
    const serp = { keyword: "best ai writing tools", topHeadings: ["Best AI Writing Tools"], peopleAlsoAsk: ["Is there a free AI writer?", "Will Google penalize AI content?"] };
    const article = await generateArticle(
      llm,
      { title: "Best AI Writing Tools (2026)", slug: "best-ai-writing-tools-2026", primaryKeyword: "best ai writing tools", pageType: "best-list", category: "ai-writing" },
      matched,
      serp,
    );

    // Schema validity (also what the site enforces).
    expect(() => articleSchema.parse(article)).not.toThrow();

    // Facts grounded from DB, not invented.
    const q = article.products.find((p) => p.name === "Quillify")!;
    expect(q.pricing[0]!.price).toBe("$29/mo");
    expect(q.cons.length).toBeGreaterThanOrEqual(1); // cons mandatory

    // QuickPick ids reference real products.
    const ids = new Set(article.products.map((p) => p.id));
    expect(ids.has(article.quickPick.overall)).toBe(true);
    expect(ids.has(article.finalVerdict.winnerId)).toBe(true);
    expect(article.faq.length).toBeGreaterThanOrEqual(3);
  });
});
