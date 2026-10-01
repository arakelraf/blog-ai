import type { Env } from "../config/index.js";
import { withRetry } from "../lib/retry.js";
import { logger } from "../lib/logger.js";

export class IndexNowService {
  constructor(private env: Env, private live: boolean) {}

  get isLive(): boolean {
    return this.live;
  }

  /** Ping IndexNow so Bing/Yandex/etc. re-crawl the new URLs. */
  async submit(urls: string[]): Promise<void> {
    if (!urls.length) return;
    if (!this.live) {
      logger.info({ urls }, "[indexnow mock] would submit URLs");
      return;
    }
    const host = new URL(this.env.SITE_URL).host;
    await withRetry(
      async () => {
        const res = await fetch("https://api.indexnow.org/indexnow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ host, key: this.env.INDEXNOW_KEY, keyLocation: `${this.env.SITE_URL}/${this.env.INDEXNOW_KEY}.txt`, urlList: urls }),
        });
        if (!res.ok) throw new Error(`IndexNow -> ${res.status}`);
      },
      { label: "indexnow" },
    );
  }
}
