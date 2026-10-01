// Prefix root-absolute URLs (href="/..." / src="/...") with a base path, for
// project GitHub Pages (served under /blog-ai/). No-op for root hosting.
// Usage: BASE=/blog-ai node scripts/rewrite-base.mjs [distDir]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const base = (process.env.BASE ?? "").replace(/\/$/, "");
const dist = process.argv[2] ?? "dist";
if (!base) {
  console.log("No BASE set — skipping rewrite.");
  process.exit(0);
}

// Match href="/ or src="/ not followed by another slash (skip protocol-relative).
const re = /(href|src)="\/(?!\/)/g;
let count = 0;

function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) walk(f);
    else if (f.endsWith(".html")) {
      const src = readFileSync(f, "utf8");
      const out = src.replace(re, `$1="${base}/`);
      if (out !== src) {
        writeFileSync(f, out);
        count++;
      }
    }
  }
}

walk(dist);
console.log(`Rewrote ${count} HTML files with base ${base}`);
