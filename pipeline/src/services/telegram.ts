import type { Env } from "../config/index.js";
import { withRetry } from "../lib/retry.js";
import { logger } from "../lib/logger.js";

export interface InlineButton {
  text: string;
  callback_data: string;
}

export class TelegramService {
  constructor(private env: Env, private live: boolean) {}

  get isLive(): boolean {
    return this.live;
  }

  private async api(method: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.live) {
      logger.info({ method, payload }, "[telegram mock] would send");
      return;
    }
    await withRetry(
      async () => {
        const res = await fetch(`https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: this.env.TELEGRAM_CHAT_ID, ...payload }),
        });
        if (!res.ok) throw new Error(`Telegram ${method} -> ${res.status}: ${await res.text()}`);
      },
      { label: `telegram ${method}` },
    );
  }

  async notify(text: string): Promise<void> {
    await this.api("sendMessage", { text, parse_mode: "HTML", disable_web_page_preview: true });
  }

  /** Review preview with inline Publish / Reject / Regenerate buttons. */
  async reviewPreview(text: string, buttons: InlineButton[]): Promise<void> {
    await this.api("sendMessage", {
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [buttons] },
    });
  }
}
