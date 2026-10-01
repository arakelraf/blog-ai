// Cloudflare Pages Function — runs at the edge for /go/:product.
// Logs the click (to D1 if bound, otherwise forwards to the pipeline) and 302s.
// Deployed automatically by Cloudflare Pages when a real domain/project exists.
interface Env {
  DB?: D1Database;
  PIPELINE_CLICK_URL?: string; // fallback: POST clicks to the pipeline
  AFFILIATE_MAP?: string; // JSON {productId: affiliateUrl} set as a build var
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, params, env } = context;
  const url = new URL(request.url);
  const product = String(params.product);
  const src = url.searchParams.get("src") ?? "";
  const pos = url.searchParams.get("pos") ?? "";
  const country = (request as any).cf?.country ?? "XX";

  let dest = "/";
  try {
    const map = env.AFFILIATE_MAP ? (JSON.parse(env.AFFILIATE_MAP) as Record<string, string>) : {};
    dest = map[product] ?? "/";
  } catch {}

  const click = { product, src, pos, country, ts: new Date().toISOString() };

  context.waitUntil(
    (async () => {
      try {
        if (env.DB) {
          await env.DB.prepare(
            "INSERT INTO clicks (article_slug, product, block_position, country, ts) VALUES (?,?,?,?,?)",
          ).bind(src, product, pos, country, click.ts).run();
        } else if (env.PIPELINE_CLICK_URL) {
          await fetch(env.PIPELINE_CLICK_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(click),
          });
        }
      } catch {
        /* never block the redirect on logging */
      }
    })(),
  );

  return Response.redirect(dest, 302);
};
