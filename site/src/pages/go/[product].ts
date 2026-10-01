import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

// Static preview fallback. On Cloudflare Pages, functions/go/[product].ts
// intercepts /go/* at the edge, logs the click, then 302s to the affiliate URL.
// This build-time version just emits a meta-refresh so links work in local preview.
export async function getStaticPaths() {
  const articles = await getCollection("articles");
  const map = new Map<string, string>();
  for (const a of articles) for (const p of a.data.products) map.set(p.id, p.affiliateUrl);
  return [...map.entries()].map(([id, url]) => ({ params: { product: id }, props: { url } }));
}

export const GET: APIRoute = ({ props }) => {
  const url = (props as any).url as string;
  const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${url}"><link rel="canonical" href="${url}"><title>Redirecting…</title><p>Redirecting to <a href="${url}" rel="sponsored nofollow">the offer</a>…</p>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
};
