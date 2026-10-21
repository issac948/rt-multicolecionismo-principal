import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PaymentStatus } from "@/lib/constants";
import { getEnv } from "../env";
import { ExternalServiceError } from "../errors";
import type {
  CheckoutSession,
  CreateCheckoutInput,
  PaymentProvider,
  ProviderPayment,
  WebhookVerification,
} from "./types";

/**
 * Mercado Pago (Checkout Pro): a loja cria uma "preferência", envia o cliente para a página
 * segura do Mercado Pago (Pix, cartão, boleto) e recebe um webhook quando o pagamento muda.
 * Usamos a API REST diretamente (fetch), sem SDK, para ter menos dependências.
 *
 * Documentação: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro
 */

const REQUEST_TIMEOUT_MS = 15_000;

/** Traduz o status do Mercado Pago para os status internos. */
export function mapMercadoPagoStatus(status: string | undefined | null): PaymentStatus {
  switch (status) {
    case "approved":
      return "APROVADO";
    case "refunded":
    case "charged_back":
      return "REEMBOLSADO";
    case "rejected":
      return "RECUSADO";
    case "cancelled":
    case "expired":
      return "CANCELADO";
    // pending, in_process, in_mediation, authorized e qualquer valor desconhecido:
    // nunca tratamos algo que não entendemos como aprovado.
    default:
      return "PENDENTE";
  }
}

function toCents(amount: unknown): number {
  const n = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function toReais(cents: number): number {
  return Math.round(cents) / 100;
}

type MpPayment = {
  id?: number | string;
  status?: string;
  status_detail?: string;
  payment_type_id?: string;
  payment_method_id?: string;
  transaction_amount?: number;
  transaction_amount_refunded?: number;
  external_reference?: string | null;
};

export class MercadoPagoProvider implements PaymentProvider {
  readonly id = "mercadopago";
  readonly label = "Mercado Pago";
  readonly webhookPath = "/api/webhooks/mercadopago";

  private get cfg() {
    return getEnv().mercadoPago;
  }

  isConfigured(): boolean {
    return Boolean(this.cfg.accessToken && this.cfg.webhookSecret);
  }

  private async request<T>(path: string, init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string }): Promise<T> {
    if (!this.cfg.accessToken) {
      throw new ExternalServiceError("O pagamento online ainda não foi configurado pela loja.");
    }

    let response: Response;
    try {
      response = await fetch(`${this.cfg.apiBase}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${this.cfg.accessToken}`,
          "Content-Type": "application/json",
          ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      console.error("[mercadopago] falha de rede:", error instanceof Error ? error.message : error);
      throw new ExternalServiceError("Não foi possível falar com o Mercado Pago agora. Tente novamente em instantes.");
    }

    const text = await response.text();
    if (!response.ok) {
      // O corpo do erro pode ter detalhes técnicos: vai para o log, não para o cliente.
      console.error(`[mercadopago] ${init.method} ${path} -> ${response.status}: ${text.slice(0, 500)}`);
      throw new ExternalServiceError(
        response.status === 401 || response.status === 403
          ? "As credenciais do Mercado Pago foram recusadas. Verifique o Access Token nas configurações do servidor."
          : "O Mercado Pago recusou a operação. Tente novamente ou fale com a loja.",
      );
    }
    try {
      return (text ? JSON.parse(text) : {}) as T;
    } catch {
      throw new ExternalServiceError("Resposta inválida do Mercado Pago.");
    }
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const items = input.items.map((item) => ({
      title: item.title.slice(0, 250),
      quantity: item.quantity,
      unit_price: toReais(item.unitPriceCents),
      currency_id: "BRL",
    }));
    if (input.shippingCents > 0) {
      items.push({ title: "Frete", quantity: 1, unit_price: toReais(input.shippingCents), currency_id: "BRL" });
    }

    // Conferência de segurança: a soma enviada ao Mercado Pago TEM que ser o total do pedido.
    const sentTotal = items.reduce((sum, i) => sum + toCents(i.unit_price) * i.quantity, 0);
    if (sentTotal !== input.totalCents) {
      throw new ExternalServiceError("O total do pedido não confere com os itens. Pedido não enviado ao pagamento.");
    }

    const excludedTypes: Array<{ id: string }> = [];
    if (!input.methods.pix) excludedTypes.push({ id: "bank_transfer" });
    if (!input.methods.card) excludedTypes.push({ id: "credit_card" }, { id: "debit_card" }, { id: "prepaid_card" });
    if (!input.methods.boleto) excludedTypes.push({ id: "ticket" });

    const isHttps = input.siteUrl.startsWith("https://");
    const backBase = `${input.siteUrl}/pedido/${input.orderId}`;

    const body: Record<string, unknown> = {
      items,
      external_reference: input.orderId,
      payer: {
        name: input.payer.name,
        email: input.payer.email,
      },
      back_urls: { success: backBase, pending: backBase, failure: backBase },
      payment_methods: {
        excluded_payment_types: excludedTypes,
        installments: Math.max(1, input.methods.maxInstallments),
      },
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: input.expiresAt.toISOString(),
      metadata: { order_id: input.orderId, order_number: input.orderNumber },
    };
    // O Mercado Pago só aceita retorno automático e notificações em endereços https públicos.
    if (isHttps) {
      body.auto_return = "approved";
      body.notification_url = `${input.siteUrl}/api/webhooks/mercadopago`;
    }

    const result = await this.request<{ id?: string; init_point?: string }>("/checkout/preferences", {
      method: "POST",
      body,
      idempotencyKey: randomUUID(),
    });

    if (!result.id || !result.init_point) {
      throw new ExternalServiceError("Resposta inesperada do Mercado Pago ao criar o pagamento.");
    }
    return { ref: String(result.id), url: result.init_point };
  }

  async getPayment(providerPaymentId: string): Promise<ProviderPayment> {
    if (!/^\d{1,20}$/.test(providerPaymentId)) {
      throw new ExternalServiceError("Identificador de pagamento inválido.");
    }
    const payment = await this.request<MpPayment>(`/v1/payments/${providerPaymentId}`, { method: "GET" });
    const refunded = toCents(payment.transaction_amount_refunded ?? 0);
    const amount = toCents(payment.transaction_amount ?? 0);

    return {
      provider: this.id,
      providerPaymentId: String(payment.id ?? providerPaymentId),
      orderId: payment.external_reference ? String(payment.external_reference) : null,
      status: mapMercadoPagoStatus(payment.status),
      rawStatus: String(payment.status ?? "unknown"),
      statusDetail: payment.status_detail ? String(payment.status_detail) : null,
      method: payment.payment_type_id ? String(payment.payment_type_id) : (payment.payment_method_id ?? null),
      amountCents: amount,
      refundedCents: refunded,
    };
  }

  /**
   * Valida a assinatura `x-signature` conforme a documentação do Mercado Pago:
   * HMAC-SHA256 (chave = "assinatura secreta" da aplicação) sobre
   * "id:<data.id>;request-id:<x-request-id>;ts:<ts>;".
   */
  verifyWebhook({ headers, url }: { headers: Headers; url: URL }): WebhookVerification {
    const secret = this.cfg.webhookSecret;
    const eventType = url.searchParams.get("type") ?? url.searchParams.get("topic");
    const rawId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
    const paymentId = rawId && /^\d{1,20}$/.test(rawId) ? rawId : null;

    if (!secret) return { valid: false, reason: "webhook_secret_not_configured", eventType, paymentId };

    const signature = headers.get("x-signature");
    const requestId = headers.get("x-request-id");
    if (!signature) return { valid: false, reason: "missing_signature", eventType, paymentId };

    let ts: string | undefined;
    let v1: string | undefined;
    for (const part of signature.split(",")) {
      const [key, value] = part.split("=").map((s) => s.trim());
      if (key === "ts") ts = value;
      if (key === "v1") v1 = value;
    }
    if (!ts || !v1) return { valid: false, reason: "malformed_signature", eventType, paymentId };

    // Para ids alfanuméricos o Mercado Pago pede minúsculas; ids numéricos não mudam.
    const manifestId = rawId ? rawId.toLowerCase() : null;
    let manifest = "";
    if (manifestId) manifest += `id:${manifestId};`;
    if (requestId) manifest += `request-id:${requestId};`;
    manifest += `ts:${ts};`;

    const expected = createHmac("sha256", secret).update(manifest).digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(v1, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valid: false, reason: "signature_mismatch", eventType, paymentId };
    }
    return { valid: true, eventType: eventType ?? "unknown", paymentId };
  }

  async refund(providerPaymentId: string, amountCents?: number): Promise<void> {
    if (!/^\d{1,20}$/.test(providerPaymentId)) {
      throw new ExternalServiceError("Identificador de pagamento inválido.");
    }
    await this.request(`/v1/payments/${providerPaymentId}/refunds`, {
      method: "POST",
      body: amountCents === undefined ? {} : { amount: toReais(amountCents) },
      idempotencyKey: randomUUID(),
    });
  }
}
