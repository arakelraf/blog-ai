# Pipeline reference

All endpoints are `POST` unless noted and return JSON. Base URL is the pipeline
service (`http://localhost:3000` in dev, `http://pipeline:3000` from n8n in compose).

## Endpoints

| Endpoint | Stage | What it does |
|---|---|---|
| `GET /health` | — | Liveness probe |
| `GET /status` | — | Niche, model, mode, daily spend, which services are live vs mock |
| `POST /discover` | 1 | DataForSEO ideas → commercial-intent filter + page-type → dedup → cluster → skip existing → persist |
| `POST /match` | 2 | Match affiliates by category; LLM assigns roles + rationale; `<2` qualifying → `no_monetization` |
| `GET /report/no-monetization` | 2 | Categories lacking programs + suggested networks to join |
| `POST /generate` | 4 | SERP snapshot → grounded generation → zod-valid article JSON → store. Body: `{}` (top-N), `{clusterId}` or `{slug}` |
| `POST /publish` | 6 | Quality gate per draft; REVIEW → Telegram preview + buttons; AUTO → commit + IndexNow. Body: `{}` or `{slug}` |
| `POST /review` | 6 | Handle a review decision. Body: `{action:"publish"\|"reject"\|"regenerate", slug}` |
| `POST /click` | 7 | Log an affiliate click. Body: `{product, src?, pos?, country?, ua?}` |
| `POST /report/weekly` | 7 | Clicks by page/block/product, best/worst pages, GSC opportunities → Telegram |
| `POST /gsc/ingest` | 7 | Feed Search Console pos 8–20 back as priority topics. Body: `{rows?: GscRow[]}` |
| `POST /refresh` | 7 | Regenerate stale (>90d) / click-declining / GSC-flagged published articles |
| `POST /notify` | — | Send a Telegram message (used by the n8n error branch). Body: `{text}` |
| `GET /admin` | 2 | Affiliate admin (basic auth) + CSV import |

## Scoring (stage 3, inside `/match`)

```
score = volume × cpcFactor × commissionFactor / (difficulty + 10)
cpcFactor        = 1 + cpc × scoring.cpcWeight
commissionFactor = scoring.commissionByCount[ min(matchedAffiliates, 4) ]
```

Clusters below `scoring.minScore` are parked; the top `scoring.topNPerDay` go to
generation. All knobs live in `pipeline/src/config/niche.yaml`.

## Quality gate (before publish)

Rejects (with reasons, reported to Telegram) when:
- the JSON fails the article schema,
- fewer than 2 products have affiliate links,
- any product has no cons,
- prose contains a stop-list cliché or repeated paragraphs,
- a `$`-price or product appears in prose that isn't backed by the affiliates table.

## Database (SQLite via Drizzle — `pipeline/src/db/schema.ts`)

| Table | Purpose |
|---|---|
| `clusters` | One row per page: slug, title, page type, category, status, score, volume/cpc/difficulty |
| `keywords` | Discovered keywords linked to a cluster (volume, kd, cpc, intent, source) |
| `affiliates` | Source of truth for products: links, commission, cookie, pricing, pros/cons, rating |
| `cluster_affiliates` | Which products belong to a cluster + role (top_pick/budget/premium/alternative) |
| `articles` | Generated article JSON, status, quality-gate result, published URL |
| `clicks` | Affiliate click log (article, block position, country) |
| `runs` | Audit of every step: status, token/API cost, timing |

Cluster status flow: `new → matched → generated → published`
(`no_monetization` when parked, `refresh` when queued for update, `rejected` from review).

## Content contract

`pipeline/src/llm/article-schema.ts` (zod) mirrors `site/src/content/config.ts` exactly.
The pipeline generates against it; Astro renders it. Facts (pricing, pros, cons, rating,
affiliate URL) are merged from the `affiliates` table — the LLM writes prose only.

## Cost control

Every `/discover`, `/match`, `/generate`, `/publish`, `/report`, `/refresh` opens a
`runs` row and records token + API cost. Before doing paid work each step checks the
day's total against `budget.dailyUsd`; if exceeded it returns `{status:"skipped"}`.

## Tests

`cd pipeline && pnpm test` — covers the scoring formula, intent/clustering, article
generation (schema-valid + fact-grounded), and the quality gate.
