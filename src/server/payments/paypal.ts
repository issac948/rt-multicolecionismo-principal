import type { PaymentStatus } from "@/lib/constants";
import { getEnv } from "../env";
import { ExternalServiceError } from "../errors";
import type { CheckoutSession, CreateCheckoutInput, PaymentProvider, ProviderPayment, WebhookVerification } from "./types";

/**
 * PayPal Checkout (Orders v2, API REST usada direto por fetch, sem SDK).
 *
 * Fluxo: a loja cria uma "order" (intent CAPTURE, moeda BRL) -> o cliente é enviado ao PayPal e aprova ->
 * o PayPal devolve o cliente para a loja -> a LOJA cobra (captura) -> o pedido só vira PAGO depois que a
 * resposta da API do PayPal diz que a captura foi COMPLETED (ver services/payments.ts). A volta do cliente
 * para uma página de "sucesso" nunca basta. O webhook é assinado pelo PayPal e conferido na API deles.
 *
 * O `providerPaymentId` guardado é o ID da order do PayPal. Documentação: https://developer.paypal.com/docs/api/orders/v2/
 *
 * ATENÇÃO: esta integração foi testada apenas contra um servidor PayPal SIMULADO (tests/paypal.test.ts).
 * Não foi testada com credenciais reais: isso exige o Client ID/Secret do negócio (ver README).
 */

const REQUEST_TIMEOUT_MS = 15_000;
const CURRENCY = "BRL";

/** 1234 -> "12.34" (sem float, para nunca errar centavos). */
export function centsToPayPalValue(cents: number): string {
  const c = Math.round(cents);
  return `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, "0")}`;
}

/** "12.34" -> 1234 */
export function payPalValueToCents(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

type PpMoney = { currency_code?: string; value?: string };
type PpCapture = { id?: string; status?: string; amount?: PpMoney; status_details?: { reason?: string } };
type PpRefund = { id?: string; status?: string; amount?: PpMoney };
type PpOrder = {
  id?: string;
  status?: string;
  links?: Array<{ rel?: string; href?: string }>;
  purchase_units?: Array<{
    custom_id?: string;
    amount?: PpMoney;
    payments?: { captures?: PpCapture[]; refunds?: PpRefund[] };
  }>;
};

/** Traduz o estado da order/captura do PayPal para os status internos. Nunca trata o que não entende como aprovado. */
export function mapPayPalOrder(order: PpOrder): Omit<ProviderPayment, "provider" | "providerPaymentId"> {
  const unit = order.purchase_units?.[0];
  const captures = unit?.payments?.captures ?? [];
  const capture = captures[captures.length - 1];
  const refundedCents = (unit?.payments?.refunds ?? [])
    .filter((r) => r.status === "COMPLETED")
    .reduce((sum, r) => sum + payPalValueToCents(r.amount?.value), 0);
  const amountCents = capture ? payPalValueToCents(capture.amount?.value) : payPalValueToCents(unit?.amount?.value);

  let status: PaymentStatus = "PENDENTE";
  let rawStatus = order.status ?? "UNKNOWN";
  let statusDetail: string | null = null;

  if (capture) {
    rawStatus = capture.status ?? rawStatus;
    statusDetail = capture.status_details?.reason ?? null;
    switch (capture.status) {
      case "COMPLETED":
      case "PARTIALLY_REFUNDED":
        status = amountCents > 0 && refundedCents >= amountCents ? "REEMBOLSADO" : "APROVADO";
        break;
      case "REFUNDED":
        status = "REEMBOLSADO";
        break;
      case "DECLINED":
      case "FAILED":
        status = "RECUSADO";
        break;
      default:
        status = "PENDENTE"; // PENDING e qualquer valor desconhecido
    }
  } else if (order.status === "VOIDED") {
    status = "CANCELADO";
  }

  return {
    orderId: unit?.custom_id ?? null,
    status,
    rawStatus,
    statusDetail,
    method: "paypal",
    amountCents,
    refundedCents: status === "REEMBOLSADO" ? Math.max(refundedCents, amountCents) : refundedCents,
  };
}

let tokenCache: { token: string; expiresAt: number; key: string } | null = null;

export class PayPalProvider implements PaymentProvider {
  readonly id = "paypal";
  readonly label = "PayPal";
  readonly webhookPath = "/api/webhooks/paypal";

  private get cfg() {
    return getEnv().paypal;
  }

  isConfigured(): boolean {
    return Boolean(this.cfg.clientId && this.cfg.clientSecret);
  }

  private async accessToken(): Promise<string> {
    const { clientId, clientSecret, apiBase } = this.cfg;
    if (!clientId || !clientSecret) throw new ExternalServiceError("O pagamento online ainda não foi configurado pela loja.");
    const key = `${apiBase}|${clientId}`;
    if (tokenCache && tokenCache.key === key && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;

    let response: Response;
    try {
      response = await fetch(`${apiBase}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      console.error("[paypal] falha de rede (token):", error instanceof Error ? error.message : error);
      throw new ExternalServiceError("Não foi possível falar com o PayPal agora. Tente novamente em instantes.");
    }
    if (!response.ok) {
      console.error(`[paypal] token -> ${response.status}`);
      throw new ExternalServiceError("As credenciais do PayPal foram recusadas. Confira o Client ID e o Secret nas configurações do servidor.");
    }
    const json = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new ExternalServiceError("Resposta inválida do PayPal.");
    tokenCache = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 300) * 1000, key };
    return json.access_token;
  }

  /** Chamada autenticada. Devolve também o status HTTP e o JSON para quem precisa tratar erros conhecidos (422). */
  private async call<T>(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown; requestId?: string; allowStatuses?: number[] },
  ): Promise<{ status: number; json: T }> {
    const token = await this.accessToken();
    let response: Response;
    try {
      response = await fetch(`${this.cfg.apiBase}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
          ...(init.requestId ? { "PayPal-Request-Id": init.requestId } : {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      console.error("[paypal] falha de rede:", error instanceof Error ? error.message : error);
      throw new ExternalServiceError("Não foi possível falar com o PayPal agora. Tente novamente em instantes.");
    }

    const text = await response.text();
    let json: unknown = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!response.ok && !(init.allowStatuses ?? []).includes(response.status)) {
      // O corpo do erro pode ter detalhes técnicos: vai para o log, não para o cliente.
      console.error(`[paypal] ${init.method} ${path} -> ${response.status}: ${text.slice(0, 500)}`);
      throw new ExternalServiceError(
        response.status === 401 || response.status === 403
          ? "As credenciais do PayPal foram recusadas. Confira o Client ID e o Secret nas configurações do servidor."
          : "O PayPal recusou a operação. Tente novamente ou fale com a loja.",
      );
    }
    return { status: response.status, json: json as T };
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const items = input.items.map((item) => ({
      name: item.title.slice(0, 127),
      quantity: String(item.quantity),
      unit_amount: { currency_code: CURRENCY, value: centsToPayPalValue(item.unitPriceCents) },
      category: "PHYSICAL_GOODS",
    }));
    const itemsCents = input.items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);

    // Conferência de segurança: o que é enviado ao PayPal TEM que ser o total do pedido.
    if (itemsCents + input.shippingCents !== input.totalCents) {
      throw new ExternalServiceError("O total do pedido não confere com os itens. Pedido não enviado ao pagamento.");
    }

    const back = `${input.siteUrl}/pedido/${input.orderId}`;
    const { json } = await this.call<PpOrder>("/v2/checkout/orders", {
      method: "POST",
      requestId: `pedido-${input.orderId}-${Date.now()}`,
      body: {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: `pedido-${input.orderNumber}`,
            custom_id: input.orderId,
            description: `Pedido #${input.orderNumber}`.slice(0, 127),
            amount: {
              currency_code: CURRENCY,
              value: centsToPayPalValue(input.totalCents),
              breakdown: {
                item_total: { currency_code: CURRENCY, value: centsToPayPalValue(itemsCents) },
                shipping: { currency_code: CURRENCY, value: centsToPayPalValue(input.shippingCents) },
              },
            },
            items,
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              locale: "pt-BR",
              landing_page: "NO_PREFERENCE",
              // O endereço de entrega é coletado pela loja; o PayPal não precisa pedir de novo.
              shipping_preference: "NO_SHIPPING",
              user_action: "PAY_NOW",
              return_url: `${back}/retorno`,
              cancel_url: `${back}?pagamento=cancelado`,
            },
          },
        },
      },
    });

    const approve = json.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
    if (!json.id || !approve) throw new ExternalServiceError("O PayPal não devolveu o link de pagamento. Tente novamente.");
    return { ref: json.id, url: approve };
  }

  async getPayment(providerPaymentId: string): Promise<ProviderPayment> {
    const { json } = await this.call<PpOrder>(`/v2/checkout/orders/${encodeURIComponent(providerPaymentId)}`, { method: "GET" });
    return { provider: this.id, providerPaymentId, ...mapPayPalOrder(json) };
  }

  /** O link do PayPal vence; só reaproveita enquanto a order ainda está esperando o cliente aprovar. */
  async canReuseCheckout(providerPaymentId: string): Promise<boolean> {
    try {
      const { json } = await this.call<PpOrder>(`/v2/checkout/orders/${encodeURIComponent(providerPaymentId)}`, { method: "GET" });
      return json.status === "CREATED" || json.status === "PAYER_ACTION_REQUIRED";
    } catch {
      return false;
    }
  }

  /**
   * Cobra o que o cliente aprovou. Idempotente: se já foi cobrado ou se o cliente ainda não aprovou, não é erro
   * (o estado real é sempre lido depois com `getPayment`).
   */
  async capturePayment(providerPaymentId: string): Promise<void> {
    const { status, json } = await this.call<{ details?: Array<{ issue?: string }> }>(
      `/v2/checkout/orders/${encodeURIComponent(providerPaymentId)}/capture`,
      { method: "POST", body: {}, requestId: `captura-${providerPaymentId}`, allowStatuses: [422] },
    );
    if (status === 422) {
      const issues = (json.details ?? []).map((d) => d.issue);
      const known = issues.some((i) => i === "ORDER_ALREADY_CAPTURED" || i === "ORDER_NOT_APPROVED" || i === "ORDER_ALREADY_AUTHORIZED");
      if (!known) {
        console.error(`[paypal] captura recusada (422): ${issues.join(",")}`);
        throw new ExternalServiceError("O PayPal recusou a cobrança deste pedido. O cliente pode tentar pagar de novo.");
      }
    }
  }

  async verifyWebhook({ headers, body }: { headers: Headers; url: URL; body?: string }): Promise<WebhookVerification> {
    const { webhookId } = this.cfg;
    if (!webhookId) return { valid: false, reason: "webhook_secret_not_configured" };

    let event: { event_type?: string; resource?: Record<string, unknown> };
    try {
      event = JSON.parse(body ?? "");
    } catch {
      return { valid: false, reason: "invalid_body" };
    }

    const h = (name: string) => headers.get(name) ?? "";
    const signature = {
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
    };
    if (Object.values(signature).some((v) => !v)) return { valid: false, reason: "missing_signature", eventType: event.event_type ?? null };
    // O certificado precisa vir de um endereço do próprio PayPal.
    try {
      const host = new URL(signature.cert_url).hostname;
      if (!host.endsWith(".paypal.com")) return { valid: false, reason: "invalid_cert_url", eventType: event.event_type ?? null };
    } catch {
      return { valid: false, reason: "invalid_cert_url", eventType: event.event_type ?? null };
    }

    const { json } = await this.call<{ verification_status?: string }>("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: { ...signature, webhook_id: webhookId, webhook_event: event },
    });
    if (json.verification_status !== "SUCCESS") return { valid: false, reason: "invalid_signature", eventType: event.event_type ?? null };

    const type = event.event_type ?? "";
    const resource = event.resource ?? {};
    if (type === "CHECKOUT.ORDER.APPROVED") {
      return { valid: true, eventType: "payment", paymentId: typeof resource.id === "string" ? resource.id : null, capture: true };
    }
    if (/^PAYMENT\.CAPTURE\.(COMPLETED|PENDING|DENIED|DECLINED|REFUNDED|REVERSED)$/.test(type)) {
      const related = (resource.supplementary_data as { related_ids?: { order_id?: string } } | undefined)?.related_ids;
      return { valid: true, eventType: "payment", paymentId: related?.order_id ?? (await this.orderIdFromResource(resource)) };
    }
    return { valid: true, eventType: type || "unknown", paymentId: null };
  }

  /** Eventos de reembolso não trazem a order: segue o link "up" até a captura e lê o order_id dela. */
  private async orderIdFromResource(resource: Record<string, unknown>): Promise<string | null> {
    const links = (resource.links as Array<{ rel?: string; href?: string }> | undefined) ?? [];
    const up = links.find((l) => l.rel === "up")?.href;
    const match = up?.match(/\/v2\/payments\/captures\/([A-Za-z0-9-]+)$/);
    const captureId = match?.[1] ?? (typeof resource.id === "string" ? resource.id : null);
    if (!captureId) return null;
    try {
      const { json } = await this.call<{ supplementary_data?: { related_ids?: { order_id?: string } } }>(`/v2/payments/captures/${encodeURIComponent(captureId)}`, { method: "GET" });
      return json.supplementary_data?.related_ids?.order_id ?? null;
    } catch {
      return null;
    }
  }

  async refund(providerPaymentId: string, amountCents?: number): Promise<void> {
    const { json: order } = await this.call<PpOrder>(`/v2/checkout/orders/${encodeURIComponent(providerPaymentId)}`, { method: "GET" });
    const captures = order.purchase_units?.[0]?.payments?.captures ?? [];
    const capture = captures[captures.length - 1];
    if (!capture?.id) throw new ExternalServiceError("Este pagamento ainda não foi cobrado no PayPal, então não há o que reembolsar.");
    await this.call(`/v2/payments/captures/${encodeURIComponent(capture.id)}/refund`, {
      method: "POST",
      requestId: `reembolso-${capture.id}-${amountCents ?? "total"}`,
      body: amountCents === undefined ? {} : { amount: { currency_code: CURRENCY, value: centsToPayPalValue(amountCents) } },
    });
  }
}
