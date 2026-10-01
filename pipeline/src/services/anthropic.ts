import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { Env } from "../config/index.js";
import type { RunHandle } from "../lib/runs.js";
import { withRetry } from "../lib/retry.js";
import { logger } from "../lib/logger.js";

// USD per million tokens. Extend as models change.
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

export class AnthropicService {
  private client: Anthropic | null;
  private model: string;
  private effort: Env["LLM_EFFORT"];

  constructor(private env: Env, private live: boolean) {
    this.client = live ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
    this.model = env.CLAUDE_MODEL;
    this.effort = env.LLM_EFFORT;
  }

  get isLive(): boolean {
    return this.client !== null;
  }

  private cost(inTok: number, outTok: number): number {
    const p = PRICING[this.model] ?? { in: 2, out: 10 };
    return (inTok / 1e6) * p.in + (outTok / 1e6) * p.out;
  }

  /** Raw text completion. */
  async complete(system: string, user: string, run?: RunHandle, maxTokens = 4000): Promise<string> {
    if (!this.client) throw new Error("Anthropic not configured (set ANTHROPIC_API_KEY)");
    const params = {
      model: this.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
      // effort is GA but not yet in this SDK version's types — pass through.
      output_config: { effort: this.effort },
    } as unknown as Anthropic.MessageCreateParamsNonStreaming;

    const res = (await withRetry(() => this.client!.messages.create(params), {
      label: "anthropic.complete",
    })) as Anthropic.Message;
    const usage = res.usage;
    const cost = this.cost(usage.input_tokens, usage.output_tokens);
    run?.addTokens(usage.input_tokens, usage.output_tokens, cost);
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return text;
  }

  /**
   * JSON completion validated against a zod schema.
   * One repair attempt if the first response fails to parse/validate.
   */
  async completeJson<T>(
    system: string,
    user: string,
    schema: z.ZodType<T>,
    run?: RunHandle,
    maxTokens = 8000,
  ): Promise<T> {
    const jsonSystem = `${system}\n\nRespond with ONLY valid JSON matching the requested schema. No prose, no markdown fences.`;
    let lastText = "";
    let lastErr = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt =
        attempt === 0
          ? user
          : `${user}\n\nYour previous reply was invalid JSON or failed validation:\n${lastErr}\nReturn corrected JSON only.`;
      lastText = await this.complete(jsonSystem, prompt, run, maxTokens);
      const cleaned = lastText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      try {
        return schema.parse(JSON.parse(cleaned));
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        logger.warn({ attempt, err: lastErr }, "LLM JSON validation failed");
      }
    }
    throw new Error(`LLM JSON invalid after repair: ${lastErr}`);
  }
}
