/**
 * Contrato de um provedor de IA. O assistente do painel só conhece esta interface,
 * então trocar de Anthropic para OpenAI (ou qualquer API compatível) é uma variável
 * de ambiente (AI_PROVIDER); para um provedor novo, crie outra classe que a implemente.
 */
export type AiCompletionRequest = {
  system: string;
  prompt: string;
  maxTokens: number;
  temperature?: number;
};

export interface AiProvider {
  readonly id: string;
  /** false enquanto a chave/modelo não estiverem configurados. */
  isConfigured(): boolean;
  complete(request: AiCompletionRequest): Promise<string>;
}
