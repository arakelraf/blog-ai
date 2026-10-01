import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { db } from "../db/client.js";
import { clicks } from "../db/schema.js";
import { sha256 } from "../lib/util.js";

interface ClickBody {
  product: string;
  src?: string; // article slug
  pos?: string; // block position
  country?: string;
  ua?: string;
}

/**
 * Click sink for the Cloudflare /go Function's non-D1 fallback
 * (PIPELINE_CLICK_URL). Also usable directly for testing.
 */
export function registerTrack(app: FastifyInstance, _ctx: AppContext): void {
  app.post<{ Body: ClickBody }>("/click", async (req, reply) => {
    const b = req.body ?? ({} as ClickBody);
    if (!b.product) {
      reply.code(400);
      return { ok: false, error: "product required" };
    }
    db.insert(clicks)
      .values({
        product: b.product,
        articleSlug: b.src ?? null,
        blockPosition: b.pos ?? null,
        country: b.country ?? null,
        uaHash: b.ua ? sha256(b.ua).slice(0, 16) : null,
      })
      .run();
    return { ok: true };
  });
}
