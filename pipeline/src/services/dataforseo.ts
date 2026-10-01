import type { Env } from "../config/index.js";
import { withRetry } from "../lib/retry.js";
import { seededRandom } from "../lib/util.js";
import { logger } from "../lib/logger.js";

export interface KeywordIdea {
  keyword: string;
  volume: number;
  difficulty: number;
  cpc: number;
  source: "suggestions" | "related" | "autocomplete";
}

export interface SerpSnapshot {
  keyword: string;
  topHeadings: string[]; // H1-H3 of competitors
  peopleAlsoAsk: string[];
}

const BASE = "https://api.dataforseo.com";

export class DataForSeoService {
  constructor(private env: Env, private live: boolean) {}

  get isLive(): boolean {
    return this.live;
  }

  private authHeader(): string {
    const token = Buffer.from(`${this.env.DATAFORSEO_LOGIN}:${this.env.DATAFORSEO_PASSWORD}`).toString("base64");
    return `Basic ${token}`;
  }

  private async post<T>(path: string, payload: unknown): Promise<T> {
    return withRetry(
      async () => {
        const res = await fetch(`${BASE}${path}`, {
          method: "POST",
          headers: { Authorization: this.authHeader(), "Content-Type": "application/json" },
          body: JSON.stringify([payload]),
        });
        if (!res.ok) throw new Error(`DataForSEO ${path} -> ${res.status}`);
        return (await res.json()) as T;
      },
      { label: `dataforseo ${path}` },
    );
  }

  /** Keyword ideas for a seed topic across suggestions + related + autocomplete. */
  async keywordIdeas(seed: string, market: { locationCode: number; languageCode: string }, limit: number): Promise<KeywordIdea[]> {
    if (!this.live) return this.mockIdeas(seed, limit);
    try {
      const ideas: KeywordIdea[] = [];

      const sugg = await this.post<DfsResponse>("/v3/dataforseo_labs/google/keyword_suggestions/live", {
        keyword: seed,
        location_code: market.locationCode,
        language_code: market.languageCode,
        limit,
      });
      ideas.push(...mapDfs(sugg, "suggestions"));

      const related = await this.post<DfsResponse>("/v3/dataforseo_labs/google/related_keywords/live", {
        keyword: seed,
        location_code: market.locationCode,
        language_code: market.languageCode,
        limit,
      });
      ideas.push(...mapDfs(related, "related"));

      return ideas;
    } catch (err) {
      logger.error({ err }, "DataForSEO live call failed; falling back to mock for this seed");
      return this.mockIdeas(seed, limit);
    }
  }

  /** Top-10 SERP headings + People Also Ask for a keyword (Stage 4 input). */
  async serpSnapshot(keyword: string, market: { locationCode: number; languageCode: string }): Promise<SerpSnapshot> {
    if (!this.live) return this.mockSerp(keyword);
    try {
      const res = await this.post<DfsResponse>("/v3/serp/google/organic/live/advanced", {
        keyword,
        location_code: market.locationCode,
        language_code: market.languageCode,
        depth: 10,
      });
      const items = res.tasks?.[0]?.result?.[0]?.items ?? [];
      const topHeadings = items
        .filter((i) => i.type === "organic")
        .map((i) => i.title)
        .filter((t): t is string => !!t)
        .slice(0, 10);
      const peopleAlsoAsk = items
        .filter((i) => i.type === "people_also_ask")
        .flatMap((i) => (i.items ?? []).map((q) => q.title).filter((t): t is string => !!t));
      return { keyword, topHeadings, peopleAlsoAsk };
    } catch (err) {
      logger.error({ err }, "DataForSEO SERP call failed; falling back to mock");
      return this.mockSerp(keyword);
    }
  }

  // ---- Mock generators (deterministic, clearly synthetic) ----

  private mockIdeas(seed: string, limit: number): KeywordIdea[] {
    const audiences = ["small business", "startups", "agencies", "beginners", "ecommerce", "content creators", "teams"];
    const templates: ((s: string, a?: string) => string)[] = [
      (s) => `best ${s}`,
      (s) => `top ${s}`,
      (s, a) => `best ${s} for ${a}`,
      (s) => `${s} review`,
      (s) => `${s} pricing`,
      (s) => `${s} alternatives`,
      (s) => `cheapest ${s}`,
      (s) => `${s} discount`,
      (s) => `free ${s}`,
      // informational — should be filtered out by the intent stage
      (s) => `what is ${s}`,
      (s) => `how does ${s} work`,
    ];
    const base = seed.replace(/^(ai\s+)/i, "AI ");
    const ideas: KeywordIdea[] = [];
    for (const tpl of templates) {
      const variants = tpl.length >= 2 ? audiences.slice(0, 4).map((a) => tpl(base, a)) : [tpl(base)];
      for (const kw of variants) {
        const r = seededRandom(kw);
        ideas.push({
          keyword: kw.toLowerCase(),
          volume: Math.round(200 + r * 9800),
          difficulty: Math.round(10 + seededRandom(kw + "d") * 70),
          cpc: Math.round((0.5 + seededRandom(kw + "c") * 12) * 100) / 100,
          source: r > 0.5 ? "suggestions" : "related",
        });
      }
    }
    // add a few autocomplete-style long tails
    for (const a of audiences) {
      const kw = `best ${base} ${new Date().getFullYear()}`.toLowerCase();
      if (!ideas.find((i) => i.keyword === kw)) {
        ideas.push({
          keyword: kw,
          volume: Math.round(500 + seededRandom(kw) * 5000),
          difficulty: Math.round(20 + seededRandom(kw + "d") * 50),
          cpc: Math.round((1 + seededRandom(kw + "c") * 10) * 100) / 100,
          source: "autocomplete",
        });
      }
      void a;
    }
    return ideas.slice(0, limit);
  }

  private mockSerp(keyword: string): SerpSnapshot {
    return {
      keyword,
      topHeadings: [
        `The Best Tools for ${keyword} (ranked)`,
        `${keyword}: Top Picks Compared`,
        `How We Tested`,
        `Pricing & Plans`,
        `Pros and Cons`,
        `FAQ`,
      ],
      peopleAlsoAsk: [
        `What is the best option for ${keyword}?`,
        `Is there a free ${keyword}?`,
        `How much does ${keyword} cost?`,
        `Which ${keyword} is best for beginners?`,
      ],
    };
  }
}

// ---- DataForSEO response mapping ----
interface DfsItem {
  keyword?: string;
  keyword_info?: { search_volume?: number; cpc?: number; competition?: number };
  keyword_properties?: { keyword_difficulty?: number };
  type?: string;
  title?: string;
  items?: { title?: string }[];
}
interface DfsResponse {
  tasks?: { result?: { items?: DfsItem[] }[] }[];
}

function mapDfs(res: DfsResponse, source: "suggestions" | "related"): KeywordIdea[] {
  const items = res.tasks?.[0]?.result?.[0]?.items ?? [];
  return items
    .filter((i) => i.keyword)
    .map((i) => ({
      keyword: i.keyword!.toLowerCase(),
      volume: i.keyword_info?.search_volume ?? 0,
      difficulty: i.keyword_properties?.keyword_difficulty ?? Math.round((i.keyword_info?.competition ?? 0) * 100),
      cpc: i.keyword_info?.cpc ?? 0,
      source,
    }));
}
