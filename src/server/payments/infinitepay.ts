import { timingSafeEqual } from "node:crypto";
import type { PaymentStatus } from "@/lib/constants";
import { getEnv } from "../env";
import { ExternalServiceError } from "../errors";
import type { CheckoutSession, CreateCheckoutInput, PaymentProvider, ProviderPayment, WebhookVerification } from "./types";

/**
 * InfinitePay (Checkout Integrado): a loja cria um link de pagamento, o cliente paga (Pix ou cartão) na página do
 * InfinitePay e volta à loja. O InfinitePay também avisa por webhook.
 *
 * Segurança (o webhook do InfinitePay NÃO tem assinatura):
 *  1. o endereço do webhook leva um segredo (INFINITEPAY_WEBHOOK_TOKEN) que só a loja e o InfinitePay conhecem;
 *  2. mesmo assim o corpo nunca decide nada: o pagamento é SEMPRE conferido de novo na API (payment_check) e o valor
 *     precisa bater com o total do pedido (regra em services/payments.ts).
 *
 * Documentação: https://ajuda.infinitepay.io/pt-BR/articles/10766888-como-usar-o-checkout-integrado-da-infinitepay
 * Não validado com o InfinitePay real: testado só contra um servidor simulado.
 */

const REQUEST_TIMEOUT_MS = 15_000;
const SAFE_PART = /^[A-Za-z0-9_-]{1,120}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O ID do pagamento guardado é "pedido|transaction_nsu|slug" (as duas últimas partes só existem depois do pagamento). */
export function buildInfinitePayRef(orderId: string, transactionNsu?: string | null, slug?: string | null): string {
  return transactionNsu && slug ? `${orderId}|${transactionNsu}|${slug}` : orderId;
}

export function parseInfinitePayRef(ref: string): { orderId: string; transactionNsu: string | null; slug: string | null } | null {
  const [orderId, transactionNsu, slug, extra] = ref.split("|");
  if (extra !== undefined || !orderId || !UUID.test(orderId)) return null;
  if (transactionNsu !== undefined && !SAFE_PART.test(transactionNsu)) return null;
  if (slug !== undefined && !SAFE_PART.test(slug)) return null;
  return { orderId, transactionNsu: transactionNsu ?? null, slug: slug ?? null };
}

type PaymentCheck = {
  success?: boolean;
  paid?: boolean;
  amount?: number | string;
  paid_amount?: number | string;
  installments?: number;
  capture_method?: string;
};

function cents(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function mapMethod(method: string | undefined): string | null {
  if (method === "pix") return "pix";
  if (method === "credit_card") return "credit_card";
  if (method === "debit_card") return "debit_card";
  return method || null;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Telefone no formato internacional (+55...), ou null se não der para montar com segurança. */
function internationalPhone(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  const national = digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits;
  return national.length === 10 || national.length === 11 ? `+55${national}` : null;
}

export class InfinitePayProvider implements PaymentProvider {
  readonly id = "infinitepay";
  readonly label = "InfinitePay";
  readonly webhookPath = "/api/webhooks/infinitepay";
  /** O InfinitePay não tem reembolso por API: o dono devolve o dinheiro pelo app e marca o pedido aqui. */
  readonly manualRefund = true;

  private get cfg() {
    return getEnv().infinitePay;
  }

  isConfigured(): boolean {
    return Boolean(this.cfg.handle) && this.cfg.webhookToken.length >= 16;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.cfg.apiBase}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      console.error("[infinitepay] falha de rede:", error instanceof Error ? error.message : error);
      throw new ExternalServiceError("Não foi possível falar com o InfinitePay agora. Tente novamente em instantes.");
    }
    const text = await response.text();
    if (!response.ok) {
      console.error(`[infinitepay] POST ${path} -> ${response.status}: ${text.slice(0, 500)}`);
      throw new ExternalServiceError("O InfinitePay recusou a operação. Tente novamente ou fale com a loja.");
    }
    try {
      return (text ? JSON.parse(text) : {}) as T;
    } catch {
      throw new ExternalServiceError("Resposta inesperada do InfinitePay. Tente novamente em instantes.");
    }
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const items = input.items.map((i) => ({ quantity: i.quantity, price: i.unitPriceCents, description: i.title.slice(0, 100) }));
    if (input.shippingCents > 0) items.push({ quantity: 1, price: input.shippingCents, description: "Frete" });
    const phone = internationalPhone(input.payer.phone);
    const json = await this.post<{ url?: string }>("/links", {
      handle: this.cfg.handle,
      order_nsu: input.orderId,
      redirect_url: `${input.siteUrl}/pedido/${input.orderId}/retorno`,
      webhook_url: `${input.siteUrl}${this.webhookPath}?t=${encodeURIComponent(this.cfg.webhookToken)}`,
      items,
      customer: { name: input.payer.name, email: input.payer.email, ...(phone ? { phone_number: phone } : {}) },
    });
    if (!json.url || !/^https:\/\//i.test(json.url)) {
      console.error("[infinitepay] resposta sem link de pagamento válido");
      throw new ExternalServiceError("O InfinitePay não devolveu o link de pagamento. Tente novamente em instantes.");
    }
    return { ref: input.orderId, url: json.url };
  }

  async getPayment(providerPaymentId: string): Promise<ProviderPayment> {
    const ref = parseInfinitePayRef(providerPaymentId);
    if (!ref) throw new ExternalServiceError("Identificador de pagamento inválido.");
    const json = await this.post<PaymentCheck>("/payment_check", {
      handle: this.cfg.handle,
      order_nsu: ref.orderId,
      ...(ref.transactionNsu ? { transaction_nsu: ref.transactionNsu } : {}),
      ...(ref.slug ? { slug: ref.slug } : {}),
    });
    const amountCents = cents(json.amount);
    const paidCents = json.paid_amount === undefined ? amountCents : cents(json.paid_amount);
    // Só vale como pago se o InfinitePay disser que foi pago E o valor pago cobrir o valor cobrado
    // (com parcelamento o cliente pode pagar mais, por causa dos juros, mas nunca menos).
    const status: PaymentStatus = json.paid === true && amountCents > 0 && paidCents >= amountCents ? "APROVADO" : "PENDENTE";
    return {
      provider: this.id,
      providerPaymentId,
      orderId: ref.orderId,
      status,
      rawStatus: json.paid === true ? "paid" : "not_paid",
      statusDetail: json.installments && json.installments > 1 ? `${json.installments}x` : null,
      method: mapMethod(json.capture_method),
      amountCents,
      refundedCents: 0,
    };
  }

  verifyWebhook({ url, body }: { headers: Headers; url: URL; body?: string }): WebhookVerification {
    const expected = this.cfg.webhookToken;
    if (expected.length < 16) return { valid: false, reason: "webhook_secret_not_configured" };
    const given = url.searchParams.get("t") ?? "";
    if (!safeEqual(given, expected)) return { valid: false, reason: "invalid_token" };

    let event: { order_nsu?: unknown; transaction_nsu?: unknown; invoice_slug?: unknown };
    try {
      event = JSON.parse(body ?? "");
    } catch {
      return { valid: false, reason: "invalid_body" };
    }
    const orderId = typeof event.order_nsu === "string" ? event.order_nsu : "";
    const tx = typeof event.transaction_nsu === "string" ? event.transaction_nsu : "";
    const slug = typeof event.invoice_slug === "string" ? event.invoice_slug : "";
    const ref = parseInfinitePayRef(buildInfinitePayRef(orderId, tx, slug));
    if (!ref || !ref.transactionNsu) return { valid: false, reason: "invalid_body" };
    return { valid: true, eventType: "payment", paymentId: buildInfinitePayRef(ref.orderId, ref.transactionNsu, ref.slug) };
  }

  /** O cliente voltou à loja: a URL traz transaction_nsu e slug; eles só servem de PERGUNTA ao payment_check. */
  async getPaymentOnReturn(orderRef: string, query: URLSearchParams): Promise<ProviderPayment> {
    const tx = query.get("transaction_nsu");
    const slug = query.get("slug");
    const ref = tx && slug && SAFE_PART.test(tx) && SAFE_PART.test(slug) ? buildInfinitePayRef(orderRef, tx, slug) : orderRef;
    return this.getPayment(ref);
  }

  async refund(): Promise<void> {
    // Nada a chamar: o InfinitePay não oferece reembolso por API. O dono devolve pelo app e confirma no painel.
  }
}
