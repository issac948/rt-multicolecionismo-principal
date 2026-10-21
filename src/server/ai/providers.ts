import { getEnv } from "../env";
import { ExternalServiceError } from "../errors";
import type { AiCompletionRequest, AiProvider } from "./types";

const TIMEOUT_MS = 60_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[ia] falha de rede:", error instanceof Error ? error.message : error);
    throw new ExternalServiceError("Não foi possível falar com o serviço de IA agora. Tente novamente em instantes.");
  }

  const text = await response.text();
  if (!response.ok) {
    // O corpo pode conter detalhes técnicos: só no log do servidor.
    console.error(`[ia] ${response.status}: ${text.slice(0, 500)}`);
    throw new ExternalServiceError(
      response.status === 401 || response.status === 403
        ? "A chave do serviço de IA foi recusada. Confira AI_API_KEY no servidor."
        : response.status === 429
          ? "O serviço de IA está com muitas solicitações. Tente novamente em alguns instantes."
          : "O serviço de IA não conseguiu responder. Tente novamente.",
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ExternalServiceError("Resposta inválida do serviço de IA.");
  }
}

/** Anthropic (Claude) — API de Messages. */
export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic";

  private get cfg() {
    return getEnv().ai;
  }

  isConfigured(): boolean {
    return Boolean(this.cfg.apiKey);
  }

  async complete(request: AiCompletionRequest): Promise<string> {
    const base = this.cfg.baseUrl || "https://api.anthropic.com";
    const data = (await postJson(
      `${base}/v1/messages`,
      { "x-api-key": this.cfg.apiKey, "anthropic-version": "2023-06-01" },
      {
        model: this.cfg.model || "claude-sonnet-5-5",
        max_tokens: request.maxTokens,
        temperature: request.temperature ?? 0.4,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
      },
    )) as { content?: Array<{ type?: string; text?: string }> };

    const text = (data.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("");
    if (!text) throw new ExternalServiceError("O serviço de IA devolveu uma resposta vazia.");
    return text;
  }
}

/** OpenAI ou qualquer API compatível com o formato "chat/completions". */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly id = "openai";

  private get cfg() {
    return getEnv().ai;
  }

  isConfigured(): boolean {
    // Sem modelo definido não há como adivinhar o nome certo em cada provedor compatível.
    return Boolean(this.cfg.apiKey && this.cfg.model);
  }

  async complete(request: AiCompletionRequest): Promise<string> {
    const base = this.cfg.baseUrl || "https://api.openai.com/v1";
    const data = (await postJson(
      `${base}/chat/completions`,
      { Authorization: `Bearer ${this.cfg.apiKey}` },
      {
        model: this.cfg.model,
        max_tokens: request.maxTokens,
        temperature: request.temperature ?? 0.4,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
      },
    )) as { choices?: Array<{ message?: { content?: string } }> };

    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new ExternalServiceError("O serviço de IA devolveu uma resposta vazia.");
    return text;
  }
}

/** Provedor "desligado": nunca finge uma resposta. */
export class DisabledAiProvider implements AiProvider {
  readonly id = "none";
  isConfigured(): boolean {
    return false;
  }
  async complete(): Promise<string> {
    throw new ExternalServiceError("O assistente de IA ainda não foi configurado no servidor.");
  }
}
