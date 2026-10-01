import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));

/** Niche config (niche.yaml) */
const marketSchema = z.object({
  code: z.string(),
  locationCode: z.number(),
  languageCode: z.string(),
});

const nicheSchema = z.object({
  niche: z.string(),
  language: z.string(),
  markets: z.array(marketSchema).min(1),
  seeds: z.array(z.object({ topic: z.string(), category: z.string() })).min(1),
  discover: z.object({
    maxKeywordsPerSeed: z.number(),
    minVolume: z.number(),
    maxDifficulty: z.number(),
  }),
  scoring: z.object({
    cpcWeight: z.number(),
    commissionByCount: z.record(z.string(), z.number()),
    minScore: z.number(),
    topNPerDay: z.number(),
  }),
  publish: z.object({
    mode: z.enum(["review", "auto"]),
    siteContentDir: z.string(),
  }),
  budget: z.object({ dailyUsd: z.number() }),
  refresh: z.object({ staleDays: z.number() }),
});

export type NicheConfig = z.infer<typeof nicheSchema>;

export function loadNiche(path = resolve(here, "niche.yaml")): NicheConfig {
  return nicheSchema.parse(parse(readFileSync(path, "utf8")));
}

/** Environment — all secrets; each service degrades to a mock when its key is absent. */
const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.string().default("development"),
  DATABASE_PATH: z.string().default("../db/blog.db"),

  CLAUDE_MODEL: z.string().default("claude-sonnet-5-5"),
  // Named LLM_EFFORT (not CLAUDE_EFFORT) to avoid clashing with host env vars.
  LLM_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),
  ANTHROPIC_API_KEY: z.string().optional(),

  DATAFORSEO_LOGIN: z.string().optional(),
  DATAFORSEO_PASSWORD: z.string().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  GITHUB_TOKEN: z.string().optional(),
  GITHUB_REPO: z.string().default("arakelraf/blog-ai"),
  GITHUB_BRANCH: z.string().default("main"),

  SITE_URL: z.string().default("https://example.com"),
  INDEXNOW_KEY: z.string().optional(),

  // Google Search Console (optional; n8n can also feed /gsc/ingest directly).
  GSC_SITE_URL: z.string().optional(),
  GSC_ACCESS_TOKEN: z.string().optional(),

  ADMIN_USER: z.string().default("admin"),
  ADMIN_PASSWORD: z.string().default("changeme"),

  // Force mock mode even if keys exist (useful for local/dev/tests).
  MOCK: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  return envSchema.parse(process.env);
}

/** Per-service: is it running live or mocked? */
export function serviceMode(env: Env) {
  const mock = env.MOCK;
  return {
    anthropic: !mock && !!env.ANTHROPIC_API_KEY,
    dataforseo: !mock && !!env.DATAFORSEO_LOGIN && !!env.DATAFORSEO_PASSWORD,
    telegram: !mock && !!env.TELEGRAM_BOT_TOKEN && !!env.TELEGRAM_CHAT_ID,
    github: !mock && !!env.GITHUB_TOKEN,
    indexnow: !mock && !!env.INDEXNOW_KEY,
    gsc: !mock && !!env.GSC_ACCESS_TOKEN && !!env.GSC_SITE_URL,
  };
}
