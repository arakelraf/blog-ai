# blog-ai — automated affiliate-SEO blog for AI tools

A fully automated pipeline that finds commercial-intent search queries, matches them
to affiliate programs, generates conversion-focused SEO pages, publishes them, and
tracks results. Orchestrated by **your** self-hosted n8n; all logic lives in a testable
Node/TypeScript service.

```
n8n (schedule, buttons, notifications)
   │  HTTP
   ▼
/pipeline  (Fastify + TypeScript — all the logic)
   ├── DataForSEO (keywords, SERP)      ── Anthropic (content)
   ├── /db (SQLite via Drizzle)
   └── commit article JSON → GitHub → Cloudflare Pages rebuilds /site
```

## Monorepo layout

| Path | What |
|---|---|
| `site/` | Astro + Tailwind static blog (Wirecutter-style), deploys on Cloudflare Pages |
| `pipeline/` | Node/TS Fastify service — one HTTP endpoint per step |
| `db/` | SQLite database file (created on first run) |
| `n8n/` | Importable workflow JSON (schedule, review, report, refresh, errors) |
| `docs/` | This and the per-step reference (`docs/PIPELINE.md`) |

Everything has a **mock mode**: any service whose API key is missing runs on realistic
fixtures, so the whole chain works end-to-end before you add a single key.

---

## 1. Quick start (local)

```bash
# Pipeline
cd pipeline
corepack enable            # pnpm
pnpm install               # builds better-sqlite3 (needs python3 + make + g++)
pnpm test                  # scoring / discovery / generation / quality-gate tests
MOCK=true pnpm dev         # http://localhost:3000

# In another shell — run the chain on fake data:
curl -X POST localhost:3000/discover
curl -X POST localhost:3000/match
curl -X POST localhost:3000/generate
curl -X POST localhost:3000/publish       # REVIEW mode: previews (mock-logs) to Telegram
curl localhost:3000/status
```

```bash
# Site
cd site
pnpm install
pnpm dev                   # http://localhost:4321
pnpm build && pnpm preview # production build
```

## 2. Run with Docker (your server)

```bash
cp .env.example pipeline/.env   # edit keys (see §3)
docker compose up -d --build    # pipeline on :3000, db persisted in ./db
# optional, if you want n8n on the same host/network:
docker compose --profile n8n up -d
```

If n8n runs in the same compose project, workflows reach the pipeline at
`http://pipeline:3000`. If your n8n is elsewhere (e.g. `n8ntestsrb.duckdns.org`),
expose the pipeline publicly or over a tunnel and change the URL in the workflows.

## 3. Keys & configuration

Copy `.env.example` → `pipeline/.env`. Nothing is mandatory to start; add keys to go live.

| Variable | Enables | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Real article generation (`CLAUDE_MODEL`, default `claude-sonnet-5-5`) | Deterministic mock prose |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | Real keyword + SERP data | Realistic mock keywords |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Review previews, reports, error alerts | Logged to console |
| `GITHUB_TOKEN` | Commit articles → Cloudflare rebuild | Writes JSON to local `site/` |
| `INDEXNOW_KEY` | Ping search engines on publish | Skipped |
| `GSC_SITE_URL` / `GSC_ACCESS_TOKEN` | Pull Search Console opportunities | Mock opportunities (n8n can feed real ones to `/gsc/ingest`) |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Affiliate admin auth | Defaults `admin` / `changeme` — **change these** |
| `LLM_EFFORT` | Reasoning effort (`low`..`max`), default `low` | — |
| `MOCK=true` | Force mocks everywhere | — |

Pipeline behaviour (seeds, thresholds, scoring, budget, publish mode, daily quota)
lives in **`pipeline/src/config/niche.yaml`**.

## 4. Import the n8n workflows

1. In n8n: **Workflows → Import from File**, import each file in `n8n/`:
   - `1-daily-content.json` — Cron → discover → match → generate → publish
   - `2-review-handler.json` — Telegram button → `/review` (publish/reject/regenerate)
   - `3-weekly-report.json` — Cron → GSC ingest → weekly report
   - `4-refresh.json` — Cron → refresh stale/declining articles
   - `5-error-handler.json` — Error Trigger → Telegram alert via `/notify`
2. Create a **Telegram** credential and select it in the review-handler nodes
   (replace `REPLACE_TELEGRAM_CRED`).
3. If your pipeline isn't reachable at `http://pipeline:3000`, edit the URL in the
   HTTP Request nodes.
4. In each workflow's **Settings → Error Workflow**, pick `blog-ai · error-handler`.
5. Toggle the workflows **Active**.

## 5. Add an affiliate program

Affiliates are the source of truth for all product facts (prices, pros/cons) — the
generator never invents them.

- Open `http://<pipeline>/admin` (basic auth: `ADMIN_USER` / `ADMIN_PASSWORD`).
- Add a program, or paste a CSV. Columns:
  `name,url,affiliate_link,network,commission,cookie_days,category,pricing,promo_code,rating,pros,cons`
  - `pricing`: `Starter:$29/mo:50k words | Pro:$59/mo`
  - `pros` / `cons`: `Fast | Clean editor` (cons are required — honest reviews only)
  - `category` must match a seed category in `niche.yaml` (e.g. `ai-writing`).
- Run `/match` again — clusters in that category become monetizable.
  `GET /report/no-monetization` lists categories still lacking programs, with
  suggested networks to join.

## 6. Deploy the site (Cloudflare Pages)

1. Create a Pages project from the `arakelraf/blog-ai` repo.
2. Build command `pnpm build`, output directory `site/dist`, root `/`.
3. Set `SITE` in `site/astro.config.mjs` to your real domain (once you have one).
4. Click logging: the `site/functions/go/[product].ts` Pages Function logs to D1 if
   bound, else POSTs to `PIPELINE_CLICK_URL` (`/click`). Add the IndexNow key file at
   `site/public/<INDEXNOW_KEY>.txt` to enable IndexNow.

See **`docs/PIPELINE.md`** for every endpoint, the DB schema, and the content contract.

---

Generated with [Claude Code](https://claude.com/claude-code).
