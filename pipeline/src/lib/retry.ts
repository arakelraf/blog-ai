import { logger } from "./logger.js";

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  label?: string;
}

/** Exponential backoff with jitter for flaky external APIs. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 4, baseMs = 500, label = "op" } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      const delay = baseMs * 2 ** attempt + Math.random() * baseMs;
      logger.warn({ label, attempt: attempt + 1, delay: Math.round(delay) }, "retrying after error");
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
