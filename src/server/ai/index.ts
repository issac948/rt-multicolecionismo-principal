import { getEnv } from "../env";
import { AnthropicProvider, DisabledAiProvider, OpenAiCompatibleProvider } from "./providers";
import type { AiProvider } from "./types";

export type { AiProvider } from "./types";

/** Único ponto que escolhe o provedor de IA (variável AI_PROVIDER). */
export function getAiProvider(): AiProvider {
  switch (getEnv().ai.provider) {
    case "anthropic":
      return new AnthropicProvider();
    case "openai":
      return new OpenAiCompatibleProvider();
    default:
      return new DisabledAiProvider();
  }
}

export function aiStatus(): { configured: boolean; provider: string } {
  const provider = getAiProvider();
  return { configured: provider.isConfigured(), provider: provider.id };
}
