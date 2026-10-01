import Fastify from "fastify";
import { buildContext } from "./context.js";
import { migrate } from "./db/migrate.js";
import { registerDiscover } from "./routes/discover.js";
import { registerMatch } from "./routes/match.js";
import { registerAdmin } from "./routes/admin.js";
import { logger } from "./lib/logger.js";
import { spendToday } from "./lib/runs.js";

async function main(): Promise<void> {
  migrate();
  const ctx = buildContext();
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ ok: true }));
  app.get("/status", async () => ({
    niche: ctx.niche.niche,
    markets: ctx.niche.markets.map((m) => m.code),
    model: ctx.env.CLAUDE_MODEL,
    effort: ctx.env.LLM_EFFORT,
    publishMode: ctx.niche.publish.mode,
    topNPerDay: ctx.niche.scoring.topNPerDay,
    budgetUsd: ctx.niche.budget.dailyUsd,
    spentTodayUsd: Math.round(spendToday() * 1000) / 1000,
    services: ctx.modes,
  }));

  registerDiscover(app, ctx);
  registerMatch(app, ctx);
  await registerAdmin(app, ctx);

  const port = ctx.env.PORT;
  await app.listen({ port, host: "0.0.0.0" });
  logger.info({ port, services: ctx.modes }, "pipeline listening");
}

main().catch((err) => {
  logger.error({ err }, "failed to start");
  process.exit(1);
});
