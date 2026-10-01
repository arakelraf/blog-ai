import { rawDb } from "./client.js";

// Idempotent bootstrap — mirrors schema.ts. Safe to run on every startup.
// (drizzle-kit generate is also wired for teams that prefer file migrations.)
export function migrate(): void {
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS clusters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      primary_keyword TEXT NOT NULL,
      page_type TEXT NOT NULL,
      category TEXT NOT NULL,
      market TEXT NOT NULL DEFAULT 'us',
      status TEXT NOT NULL DEFAULT 'new',
      score REAL NOT NULL DEFAULT 0,
      volume INTEGER NOT NULL DEFAULT 0,
      difficulty REAL NOT NULL DEFAULT 0,
      cpc REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS clusters_status_idx ON clusters(status);

    CREATE TABLE IF NOT EXISTS keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL UNIQUE,
      cluster_id INTEGER REFERENCES clusters(id),
      volume INTEGER NOT NULL DEFAULT 0,
      difficulty REAL NOT NULL DEFAULT 0,
      cpc REAL NOT NULL DEFAULT 0,
      intent TEXT NOT NULL DEFAULT 'commercial',
      page_type TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS keywords_cluster_idx ON keywords(cluster_id);

    CREATE TABLE IF NOT EXISTS affiliates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      affiliate_link TEXT NOT NULL,
      network TEXT,
      commission TEXT,
      cookie_days INTEGER,
      category TEXT NOT NULL,
      pros TEXT DEFAULT '[]',
      cons TEXT DEFAULT '[]',
      pricing TEXT DEFAULT '[]',
      promo_code TEXT,
      rating REAL,
      logo_url TEXT,
      last_verified TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS cluster_affiliates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cluster_id INTEGER NOT NULL REFERENCES clusters(id),
      affiliate_id INTEGER NOT NULL REFERENCES affiliates(id),
      role TEXT NOT NULL,
      rationale TEXT,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cluster_id INTEGER REFERENCES clusters(id),
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      content_json TEXT,
      content_hash TEXT,
      qg_passed INTEGER NOT NULL DEFAULT 0,
      qg_reasons TEXT DEFAULT '[]',
      preview_url TEXT,
      published_url TEXT,
      published_at TEXT,
      refreshed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS articles_status_idx ON articles(status);

    CREATE TABLE IF NOT EXISTS clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_slug TEXT,
      product TEXT NOT NULL,
      block_position TEXT,
      country TEXT,
      ua_hash TEXT,
      ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      step TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ok',
      input_summary TEXT,
      output_summary TEXT,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      api_cost_usd REAL NOT NULL DEFAULT 0,
      error TEXT,
      started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      finished_at TEXT
    );
  `);
}

// Allow `tsx src/db/migrate.ts` as a standalone command.
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
  console.log("Migration complete.");
}
