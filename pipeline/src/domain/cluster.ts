import type { PageType } from "./intent.js";
import { slugify } from "../lib/util.js";

export interface ScoredKeyword {
  keyword: string;
  volume: number;
  difficulty: number;
  cpc: number;
  pageType: PageType;
  source: string;
  category: string;
}

export interface KeywordCluster {
  slug: string;
  title: string;
  primaryKeyword: string;
  pageType: PageType;
  category: string;
  members: ScoredKeyword[];
  volume: number; // max member volume
  difficulty: number; // volume-weighted-ish: use primary's
  cpc: number; // max member cpc
}

// Words stripped when deriving a cluster's core subject.
const STOP = new Set([
  "best", "top", "the", "a", "an", "for", "of", "to", "in", "and", "with",
  "review", "reviews", "pricing", "price", "cost", "discount", "coupon", "promo",
  "deal", "deals", "cheapest", "cheap", "free", "alternative", "alternatives",
  "vs", "versus", "tool", "tools", "software", "app", "apps", "online",
  "small", "business", "startups", "startup", "agencies", "agency", "beginners",
  "beginner", "ecommerce", "teams", "team", "content", "creators", "creator",
]);

function coreSubject(keyword: string): string {
  const year = new Date().getFullYear().toString();
  const tokens = keyword
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && t !== year && !STOP.has(t));
  // "ai" is meaningful in this niche — keep it but sort for order-independence.
  return tokens.sort().join(" ");
}

/**
 * Cluster synonymous keywords: one cluster == one page.
 * Signature = pageType + core subject (template words & audiences removed).
 */
export function clusterKeywords(keywords: ScoredKeyword[]): KeywordCluster[] {
  const bySig = new Map<string, ScoredKeyword[]>();
  for (const kw of keywords) {
    const sig = `${kw.pageType}::${coreSubject(kw.keyword)}`;
    const arr = bySig.get(sig) ?? [];
    arr.push(kw);
    bySig.set(sig, arr);
  }

  const clusters: KeywordCluster[] = [];
  for (const members of bySig.values()) {
    members.sort((a, b) => b.volume - a.volume);
    const primary = members[0]!;
    const title = toTitle(primary.keyword, primary.pageType);
    clusters.push({
      slug: slugify(title),
      title,
      primaryKeyword: primary.keyword,
      pageType: primary.pageType,
      category: primary.category,
      members,
      volume: Math.max(...members.map((m) => m.volume)),
      difficulty: primary.difficulty,
      cpc: Math.max(...members.map((m) => m.cpc)),
    });
  }
  return clusters;
}

function toTitle(keyword: string, pageType: PageType): string {
  const cap = (s: string) =>
    s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bAi\b/g, "AI").replace(/\bSeo\b/g, "SEO");
  const year = new Date().getFullYear();
  const base = cap(keyword);
  switch (pageType) {
    case "best-list":
      return `${base} (${year})`;
    case "versus":
      return cap(keyword);
    case "review":
      return `${base}: Honest Review (${year})`;
    case "alternatives":
      return `${base} (${year})`;
    case "deal":
      return `${base} — Deals & Pricing (${year})`;
  }
}
