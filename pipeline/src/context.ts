import { loadEnv, loadNiche, serviceMode, type Env, type NicheConfig } from "./config/index.js";
import { AnthropicService } from "./services/anthropic.js";
import { DataForSeoService } from "./services/dataforseo.js";

export interface AppContext {
  env: Env;
  niche: NicheConfig;
  modes: ReturnType<typeof serviceMode>;
  llm: AnthropicService;
  seo: DataForSeoService;
}

export function buildContext(): AppContext {
  const env = loadEnv();
  const niche = loadNiche();
  const modes = serviceMode(env);
  return {
    env,
    niche,
    modes,
    llm: new AnthropicService(env, modes.anthropic),
    seo: new DataForSeoService(env, modes.dataforseo),
  };
}
