import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { categories, authors, site } from "../lib/site";

export const GET: APIRoute = async () => {
  const articles = await getCollection("articles");
  const urls: { loc: string; lastmod?: string }[] = [
    { loc: "/" },
    { loc: "/about/" },
    { loc: "/how-we-test/" },
    { loc: "/disclosure/" },
    { loc: "/privacy/" },
    ...Object.keys(categories).map((c) => ({ loc: `/categories/${c}/` })),
    ...Object.keys(authors).map((a) => ({ loc: `/authors/${a}/` })),
    ...articles.map((a) => ({
      loc: `/blog/${a.id.replace(/\.json$/, "")}/`,
      lastmod: new Date(a.data.updatedDate ?? a.data.publishDate).toISOString(),
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${site.url}${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(body, { headers: { "Content-Type": "application/xml" } });
};
