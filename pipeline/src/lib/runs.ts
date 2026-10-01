import { and, gte, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { runs } from "../db/schema.js";

export interface RunHandle {
  id: number;
  addTokens: (tokensIn: number, tokensOut: number, costUsd: number) => void;
  addApiCost: (usd: number) => void;
  finish: (status: "ok" | "error" | "skipped", outputSummary?: string, error?: string) => void;
}

/** Open a run row and return a handle to accumulate cost and close it. */
export function startRun(step: string, inputSummary?: string): RunHandle {
  const row = db
    .insert(runs)
    .values({ step, status: "ok", inputSummary: inputSummary ?? null })
    .returning({ id: runs.id })
    .get();
  const id = row!.id;

  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd = 0;
  let apiCostUsd = 0;

  return {
    id,
    addTokens(ti, to, cost) {
      tokensIn += ti;
      tokensOut += to;
      costUsd += cost;
    },
    addApiCost(usd) {
      apiCostUsd += usd;
    },
    finish(status, outputSummary, error) {
      db.update(runs)
        .set({
          status,
          outputSummary: outputSummary ?? null,
          error: error ?? null,
          tokensIn,
          tokensOut,
          costUsd,
          apiCostUsd,
          finishedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
        })
        .where(sql`${runs.id} = ${id}`)
        .run();
    },
  };
}

/** Total spend (LLM + API) since local midnight — used by the daily budget guardrail. */
export function spendToday(): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const iso = startOfDay.toISOString();
  const rows = db
    .select({ cost: runs.costUsd, api: runs.apiCostUsd })
    .from(runs)
    .where(and(gte(runs.startedAt, iso)))
    .all();
  return rows.reduce((sum, r) => sum + (r.cost ?? 0) + (r.api ?? 0), 0);
}
