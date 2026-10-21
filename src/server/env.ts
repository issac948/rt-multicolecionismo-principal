import path from "node:path";

export type AiProviderId = "anthropic" | "openai" | "none";
export type PaymentProviderId = "paypal" | "mercadopago" | "infinitepay";

/**
 * Leitura central das variáveis de ambiente. Lê a cada chamada (barato) para que
 * testes possam alterar `process.env`. Segredos só existem aqui, no servidor:
 * nenhuma variável sem o prefixo NEXT_PUBLIC_ chega ao navegador.
 */
export function getEnv() {
  const siteUrl = (process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
  const aiProviderRaw = (process.env.AI_PROVIDER || "none").toLowerCase();
  const aiProvider: AiProviderId =
    aiProviderRaw === "anthropic" || aiProviderRaw === "openai" ? aiProviderRaw : "none";

  return {
    isProd: process.env.NODE_ENV === "production",
    isTest: process.env.NODE_ENV === "test",
    siteUrl,
    secureCookies: siteUrl.startsWith("https://"),
    // Pasta de fotos escolhida em tempo de execução (não faz parte do código): o Next não deve rastreá-la no build.
    uploadDir: path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.UPLOAD_DIR || "./storage/uploads"),
    cronSecret: process.env.CRON_SECRET || "",
    trustProxy: process.env.TRUST_PROXY === "true",
    /** Qual gateway a loja usa. O padrão é o PayPal (a conta do negócio); o Mercado Pago continua disponível se alguém configurar. */
    paymentProvider: ((): PaymentProviderId => {
      const v = (process.env.PAYMENT_PROVIDER || "paypal").toLowerCase();
      return v === "mercadopago" || v === "infinitepay" ? v : "paypal";
    })(),
    infinitePay: {
      /** InfiniteTag da conta, sem o "$". Não é segredo, mas é específico da conta do dono. */
      handle: (process.env.INFINITEPAY_HANDLE || "").trim().replace(/^\$/, ""),
      /** Segredo no endereço do webhook (o InfinitePay não assina as notificações). Mínimo 16 caracteres. */
      webhookToken: process.env.INFINITEPAY_WEBHOOK_TOKEN || "",
      apiBase: (process.env.INFINITEPAY_API_BASE || "https://api.checkout.infinitepay.io").replace(/\/+$/, ""),
    },
    paypal: {
      clientId: process.env.PAYPAL_CLIENT_ID || "",
      clientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
      webhookId: process.env.PAYPAL_WEBHOOK_ID || "",
      // "sandbox" = ambiente de testes do PayPal (nenhum dinheiro de verdade); "live" = vendas reais.
      mode: (process.env.PAYPAL_ENV || "sandbox").toLowerCase() === "live" ? ("live" as const) : ("sandbox" as const),
      apiBase: (
        process.env.PAYPAL_API_BASE ||
        ((process.env.PAYPAL_ENV || "sandbox").toLowerCase() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com")
      ).replace(/\/+$/, ""),
    },
    mercadoPago: {
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || "",
      webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET || "",
      apiBase: (process.env.MERCADOPAGO_API_BASE || "https://api.mercadopago.com").replace(/\/+$/, ""),
    },
    superFrete: {
      /** Token da conta SuperFrete do dono (nunca vai ao navegador nem ao painel). */
      token: (process.env.SUPERFRETE_TOKEN || "").trim(),
      apiBase: (process.env.SUPERFRETE_API_BASE || "https://api.superfrete.com").replace(/\/+$/, ""),
      /** E-mail técnico para o cabeçalho User-Agent que a SuperFrete pede. Opcional. */
      contactEmail: (process.env.SUPERFRETE_CONTACT_EMAIL || "").trim(),
      /** Tempo máximo de espera pela SuperFrete (em ms). Passou disso, a loja usa o frete reserva. */
      timeoutMs: Math.min(30_000, Math.max(500, Number(process.env.SUPERFRETE_TIMEOUT_MS) || 6_000)),
    },
    ai: {
      provider: aiProvider,
      apiKey: process.env.AI_API_KEY || "",
      model: process.env.AI_MODEL || "",
      baseUrl: (process.env.AI_BASE_URL || "").replace(/\/+$/, ""),
      /** Teto de perguntas por dia no assistente dos clientes (protege o seu gasto com a IA). */
      shopDailyLimit: Math.max(1, Math.min(100_000, Number(process.env.AI_SHOP_DAILY_LIMIT) || 500)),
    },
  };
}
