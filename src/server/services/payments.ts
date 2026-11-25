import { and, desc, eq, lt, ne, sql } from "drizzle-orm";
import { AWAITING_PAYMENT_STATUSES, PAID_ORDER_STATUSES } from "@/lib/constants";
import { formatBRL } from "@/lib/money";
import { UUID_RE } from "@/lib/schemas";
import { db, type Tx } from "../db";
import { orders, payments, webhookEvents } from "../db/schema";
import { getEnv } from "../env";
import { BusinessRuleError, ExternalServiceError, NotFoundError } from "../errors";
import { notifyOwner, telegramConfigured } from "../notify";
import { getPaymentProvider, type PaymentProvider, type ProviderPayment } from "../payments";
import { parseInfinitePayRef } from "../payments/infinitepay";
import { restoreStockForOrder, tryReacquireStockForOrder } from "./inventory";

const paidLike = PAID_ORDER_STATUSES as readonly string[];

export type PaymentOutcome =
  | "paid"
  | "already_paid"
  | "amount_mismatch"
  | "approved_after_cancel_no_stock"
  | "ignored_refunded"
  | "refunded"
  | "pending"
  | "rejected"
  | "cancelled"
  | "partial_refund_recorded"
  | "ignored_no_order"
  | "ignored_unknown_order"
  | "ignored_order_mismatch";


/**
 * InfinitePay: a mesma transação (transaction_nsu) e o mesmo link (slug) nunca podem valer para DOIS pedidos.
 * A API do InfinitePay deve conferir o vínculo com o pedido; se não conferir, alguém poderia reaproveitar o endereço de volta
 * de um pedido já pago para "quitar" outro pedido de mesmo valor. Esta checagem no banco garante um pagamento = um pedido.
 */
async function infinitePayPaymentUsedByAnotherOrder(tx: Tx, orderId: string, providerPaymentId: string): Promise<boolean> {
  const ref = parseInfinitePayRef(providerPaymentId);
  if (!ref || (!ref.transactionNsu && !ref.slug)) return false;
  const matches = [
    ref.transactionNsu ? sql`split_part(${payments.providerPaymentId}, '|', 2) = ${ref.transactionNsu}` : null,
    ref.slug ? sql`split_part(${payments.providerPaymentId}, '|', 3) = ${ref.slug}` : null,
  ].filter((m): m is NonNullable<typeof m> => m !== null);
  const [other] = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.provider, "infinitepay"), ne(payments.orderId, orderId), sql`(${sql.join(matches, sql` OR `)})`))
    .limit(1);
  return Boolean(other);
}

/**
 * ÚNICO lugar que altera o pedido por causa de um pagamento.
 *
 * Recebe o estado do pagamento já consultado diretamente na API do provedor (nunca
 * o que veio no corpo do webhook nem o que o navegador do cliente diz) e aplica,
 * de forma idempotente, as regras:
 *  - aprovado  -> pedido PAGO (somente se o VALOR conferir com o total do pedido);
 *  - recusado / cancelado / pendente -> registra, sem regredir um pedido já pago;
 *  - reembolsado -> pedido REEMBOLSADO e estoque devolvido (se ainda não enviado).
 * Rodar duas vezes com o mesmo pagamento produz o mesmo resultado.
 */
export async function applyProviderPayment(pp: ProviderPayment): Promise<{ outcome: PaymentOutcome; orderId?: string }> {
  if (!pp.orderId || !UUID_RE.test(pp.orderId)) return { outcome: "ignored_no_order" };
  const orderId = pp.orderId;

  const result = await applyProviderPaymentTx(pp, orderId);
  // Aviso ao dono (Telegram, se configurado): só depois de gravar; falha no aviso nunca afeta o pagamento.
  if (result.outcome === "paid" || result.outcome === "approved_after_cancel_no_stock") await alertOwnerAboutPayment(orderId, result.outcome);
  return result;
}

async function alertOwnerAboutPayment(orderId: string, outcome: "paid" | "approved_after_cancel_no_stock"): Promise<void> {
  if (!telegramConfigured()) return;
  try {
    const [o] = await db.select({ number: orders.number, total: orders.totalCents, ship: orders.shippingMethodLabel }).from(orders).where(eq(orders.id, orderId));
    if (!o) return;
    const link = `${getEnv().siteUrl}/admin/pedidos/${orderId}`;
    await notifyOwner(
      outcome === "paid"
        ? `💰 Pedido #${o.number} PAGO — ${formatBRL(o.total)} (${o.ship}).\n${link}`
        : `⚠️ Pedido #${o.number}: pagamento aprovado mas SEM estoque. Reembolse pelo painel.\n${link}`,
    );
  } catch {
    /* aviso é opcional */
  }
}

async function applyProviderPaymentTx(pp: ProviderPayment, orderId: string) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) return { outcome: "ignored_unknown_order" as const };

    const [existing] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.provider, pp.provider), eq(payments.providerPaymentId, pp.providerPaymentId)));
    if (existing && existing.orderId !== order.id) return { outcome: "ignored_order_mismatch" as const, orderId };

    if (pp.provider === "infinitepay" && (await infinitePayPaymentUsedByAnotherOrder(tx, order.id, pp.providerPaymentId))) {
      if (!paidLike.includes(order.status)) {
        await tx
          .update(orders)
          .set({ attentionNote: "O pagamento informado já está ligado a OUTRO pedido, então este pedido NÃO foi marcado como pago. Confira no app do InfinitePay." })
          .where(eq(orders.id, order.id));
      }
      return { outcome: "ignored_order_mismatch" as const, orderId };
    }

    // Registro do pagamento (um pedido pode ter várias tentativas).
    const paymentValues = {
      method: pp.method,
      status: pp.status,
      amountCents: pp.amountCents,
      refundedCents: pp.refundedCents,
      rawStatus: pp.rawStatus,
      statusDetail: pp.statusDetail,
    };
    if (existing) {
      await tx.update(payments).set(paymentValues).where(eq(payments.id, existing.id));
    } else {
      await tx.insert(payments).values({
        orderId: order.id,
        provider: pp.provider,
        providerPaymentId: pp.providerPaymentId,
        ...paymentValues,
      });
    }

    const now = new Date();

    switch (pp.status) {
      case "APROVADO": {
        if (pp.amountCents !== order.totalCents) {
          await tx
            .update(orders)
            .set({
              attentionNote: `Pagamento ${pp.providerPaymentId} aprovado com valor diferente do pedido (${pp.amountCents} centavos pagos, ${order.totalCents} esperados). O pedido NÃO foi marcado como pago. Confira no provedor.`,
            })
            .where(eq(orders.id, order.id));
          return { outcome: "amount_mismatch" as const, orderId };
        }

        if (paidLike.includes(order.status)) {
          if (order.paymentStatus !== "APROVADO") {
            await tx.update(orders).set({ paymentStatus: "APROVADO" }).where(eq(orders.id, order.id));
          }
          if (pp.refundedCents > 0 && existing?.refundedCents !== pp.refundedCents) {
            return { outcome: "partial_refund_recorded" as const, orderId };
          }
          return { outcome: "already_paid" as const, orderId };
        }
        if (order.status === "REEMBOLSADO") return { outcome: "ignored_refunded" as const, orderId };

        if (order.status === "CANCELADO") {
          // Pagou depois de o pedido expirar/ser cancelado: tenta reservar o estoque de novo.
          const reacquired = await tryReacquireStockForOrder(tx, order.id);
          if (!reacquired) {
            await tx
              .update(orders)
              .set({
                paymentStatus: "APROVADO",
                paymentMethod: pp.method,
                attentionNote:
                  "Pagamento aprovado depois do cancelamento do pedido e já não há estoque suficiente. Faça o reembolso do cliente pelo painel (botão Reembolsar).",
              })
              .where(eq(orders.id, order.id));
            return { outcome: "approved_after_cancel_no_stock" as const, orderId };
          }
        }

        await tx
          .update(orders)
          .set({
            status: "PAGO",
            paymentStatus: "APROVADO",
            paymentMethod: pp.method,
            paidAt: now,
            cancelledAt: null,
            attentionNote: null,
          })
          .where(eq(orders.id, order.id));
        return { outcome: "paid" as const, orderId };
      }

      case "REEMBOLSADO": {
        if (order.status === "REEMBOLSADO") return { outcome: "refunded" as const, orderId };

        if (paidLike.includes(order.status)) {
          await tx
            .update(orders)
            .set({ status: "REEMBOLSADO", paymentStatus: "REEMBOLSADO", attentionNote: null })
            .where(eq(orders.id, order.id));
          // Se a mercadoria ainda não saiu, ela volta para o estoque.
          if (order.status === "PAGO" || order.status === "PROCESSANDO") {
            await restoreStockForOrder(tx, order.id, `Pedido #${order.number} reembolsado`);
          }
        } else {
          // Ex.: pagamento aprovado após cancelamento (sem estoque) e depois reembolsado.
          await tx
            .update(orders)
            .set({ paymentStatus: "REEMBOLSADO", attentionNote: null })
            .where(eq(orders.id, order.id));
        }
        return { outcome: "refunded" as const, orderId };
      }

      case "PENDENTE": {
        // Nunca regride um pedido que já foi pago/encerrado.
        if (order.status === "PENDENTE" || order.status === "PAGAMENTO_PENDENTE") {
          await tx
            .update(orders)
            .set({ status: "PAGAMENTO_PENDENTE", paymentStatus: "PENDENTE", paymentMethod: pp.method })
            .where(eq(orders.id, order.id));
        }
        return { outcome: "pending" as const, orderId };
      }

      case "RECUSADO":
      case "CANCELADO": {
        // O pedido continua aguardando pagamento: o cliente pode tentar de novo até o prazo.
        if (order.status === "PENDENTE" || order.status === "PAGAMENTO_PENDENTE") {
          await tx.update(orders).set({ paymentStatus: pp.status }).where(eq(orders.id, order.id));
        }
        return { outcome: pp.status === "RECUSADO" ? ("rejected" as const) : ("cancelled" as const), orderId };
      }
    }
  });
}

async function logWebhook(entry: {
  provider: string;
  eventType: string | null;
  externalId: string | null;
  signatureValid: boolean;
  outcome: string;
}): Promise<void> {
  try {
    await db.insert(webhookEvents).values(entry);
  } catch (error) {
    console.error("[webhook] não foi possível registrar o evento:", error instanceof Error ? error.message : error);
  }
}

export type WebhookResult = { status: number; outcome: string };

/**
 * Recebe uma notificação do provedor:
 *  1. confere a assinatura (recusa com 401 se inválida);
 *  2. ignora eventos que não são de pagamento;
 *  3. CONSULTA o pagamento na API do provedor (o corpo da notificação não é confiável);
 *  4. aplica o resultado no pedido.
 * Erros temporários devolvem 5xx para o provedor tentar de novo mais tarde.
 */
export async function processPaymentWebhook(request: { headers: Headers; url: URL; body?: string }): Promise<WebhookResult> {
  const provider = getPaymentProvider();
  let verification;
  try {
    verification = await provider.verifyWebhook(request);
  } catch (error) {
    // Não deu para conferir a assinatura (ex.: PayPal fora do ar): o provedor tenta de novo mais tarde.
    if (!(error instanceof ExternalServiceError)) throw error;
    await logWebhook({ provider: provider.id, eventType: null, externalId: null, signatureValid: false, outcome: "verify_unavailable" });
    return { status: 502, outcome: "verify_unavailable" };
  }

  if (!verification.valid) {
    await logWebhook({
      provider: provider.id,
      eventType: verification.eventType ?? null,
      externalId: verification.paymentId ?? null,
      signatureValid: false,
      outcome: verification.reason,
    });
    return { status: verification.reason === "webhook_secret_not_configured" ? 503 : 401, outcome: verification.reason };
  }

  if (verification.eventType !== "payment" || !verification.paymentId) {
    await logWebhook({
      provider: provider.id,
      eventType: verification.eventType,
      externalId: verification.paymentId,
      signatureValid: true,
      outcome: "ignored_event",
    });
    return { status: 200, outcome: "ignored_event" };
  }

  let providerPayment: ProviderPayment;
  try {
    if (verification.capture) await captureApprovedPayment(provider, verification.paymentId);
    providerPayment = await provider.getPayment(verification.paymentId);
  } catch (error) {
    await logWebhook({
      provider: provider.id,
      eventType: verification.eventType,
      externalId: verification.paymentId,
      signatureValid: true,
      outcome: "fetch_failed",
    });
    if (error instanceof ExternalServiceError) return { status: 502, outcome: "fetch_failed" };
    throw error;
  }

  try {
    const result = await applyProviderPayment(providerPayment);
    await logWebhook({
      provider: provider.id,
      eventType: verification.eventType,
      externalId: verification.paymentId,
      signatureValid: true,
      outcome: result.outcome,
    });
    return { status: 200, outcome: result.outcome };
  } catch (error) {
    console.error("[webhook] erro ao aplicar pagamento:", error);
    await logWebhook({
      provider: provider.id,
      eventType: verification.eventType,
      externalId: verification.paymentId,
      signatureValid: true,
      outcome: "apply_failed",
    });
    return { status: 500, outcome: "apply_failed" };
  }
}

/**
 * Provedores em que o cliente "aprova" e a loja COBRA (PayPal): pede a cobrança, mas só se o pedido ainda
 * está aguardando pagamento dentro do prazo. Pedido cancelado/expirado não é cobrado (o dinheiro nem sai da conta do cliente).
 * Devolve true se a cobrança foi pedida. O resultado real é sempre lido depois com `getPayment`.
 */
async function captureApprovedPayment(provider: PaymentProvider, providerOrderId: string): Promise<boolean> {
  if (!provider.capturePayment) return false;
  const [order] = await db
    .select({ status: orders.status, expiresAt: orders.expiresAt })
    .from(orders)
    .where(and(eq(orders.paymentProvider, provider.id), eq(orders.paymentCheckoutRef, providerOrderId)));
  if (!order) return false;
  const waiting = (AWAITING_PAYMENT_STATUSES as readonly string[]).includes(order.status);
  const expired = order.expiresAt !== null && order.expiresAt.getTime() <= Date.now();
  if (!waiting || expired) return false;
  await provider.capturePayment(providerOrderId);
  return true;
}

export type ReturnOutcome = PaymentOutcome | "not_applicable" | "unavailable" | "not_captured";

/**
 * Chamada quando o cliente VOLTA do PayPal. O endereço de volta não prova nada: o que vale é a resposta da API do
 * provedor, consultada aqui com o ID que a PRÓPRIA loja guardou no pedido (o que vem na URL é ignorado).
 * Para provedores sem captura nem consulta no retorno (Mercado Pago) não faz nada: quem decide é o webhook.
 * No InfinitePay a URL de volta traz transaction_nsu e slug, usados só para perguntar à API do InfinitePay.
 */
export async function confirmPaymentOnReturn(orderId: string, query: URLSearchParams = new URLSearchParams()): Promise<ReturnOutcome> {
  if (!UUID_RE.test(orderId)) return "not_applicable";
  const provider = getPaymentProvider();
  if (!provider.capturePayment && !provider.getPaymentOnReturn) return "not_applicable";

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.paymentProvider !== provider.id || !order.paymentCheckoutRef) return "not_applicable";
  if (paidLike.includes(order.status)) return "already_paid";

  try {
    let pp: ProviderPayment;
    if (provider.getPaymentOnReturn) {
      // O que vem na URL só serve de pergunta à API do provedor; a resposta dela é que vale.
      pp = await provider.getPaymentOnReturn(order.paymentCheckoutRef, query);
    } else {
      await captureApprovedPayment(provider, order.paymentCheckoutRef);
      pp = await provider.getPayment(order.paymentCheckoutRef);
    }
    // O pagamento tem que pertencer a ESTE pedido (custom_id enviado na criação).
    if (pp.orderId !== order.id) return "ignored_order_mismatch";
    const result = await applyProviderPayment(pp);
    return result.outcome === "pending" ? "not_captured" : result.outcome;
  } catch (error) {
    if (error instanceof ExternalServiceError) return "unavailable";
    throw error;
  }
}

/**
 * Reembolso total pelo painel. Pede ao provedor e, se ele já confirmar, atualiza o
 * pedido na hora; senão o webhook de "reembolsado" conclui a atualização.
 */
export async function refundOrder(orderId: string): Promise<{ confirmed: boolean }> {
  const provider = getPaymentProvider();

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new NotFoundError("Pedido não encontrado.");
  if (order.status === "REEMBOLSADO" || order.paymentStatus === "REEMBOLSADO") {
    throw new BusinessRuleError("Este pedido já foi reembolsado.");
  }

  const [approved] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.status, "APROVADO"), eq(payments.provider, provider.id)))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  if (!approved) throw new BusinessRuleError("Não há pagamento aprovado para reembolsar neste pedido.");

  if (provider.manualRefund) {
    // O dono já devolveu o dinheiro pelo app do provedor (ex.: InfinitePay): aqui só se registra o reembolso.
    await applyProviderPayment({
      provider: provider.id,
      providerPaymentId: approved.providerPaymentId,
      orderId,
      status: "REEMBOLSADO",
      rawStatus: "manual_refund",
      statusDetail: "Reembolso feito pelo dono no app do provedor",
      method: approved.method,
      amountCents: approved.amountCents,
      refundedCents: approved.amountCents,
    });
    return { confirmed: true };
  }

  await provider.refund(approved.providerPaymentId);

  const current = await provider.getPayment(approved.providerPaymentId);
  if (current.status === "REEMBOLSADO" || current.refundedCents >= current.amountCents) {
    await applyProviderPayment({ ...current, status: "REEMBOLSADO" });
    return { confirmed: true };
  }
  return { confirmed: false };
}

/** Remove registros antigos de webhook (mantém 90 dias para auditoria). */
export async function purgeOldWebhookEvents(days = 90): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const removed = await db.delete(webhookEvents).where(lt(webhookEvents.createdAt, cutoff)).returning({ id: webhookEvents.id });
  return removed.length;
}
