import path from "node:path";

export type AiProviderId = "anthropic" | "openai" | "none";
export type PaymentProviderId = "paypal" | "mercadopago" | "infinitepay";
export type StorageDriverId = "local" | "database" | "s3";

/** Hospedagem "sem servidor" (Netlify, AWS Lambda, Vercel): o disco do servidor é temporário e some a cada publicação. */
export function isServerlessRuntime(): boolean {
  return Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL);
}

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
    isServerless: isServerlessRuntime(),
    /**
     * Tamanho do plano do banco de dados contratado (em MB), só para avisos no painel e para recusar fotos quando ele estiver quase cheio.
     * O padrão (512) é conservador; o plano gratuito atual do Neon informa 1 GB (1024). Confira no painel do Neon e ajuste.
     */
    databasePlanLimitBytes: Math.max(100, Math.min(10_000_000, Number(process.env.DATABASE_PLAN_LIMIT_MB) || 512)) * 1024 * 1024,
    cronSecret: process.env.CRON_SECRET || "",
    storage: {
      /**
       * Onde ficam as fotos. Sem STORAGE_DRIVER: em hospedagem sem servidor (Netlify) usa o próprio banco PostgreSQL ("database"),
       * pois o disco de lá não é permanente; em computador/servidor comum usa a pasta de uploads ("local").
       */
      driver: ((): StorageDriverId => {
        const v = (process.env.STORAGE_DRIVER || "").toLowerCase();
        if (v === "local" || v === "database" || v === "s3") return v;
        return isServerlessRuntime() ? "database" : "local";
      })(),
      /**
       * Teto para as fotos guardadas no banco (em MB). Passou disso, novos envios são recusados com aviso claro:
       * assim as fotos nunca enchem o plano do banco e derrubam pedidos e pagamentos.
       */
      dbMaxBytes: Math.max(10, Math.min(100_000, Number(process.env.STORAGE_DB_MAX_MB) || 300)) * 1024 * 1024,
      /** Endereço público base das fotos quando elas ficam em um serviço externo com CDN (ex.: https://fotos.minhaloja.com.br). */
      publicBaseUrl: (process.env.STORAGE_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, ""),
      s3: {
        endpoint: (process.env.S3_ENDPOINT || "").trim().replace(/\/+$/, ""),
        region: (process.env.S3_REGION || "auto").trim(),
        bucket: (process.env.S3_BUCKET || "").trim(),
        accessKeyId: (process.env.S3_ACCESS_KEY_ID || "").trim(),
        secretAccessKey: (process.env.S3_SECRET_ACCESS_KEY || "").trim(),
      },
    },
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
