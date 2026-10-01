import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Env } from "../config/index.js";
import { withRetry } from "../lib/retry.js";
import { logger } from "../lib/logger.js";

export class GitHubService {
  constructor(private env: Env, private live: boolean, private localContentDir: string) {}

  get isLive(): boolean {
    return this.live;
  }

  /**
   * Create/update a file in the repo via the Contents API (triggers a Cloudflare
   * Pages rebuild). In mock mode, writes to the local site content dir instead.
   */
  async commitJson(repoPath: string, content: unknown, message: string): Promise<{ committed: boolean; url?: string }> {
    const body = JSON.stringify(content, null, 2);

    if (!this.live) {
      const local = resolve(this.localContentDir, repoPath.split("/").pop()!);
      mkdirSync(dirname(local), { recursive: true });
      writeFileSync(local, body);
      logger.info({ local }, "[github mock] wrote article to local site content dir");
      return { committed: true };
    }

    const [owner, repo] = this.env.GITHUB_REPO.split("/");
    const api = `https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}`;
    const headers = {
      Authorization: `Bearer ${this.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    };

    return withRetry(
      async () => {
        // Need the current sha to update an existing file.
        let sha: string | undefined;
        const get = await fetch(`${api}?ref=${this.env.GITHUB_BRANCH}`, { headers });
        if (get.ok) sha = ((await get.json()) as { sha?: string }).sha;

        const put = await fetch(api, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            message,
            content: Buffer.from(body).toString("base64"),
            branch: this.env.GITHUB_BRANCH,
            ...(sha ? { sha } : {}),
          }),
        });
        if (!put.ok) throw new Error(`GitHub PUT ${repoPath} -> ${put.status}: ${await put.text()}`);
        const data = (await put.json()) as { content?: { html_url?: string } };
        return { committed: true, url: data.content?.html_url };
      },
      { label: "github commit" },
    );
  }
}
