import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { site } from "../../lib/site";

export async function getStaticPaths() {
  const articles = await getCollection("articles");
  return articles.map((a) => ({ params: { slug: a.id.replace(/\.json$/, "") }, props: { article: a.data } }));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function wrap(text: string, max = 22): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max) { lines.push(line.trim()); line = w; }
    else line += " " + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 4);
}

export const GET: APIRoute = ({ props }) => {
  const a = (props as any).article;
  const lines = wrap(a.title, 24);
  const startY = 300 - (lines.length - 1) * 38;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#15131f"/>
      <stop offset="1" stop-color="#241f3d"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#817dff"/>
      <stop offset="1" stop-color="#ea580c"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="1200" height="8" fill="url(#accent)"/>
  <circle cx="1050" cy="120" r="220" fill="#817dff" opacity="0.12"/>
  <text x="80" y="110" font-family="Georgia, serif" font-size="30" font-weight="700" fill="#ffffff">${esc(site.name)}</text>
  <text x="80" y="140" font-family="Inter, sans-serif" font-size="18" fill="#a1a0b4">${esc(site.tagline)}</text>
  <rect x="80" y="178" width="120" height="3" fill="url(#accent)"/>
  ${lines
    .map((l, i) => `<text x="80" y="${startY + i * 76}" font-family="Georgia, serif" font-size="62" font-weight="700" fill="#ffffff">${esc(l)}</text>`)
    .join("\n  ")}
  <g transform="translate(80,540)">
    <rect width="150" height="44" rx="22" fill="url(#accent)"/>
    <text x="75" y="29" text-anchor="middle" font-family="Inter, sans-serif" font-size="18" font-weight="700" fill="#15131f">${a.year} review</text>
  </g>
</svg>`;

  return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
};
