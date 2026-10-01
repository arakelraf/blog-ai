import type { CollectionEntry } from "astro:content";
import { site } from "./site";

type Article = CollectionEntry<"articles">["data"];

export function articleJsonLd(a: Article, canonical: string) {
  const graph: unknown[] = [];

  graph.push({
    "@type": "Article",
    headline: a.title,
    description: a.metaDescription,
    datePublished: a.publishDate.toISOString(),
    dateModified: (a.updatedDate ?? a.publishDate).toISOString(),
    author: { "@type": "Organization", name: a.author },
    publisher: { "@type": "Organization", name: site.name },
    mainEntityOfPage: canonical,
  });

  for (const p of a.products) {
    graph.push({
      "@type": "Review",
      itemReviewed: { "@type": "SoftwareApplication", name: p.name, applicationCategory: a.category },
      reviewRating: { "@type": "Rating", ratingValue: p.rating, bestRating: 5 },
      author: { "@type": "Organization", name: a.author },
    });
  }

  graph.push({
    "@type": "FAQPage",
    mainEntity: a.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  });

  graph.push({
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: site.url },
      { "@type": "ListItem", position: 2, name: a.category, item: `${site.url}/categories/${a.categorySlug}` },
      { "@type": "ListItem", position: 3, name: a.title, item: canonical },
    ],
  });

  return { "@context": "https://schema.org", "@graph": graph };
}
