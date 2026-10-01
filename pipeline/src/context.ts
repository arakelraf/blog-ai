import { resolve } from "node:path";
import { loadEnv, loadNiche, serviceMode, type Env, type NicheConfig } from "./config/index.js";
import { AnthropicService } from "./services/anthropic.js";
import { DataForSeoService } from "./services/dataforseo.js";
import { TelegramService } from "./services/telegram.js";
import { GitHubService } from "./services/github.js";
import { IndexNowService } from "./services/indexnow.js";
import { GscService } from "./services/gsc.js";

export interface AppContext {
  env: Env;
  niche: NicheConfig;
  modes: ReturnType<typeof serviceMode>;
  llm: AnthropicService;
  seo: DataForSeoService;
  telegram: TelegramService;
  github: GitHubService;
  indexnow: IndexNowService;
  gsc: GscService;
}

export function buildContext(): AppContext {
  const env = loadEnv();
  const niche = loadNiche();
  const modes = serviceMode(env);
  const contentDir = resolve(process.cwd(), niche.publish.siteContentDir);
  return {
    env,
    niche,
    modes,
    llm: new AnthropicService(env, modes.anthropic),
    seo: new DataForSeoService(env, modes.dataforseo),
    telegram: new TelegramService(env, modes.telegram),
    github: new GitHubService(env, modes.github, contentDir),
    indexnow: new IndexNowService(env, modes.indexnow),
    gsc: new GscService(env, modes.gsc),
  };
}
