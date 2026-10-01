import type { Affiliate } from "../db/schema.js";
import { articleSchema, type ArticleContent } from "../llm/article-schema.js";
import { findCliches, findRepeatedParagraphs, collectProse } from "./humanize.js";
import { slugify } from "../lib/util.js";

export interface QualityGateResult {
  passed: boolean;
  reasons: string[];
}

/**
 * Hard gate before publishing. Fails (with reasons) if:
 *  - the JSON doesn't validate against the article schema
 *  - fewer than 2 products with affiliate links
 *  - any product has no cons (dishonest)
 *  - prose contains cliches from the stop-list or repeated paragraphs
 *  - a price/number appears in prose that isn't backed by the affiliates table
 */
export function runQualityGate(
  article: unknown,
  affiliatesByName: Map<string, Affiliate>,
): QualityGateResult {
  const reasons: string[] = [];

  const parsed = articleSchema.safeParse(article);
  if (!parsed.success) {
    return { passed: false, reasons: ["schema validation failed: " + parsed.error.issues.map((i) => i.path.join(".")).join(", ")] };
  }
  const a: ArticleContent = parsed.data;

  // >= 2 products with affiliate links
  const withLinks = a.products.filter((p) => p.affiliateUrl && p.affiliateUrl.length > 0);
  if (withLinks.length < 2) reasons.push(`only ${withLinks.length} product(s) with affiliate links (need >= 2)`);

  // cons mandatory
  for (const p of a.products) {
    if (!p.cons || p.cons.length < 1) reasons.push(`product "${p.name}" has no cons`);
  }

  // cliches + repetition
  const prose = collectProse({
    lead: a.lead,
    promise: a.promise,
    products: a.products.map((p) => ({ tagline: p.tagline, forWho: p.forWho, review: p.review })),
    faq: a.faq,
    howToChoose: a.howToChoose,
    finalVerdict: a.finalVerdict,
  });
  const cliches = [...new Set(prose.flatMap((t) => findCliches(t)))];
  if (cliches.length) reasons.push(`cliches found: ${cliches.slice(0, 5).join(", ")}`);
  const paras = prose.filter((t) => t.length > 60);
  const dupes = findRepeatedParagraphs(paras);
  if (dupes.length) reasons.push(`repeated paragraphs: ${dupes.length}`);

  // facts grounding: any $-price in prose must exist in the affiliates table
  const allowedPrices = new Set<string>();
  for (const p of a.products) {
    const aff = affiliatesByName.get(slugify(p.name));
    for (const pr of aff?.pricing ?? []) allowedPrices.add(normalizePrice(pr.price));
    for (const pr of p.pricing) allowedPrices.add(normalizePrice(pr.price));
  }
  const priceRe = /\$\s?\d[\d,]*(?:\.\d+)?/g;
  const seenBad = new Set<string>();
  for (const t of prose) {
    for (const m of t.match(priceRe) ?? []) {
      if (!allowedPrices.has(normalizePrice(m))) seenBad.add(m.trim());
    }
  }
  if (seenBad.size) reasons.push(`prices not backed by affiliates table: ${[...seenBad].slice(0, 5).join(", ")}`);

  // every product must correspond to a known affiliate (no invented products)
  for (const p of a.products) {
    if (!affiliatesByName.has(slugify(p.name))) reasons.push(`product "${p.name}" is not in the affiliates table`);
  }

  return { passed: reasons.length === 0, reasons };
}

// Compare prices by their numeric value so "$29/mo" (table) matches "$29" (prose).
function normalizePrice(s: string): string {
  return s.replace(/[^0-9.]/g, "");
}
