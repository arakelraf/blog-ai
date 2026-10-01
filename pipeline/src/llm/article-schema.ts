import { z } from "zod";

/**
 * The article content contract. Mirrors site/src/content/config.ts exactly.
 * /generate produces JSON validated against this; the Astro components render it.
 */
export const pricingSchema = z.object({
  plan: z.string(),
  price: z.string(),
  note: z.string().optional(),
});

export const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  logo: z.string().optional(),
  role: z.enum(["top_pick", "budget", "premium", "alternative"]),
  rating: z.number().min(0).max(5),
  tagline: z.string(),
  forWho: z.string(),
  keyFeatures: z.array(z.string()).min(2),
  pros: z.array(z.string()).min(2),
  cons: z.array(z.string()).min(1),
  pricing: z.array(pricingSchema),
  promoCode: z.string().optional(),
  affiliateUrl: z.string(),
  review: z.array(z.string()).min(1),
});

export const articleSchema = z.object({
  title: z.string(),
  metaTitle: z.string(),
  metaDescription: z.string(),
  year: z.number(),
  promise: z.string(),
  lead: z.string(),
  category: z.string(),
  categorySlug: z.string(),
  pageType: z.enum(["best-list", "versus", "review", "alternatives", "deal"]),
  author: z.string(),
  authorSlug: z.string(),
  publishDate: z.string(),
  updatedDate: z.string().optional(),
  demo: z.boolean().default(false),
  quickPick: z.object({ overall: z.string(), budget: z.string(), premium: z.string() }),
  products: z.array(productSchema).min(1),
  comparison: z.object({
    columns: z.array(z.string()),
    rows: z.array(z.object({ productId: z.string(), values: z.array(z.string()) })),
  }),
  howToChoose: z.object({
    intro: z.string(),
    criteria: z.array(z.object({ title: z.string(), body: z.string() })).min(2),
  }),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).min(3),
  finalVerdict: z.object({ winnerId: z.string(), body: z.array(z.string()).min(1) }),
  related: z.array(z.string()).default([]),
});

export type ArticleContent = z.infer<typeof articleSchema>;
export type ProductContent = z.infer<typeof productSchema>;

/** The LLM writes prose only; facts (pricing/pros/cons/rating) are merged from the DB. */
export const llmProseSchema = z.object({
  metaTitle: z.string(),
  metaDescription: z.string(),
  promise: z.string(),
  lead: z.string(),
  products: z.array(
    z.object({
      id: z.string(),
      tagline: z.string(),
      forWho: z.string(),
      keyFeatures: z.array(z.string()).min(2),
      review: z.array(z.string()).min(1),
    }),
  ),
  comparisonColumns: z.array(z.string()).min(2),
  comparisonRows: z.array(z.object({ productId: z.string(), values: z.array(z.string()) })),
  howToChoose: z.object({
    intro: z.string(),
    criteria: z.array(z.object({ title: z.string(), body: z.string() })).min(2),
  }),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).min(3),
  finalVerdict: z.object({ winnerId: z.string(), body: z.array(z.string()).min(1) }),
});
export type LlmProse = z.infer<typeof llmProseSchema>;
