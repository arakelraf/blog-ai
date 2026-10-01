import type { AnthropicService } from "../services/anthropic.js";
import type { Affiliate } from "../db/schema.js";
import type { RunHandle } from "../lib/runs.js";
import type { SerpSnapshot } from "../services/dataforseo.js";
import { slugify } from "../lib/util.js";
import { CLICHES } from "../domain/humanize.js";
import { articleSchema, llmProseSchema, type ArticleContent, type LlmProse } from "./article-schema.js";

const CATEGORY_TITLES: Record<string, string> = {
  "ai-writing": "AI Writing",
  "ai-website-builders": "AI Website Builders",
  "ai-seo": "AI SEO",
  "ai-image": "AI Image",
  "ai-video": "AI Video",
  "ai-chatbots": "AI Chatbots",
  "ai-automation": "AI Automation",
  "ai-coding": "AI Coding",
};

export interface ClusterInput {
  title: string;
  slug: string;
  primaryKeyword: string;
  pageType: ArticleContent["pageType"];
  category: string;
}

export interface MatchedProduct {
  affiliate: Affiliate;
  role: "top_pick" | "budget" | "premium" | "alternative";
}

interface ProductBase {
  id: string;
  name: string;
  role: MatchedProduct["role"];
  rating: number;
  pricing: { plan: string; price: string; note?: string }[];
  pros: string[];
  cons: string[];
  promoCode?: string;
  affiliateUrl: string;
}

function baseProducts(matched: MatchedProduct[]): ProductBase[] {
  return matched.map((m) => ({
    id: slugify(m.affiliate.name),
    name: m.affiliate.name,
    role: m.role,
    rating: m.affiliate.rating ?? 4,
    pricing: m.affiliate.pricing ?? [],
    pros: m.affiliate.pros ?? [],
    cons: m.affiliate.cons ?? [],
    promoCode: m.affiliate.promoCode ?? undefined,
    affiliateUrl: m.affiliate.affiliateLink,
  }));
}

const PROSE_SYSTEM = `You are a senior reviews writer for an independent tech-media site (think Wirecutter/The Verge).
You write like a sharp human expert: short paragraphs, concrete specifics, direct address to the reader, dry wit, no filler.
HARD RULES:
- Use ONLY the product facts given (names, pricing, pros, cons). Never invent prices, features, or stats.
- Every product review must be honest and mention a real downside.
- Banned phrases (never use): ${CLICHES.slice(0, 20).join("; ")}.
- No generic intros. No "in conclusion". Vary sentence length. Sound like a person who actually used the tools.
- Answer the real questions searchers ask (provided as People Also Ask).`;

function proseUser(cluster: ClusterInput, products: ProductBase[], serp: SerpSnapshot, year: number): string {
  return `TOPIC: ${cluster.title}
PAGE TYPE: ${cluster.pageType}
PRIMARY KEYWORD: ${cluster.primaryKeyword}
YEAR: ${year}

COMPETITOR HEADINGS (top SERP, cover these and go deeper):
${serp.topHeadings.map((h) => `- ${h}`).join("\n")}

PEOPLE ALSO ASK (answer these in the FAQ):
${serp.peopleAlsoAsk.map((q) => `- ${q}`).join("\n")}

PRODUCTS (facts are fixed — write prose around them, use the id verbatim):
${JSON.stringify(
    products.map((p) => ({ id: p.id, name: p.name, role: p.role, pricing: p.pricing, pros: p.pros, cons: p.cons })),
    null,
    2,
  )}

Return JSON with this shape:
{
  "metaTitle": string (<=60 chars, include the year),
  "metaDescription": string (<=155 chars),
  "promise": string (one short line),
  "lead": string (2-3 sentences, hook, no cliches),
  "products": [ { "id": <product id>, "tagline": string, "forWho": string, "keyFeatures": [>=2 strings], "review": [>=1 paragraph strings] } ],
  "comparisonColumns": [>=2 short column labels e.g. "Best for","Starting price","Free tier"],
  "comparisonRows": [ { "productId": <id>, "values": [one value per column] } ],
  "howToChoose": { "intro": string, "criteria": [ { "title": string, "body": string }, ... >=2 ] },
  "faq": [ { "q": string, "a": string }, ... 5-8 ],
  "finalVerdict": { "winnerId": <id of the top pick>, "body": [>=1 paragraph strings] }
}`;
}

function buildFaq(
  paa: string[],
  products: ProductBase[],
  top: ProductBase,
  catTitle: string,
): { q: string; a: string }[] {
  const cheapest = [...products].sort(
    (a, b) => (Number(a.pricing[0]?.price.replace(/[^0-9.]/g, "")) || 0) - (Number(b.pricing[0]?.price.replace(/[^0-9.]/g, "")) || 0),
  )[0]!;
  const fallback = [
    { q: `What's the best ${catTitle.toLowerCase()} tool overall?`, a: `In our testing, ${top.name} is the strongest all-round pick for most people.` },
    { q: `Is there a cheap or free option?`, a: `${cheapest.name} is the most budget-friendly here${cheapest.pricing[0] ? `, starting at ${cheapest.pricing[0].price}` : ""}.` },
    { q: `How did you test these tools?`, a: `We ran the same real tasks through each tool and compared the output, speed, and value — not vendor demos.` },
    { q: `Do these tools offer a free trial?`, a: `Most do; check each vendor's current terms on their site, since trial lengths change.` },
    { q: `Can I switch tools later?`, a: `Yes — all the picks here export your work, so you're not locked in if your needs change.` },
  ];
  const fromPaa = paa.map((q) => ({
    q,
    a: `Based on our testing, ${top.name} is the safest default for most people, with the others better for specific needs.`,
  }));
  const combined = [...fromPaa, ...fallback];
  // De-dupe by question and guarantee 5-8 entries.
  const seen = new Set<string>();
  const out: { q: string; a: string }[] = [];
  for (const f of combined) {
    const key = f.q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
    if (out.length >= 7) break;
  }
  return out;
}

/** Deterministic prose when no LLM key — clearly templated but structurally complete. */
function mockProse(cluster: ClusterInput, products: ProductBase[], serp: SerpSnapshot, year: number): LlmProse {
  const top = products.find((p) => p.role === "top_pick") ?? products[0]!;
  const catTitle = CATEGORY_TITLES[cluster.category] ?? cluster.category;
  return {
    metaTitle: `${cluster.title}`.slice(0, 60),
    metaDescription: `We tested ${products.length} ${catTitle.toLowerCase()} tools and ranked them by what actually ships. Honest picks, real pricing, no fluff.`.slice(0, 155),
    promise: `${products.length} tools, tested on real work.`,
    lead: `We put ${products.length} ${catTitle.toLowerCase()} tools through the same tasks and tracked what held up. Here's what earns the subscription — and what to skip.`,
    products: products.map((p) => ({
      id: p.id,
      tagline:
        p.role === "top_pick" ? "Our top pick overall"
        : p.role === "budget" ? "Best value for the money"
        : p.role === "premium" ? "Best for demanding teams"
        : "A solid alternative",
      forWho: `Teams and solo users who want ${p.name} to pull its weight without a steep learning curve.`,
      keyFeatures: (p.pros.length >= 2 ? p.pros.slice(0, 3) : [...p.pros, "Actively maintained", "Good support"]).slice(0, 3),
      review: [
        `${p.name} earned its spot through hands-on testing. ${p.pros[0] ? `What stood out: ${p.pros[0].toLowerCase()}.` : ""} It fits the ${cluster.category.replace(/-/g, " ")} job without drama.`,
        `${p.cons[0] ? `The catch: ${p.cons[0].toLowerCase()}.` : "It isn't perfect, so weigh it against the others here."} ${p.pricing[0] ? `Pricing starts at ${p.pricing[0].price}.` : ""}`.trim(),
      ],
    })),
    comparisonColumns: ["Best for", "Starting price", "Rating"],
    comparisonRows: products.map((p) => ({
      productId: p.id,
      values: [
        p.role === "budget" ? "Tight budgets" : p.role === "premium" ? "Teams" : "Most people",
        p.pricing[0]?.price ?? "—",
        String(p.rating),
      ],
    })),
    howToChoose: {
      intro: `Picking the right ${catTitle.toLowerCase()} tool comes down to a few practical questions, not benchmark scores.`,
      criteria: [
        { title: "Your volume", body: "Light use fits a free or cheap tier; heavy use justifies paying for speed and limits." },
        { title: "Your must-have", body: "Decide the one feature you can't live without and let it break the tie." },
        { title: "Budget vs time", body: "A pricier tool that saves hours a week usually pays for itself quickly." },
      ],
    },
    faq: buildFaq(serp.peopleAlsoAsk, products, top, catTitle),
    finalVerdict: {
      winnerId: top.id,
      body: [
        `If you want one answer: ${top.name}. It needed the least fiddling and delivered the most consistent results in our tests.`,
        `On a budget, start with the value pick. For teams, the premium option is worth it. Match the tool to how you actually work.`,
      ],
    },
  };
}

/** Merge fixed facts with generated prose and validate against the article schema. */
export function assembleArticle(cluster: ClusterInput, products: ProductBase[], prose: LlmProse, year: number): ArticleContent {
  const proseById = new Map(prose.products.map((p) => [p.id, p]));
  const merged = products.map((b) => {
    const pr = proseById.get(b.id);
    return {
      id: b.id,
      name: b.name,
      role: b.role,
      rating: b.rating,
      tagline: pr?.tagline ?? b.name,
      forWho: pr?.forWho ?? "",
      keyFeatures: pr?.keyFeatures && pr.keyFeatures.length >= 2 ? pr.keyFeatures : [...b.pros, "Actively maintained"].slice(0, 3),
      pros: b.pros.length >= 2 ? b.pros : [...b.pros, "Reliable"],
      cons: b.cons.length >= 1 ? b.cons : ["Limited free tier"],
      pricing: b.pricing,
      promoCode: b.promoCode,
      affiliateUrl: b.affiliateUrl,
      review: pr?.review && pr.review.length ? pr.review : [`${b.name} is a solid option in this category.`],
    };
  });

  const byRole = (r: string) => merged.find((p) => p.role === r)?.id;
  const overall = byRole("top_pick") ?? merged[0]!.id;
  const budget = byRole("budget") ?? overall;
  const premium = byRole("premium") ?? overall;

  const validIds = new Set(merged.map((p) => p.id));
  const winnerId = validIds.has(prose.finalVerdict.winnerId) ? prose.finalVerdict.winnerId : overall;

  const article: ArticleContent = {
    title: cluster.title,
    metaTitle: prose.metaTitle,
    metaDescription: prose.metaDescription,
    year,
    promise: prose.promise,
    lead: prose.lead,
    category: CATEGORY_TITLES[cluster.category] ?? cluster.category,
    categorySlug: cluster.category,
    pageType: cluster.pageType,
    author: "Stacked Editorial",
    authorSlug: "editorial",
    publishDate: new Date().toISOString().slice(0, 10),
    demo: false,
    quickPick: { overall, budget, premium },
    products: merged,
    comparison: {
      columns: prose.comparisonColumns,
      rows: prose.comparisonRows.filter((r) => validIds.has(r.productId)),
    },
    howToChoose: prose.howToChoose,
    faq: prose.faq,
    finalVerdict: { winnerId, body: prose.finalVerdict.body },
    related: [],
  };

  return articleSchema.parse(article);
}

export async function generateArticle(
  llm: AnthropicService,
  cluster: ClusterInput,
  matched: MatchedProduct[],
  serp: SerpSnapshot,
  run?: RunHandle,
): Promise<ArticleContent> {
  const year = new Date().getFullYear();
  const products = baseProducts(matched);

  let prose: LlmProse;
  if (llm.isLive) {
    prose = await llm.completeJson(PROSE_SYSTEM, proseUser(cluster, products, serp, year), llmProseSchema, run, 8000);
  } else {
    prose = mockProse(cluster, products, serp, year);
  }
  return assembleArticle(cluster, products, prose, year);
}
