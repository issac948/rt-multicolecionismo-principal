
/**
 * Aviso para o dono pelo Telegram (opcional). Só funciona se TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID estiverem definidos
 * (crie o bot com o @BotFather; o ID do chat você descobre mandando uma mensagem ao bot). Sem elas, não faz nada.
 *
 * Regras: nunca lança erro (um aviso que falha não pode derrubar um pagamento), espera no máximo ~2,5 s e
 * NUNCA leva dados do cliente (nome, e-mail, telefone, endereço): só número do pedido e valor.
 */
export function telegramConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN?.trim() && env.TELEGRAM_CHAT_ID?.trim());
}

export async function notifyOwner(text: string, options: { fetchImpl?: typeof fetch; env?: Record<string, string | undefined> } = {}): Promise<boolean> {
  const env = options.env ?? process.env;
  if (!telegramConfigured(env)) return false;
  try {
    const base = env.TELEGRAM_API_BASE?.trim() || "https://api.telegram.org";
    const response = await (options.fetchImpl ?? fetch)(`${base}/bot${env.TELEGRAM_BOT_TOKEN!.trim()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID!.trim(), text: text.slice(0, 1000), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(2500),
    });
    return response.ok;
  } catch {
    // Não registra o erro cru: a URL da requisição contém o token do bot.
    console.error("[telegram] não foi possível enviar o aviso.");
    return false;
  }
}
