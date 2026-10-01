import { defineCollection, z } from "astro:content";

/**
 * The structured article contract.
 * The pipeline's /generate endpoint produces JSON validated against THIS schema,
 * and the Astro components render it. One schema, two consumers — never drift.
 */
const productRole = z.enum(["top_pick", "budget", "premium", "alternative"]);

const pricing = z.object({
  plan: z.string(),
  price: z.string(), // human string, e.g. "$49 / mo" — only from the affiliates table
  note: z.string().optional(),
});

const product = z.object({
  id: z.string(), // slug used in /go/{id}
  name: z.string(),
  logo: z.string().optional(), // path or emoji fallback handled in component
  role: productRole,
  rating: z.number().min(0).max(5),
  tagline: z.string(),
  forWho: z.string(),
  keyFeatures: z.array(z.string()).min(2),
  pros: z.array(z.string()).min(2),
  cons: z.array(z.string()).min(1), // cons are MANDATORY (honesty + quality gate)
  pricing: z.array(pricing).default([]),
  promoCode: z.string().optional(),
  affiliateUrl: z.string(), // final destination; site links go through /go/{id}
  review: z.array(z.string()).min(1), // paragraphs
});

const articleSchema = z.object({
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
  publishDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  demo: z.boolean().default(false), // marks fake-data demo pages
  quickPick: z.object({
    overall: z.string(), // product id
    budget: z.string(),
    premium: z.string(),
  }),
  products: z.array(product).min(1),
  comparison: z.object({
    columns: z.array(z.string()),
    rows: z.array(
      z.object({
        productId: z.string(),
        values: z.array(z.string()),
      }),
    ),
  }),
  howToChoose: z.object({
    intro: z.string(),
    criteria: z.array(z.object({ title: z.string(), body: z.string() })).min(2),
  }),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).min(3),
  finalVerdict: z.object({ winnerId: z.string(), body: z.array(z.string()).min(1) }),
  related: z.array(z.string()).default([]),
});

export const articles = defineCollection({ type: "data", schema: articleSchema });

export const collections = { articles };
