import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { startRun } from "../lib/runs.js";
import { daysAgoIso, totalClicks, clicksByBlock, clicksByProduct, pagePerformance } from "../domain/analytics.js";

export interface WeeklyReport {
  windowDays: number;
  published: number;
  totalClicks: number;
  byBlock: { key: string; clicks: number }[];
  topProducts: { key: string; clicks: number }[];
  bestPages: { slug: string; title: string; clicks: number }[];
  worstPages: { slug: string; title: string; clicks: number }[];
  gscOpportunities: { query: string; position: number; clicks: number }[];
}

export async function weeklyReport(ctx: AppContext): Promise<WeeklyReport> {
  const run = startRun("report");
  const since = daysAgoIso(7);
  const pages = pagePerformance(since);
  const seeds = ctx.niche.seeds.map((s) => s.topic);
  const gsc = (await ctx.gsc.opportunities(seeds)).sort((a, b) => a.position - b.position).slice(0, 10);

  const report: WeeklyReport = {
    windowDays: 7,
    published: pages.length,
    totalClicks: totalClicks(since),
    byBlock: clicksByBlock(since),
    topProducts: clicksByProduct(since, 5),
    bestPages: pages.slice(0, 5),
    worstPages: [...pages].reverse().slice(0, 5),
    gscOpportunities: gsc.map((g) => ({ query: g.query, position: Math.round(g.position * 10) / 10, clicks: g.clicks })),
  };

  const lines = [
    `📊 <b>Weekly report</b> (last 7 days)`,
    `Published pages: <b>${report.published}</b>`,
    `Affiliate clicks: <b>${report.totalClicks}</b>`,
    report.byBlock.length ? `Clicks by block: ${report.byBlock.map((b) => `${b.key} ${b.clicks}`).join(", ")}` : "",
    report.bestPages.length ? `🏆 Best: ${report.bestPages.slice(0, 3).map((p) => `${p.title} (${p.clicks})`).join("; ")}` : "",
    report.worstPages.length ? `🔻 Worst: ${report.worstPages.slice(0, 3).map((p) => `${p.title} (${p.clicks})`).join("; ")}` : "",
    report.gscOpportunities.length
      ? `🎯 GSC opportunities (pos 8-20):\n${report.gscOpportunities.map((g) => `• ${g.query} — pos ${g.position}`).join("\n")}`
      : "",
  ].filter(Boolean);
  await ctx.telegram.notify(lines.join("\n\n"));

  run.finish("ok", `report: ${report.totalClicks} clicks, ${report.gscOpportunities.length} GSC opportunities`);
  return report;
}

export function registerReport(app: FastifyInstance, ctx: AppContext): void {
  app.post("/report/weekly", async () => weeklyReport(ctx));
}
