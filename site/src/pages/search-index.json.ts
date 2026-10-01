import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { categories } from "../lib/site";

// Prebuilt search index — tiny JSON the client fetches once for instant search.
export const GET: APIRoute = async () => {
  const articles = await getCollection("articles");
  const index = articles
    .sort((a, b) => +new Date(b.data.publishDate) - +new Date(a.data.publishDate))
    .map((a) => {
      const slug = a.id.replace(/\.json$/, "");
      const products = a.data.products.map((p) => p.name);
      return {
        slug,
        title: a.data.title,
        description: a.data.metaDescription,
        category: categories[a.data.categorySlug]?.title ?? a.data.category,
        categorySlug: a.data.categorySlug,
        year: a.data.year,
        products,
        // Single lowercased haystack for fast substring matching.
        haystack: [a.data.title, a.data.metaDescription, a.data.category, ...products].join(" ").toLowerCase(),
      };
    });

  return new Response(JSON.stringify(index), {
    headers: { "Content-Type": "application/json" },
  });
};
