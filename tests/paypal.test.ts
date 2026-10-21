import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orders, payments, products, webhookEvents } from "@/server/db/schema";
import { addToCart, getOrCreateUserCart } from "@/server/services/cart";
import { createOrderFromCart, startPaymentForOrder } from "@/server/services/orders";
import { confirmPaymentOnReturn, processPaymentWebhook, refundOrder } from "@/server/services/payments";
import { centsToPayPalValue, mapPayPalOrder } from "@/server/payments/paypal";
import { ExternalServiceError } from "@/server/errors";
import { createAddress, createTestProduct, createUser, db, paypalWebhook, resetDb, startMockPayPal, type MockPp } from "./helpers";

// Tudo aqui roda contra um PayPal SIMULADO (tests/helpers.ts). Não prova funcionamento com o PayPal real.
let pp: MockPp;
beforeAll(async () => {
  pp = await startMockPayPal();
});
afterAll(async () => {
  await pp.close();
});
beforeEach(async () => {
  await resetDb();
  pp.orders.clear();
  pp.captureCalls = 0;
  pp.failCreate = false;
});

async function makeOrder(price = 10000) {
  const product = await createTestProduct({ stock: 5, priceCents: price });
  const user = await createUser();
  const address = await createAddress(user.id);
  const cartId = await getOrCreateUserCart(user.id);
  await addToCart(cartId, product.id, 1);
  const order = await createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "ENTREGA", note: null });
  return { product, user, order };
}
const loadOrder = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0];
const stockOf = async (id: string) => (await db.select().from(products).where(eq(products.id, id)))[0].stock;
const webhook = (type: string, resource: Record<string, unknown>, opts = {}) => processPaymentWebhook(paypalWebhook(type, resource, opts));

/** Cria o checkout e devolve o ID da order no PayPal simulado. */
async function startPaying() {
  const made = await makeOrder();
  const { url } = await startPaymentForOrder(made.order.id, made.user.id);
  const ppId = (await loadOrder(made.order.id)).paymentCheckoutRef!;
  return { ...made, url, ppId };
}

describe("PayPal: tradução de valores e status", () => {
  it("centavos viram texto com 2 casas, sem erro de ponto flutuante", () => {
    expect(centsToPayPalValue(5)).toBe("0.05");
    expect(centsToPayPalValue(1234)).toBe("12.34");
    expect(centsToPayPalValue(10000)).toBe("100.00");
    expect(centsToPayPalValue(1999)).toBe("19.99");
  });

  it("só 'COMPLETED' vira aprovado; o que não se entende nunca aprova", () => {
    const base = { purchase_units: [{ custom_id: "x", amount: { value: "10.00" } }] };
    const withCapture = (status: string) => ({ ...base, purchase_units: [{ ...base.purchase_units[0], payments: { captures: [{ id: "c", status, amount: { value: "10.00" } }] } }] });
    expect(mapPayPalOrder(withCapture("COMPLETED")).status).toBe("APROVADO");
    expect(mapPayPalOrder(withCapture("PENDING")).status).toBe("PENDENTE");
    expect(mapPayPalOrder(withCapture("ALGO_NOVO")).status).toBe("PENDENTE");
    expect(mapPayPalOrder(withCapture("DECLINED")).status).toBe("RECUSADO");
    expect(mapPayPalOrder(withCapture("REFUNDED")).status).toBe("REEMBOLSADO");
    expect(mapPayPalOrder({ ...base, status: "APPROVED" }).status).toBe("PENDENTE");
    expect(mapPayPalOrder({ ...base, status: "VOIDED" }).status).toBe("CANCELADO");
  });
});

describe("PayPal: criação do pagamento", () => {
  it("envia moeda BRL, total IGUAL ao do pedido, custom_id e endereços de volta", async () => {
    const { order, url, ppId } = await startPaying();
    expect(url).toBe(`https://paypal.test/approve/${ppId}`);
    const sent = pp.orders.get(ppId)!.request;
    const unit = sent.purchase_units[0];
    expect(unit.custom_id).toBe(order.id);
    expect(unit.amount.currency_code).toBe("BRL");
    expect(unit.amount.value).toBe(centsToPayPalValue(order.totalCents));
    const items = unit.items.reduce((s: number, i: any) => s + Math.round(Number(i.unit_amount.value) * 100) * Number(i.quantity), 0);
    expect(items + Math.round(Number(unit.amount.breakdown.shipping.value) * 100)).toBe(order.totalCents);
    expect(sent.intent).toBe("CAPTURE");
    const ctx = sent.payment_source.paypal.experience_context;
    expect(ctx.return_url).toBe(`http://localhost:3000/pedido/${order.id}/retorno`);
    expect(ctx.cancel_url).toContain(`/pedido/${order.id}`);
    expect((await loadOrder(order.id)).status).toBe("PAGAMENTO_PENDENTE");
  });

  it("reaproveita o link enquanto vale e cria outro quando o do PayPal já não serve", async () => {
    const { order, user, url, ppId } = await startPaying();
    expect((await startPaymentForOrder(order.id, user.id)).url).toBe(url);
    expect(pp.orders.size).toBe(1);
    pp.orders.get(ppId)!.status = "VOIDED";
    const again = await startPaymentForOrder(order.id, user.id);
    expect(again.url).not.toBe(url);
    expect(pp.orders.size).toBe(2);
  });

  it("sem credenciais, avisa claramente e não chama o PayPal", async () => {
    const { order, user } = await makeOrder();
    const saved = process.env.PAYPAL_CLIENT_ID;
    process.env.PAYPAL_CLIENT_ID = "";
    try {
      await expect(startPaymentForOrder(order.id, user.id)).rejects.toThrow(ExternalServiceError);
    } finally {
      process.env.PAYPAL_CLIENT_ID = saved;
    }
    expect(pp.orders.size).toBe(0);
  });

  it("falha do PayPal não marca nada como pago e deixa tentar de novo", async () => {
    const { order, user } = await makeOrder();
    pp.failCreate = true;
    await expect(startPaymentForOrder(order.id, user.id)).rejects.toThrow(ExternalServiceError);
    expect((await loadOrder(order.id)).status).toBe("PENDENTE");
    pp.failCreate = false;
    await expect(startPaymentForOrder(order.id, user.id)).resolves.toHaveProperty("url");
  });
});

describe("PayPal: volta do cliente (a loja cobra e confere na API)", () => {
  it("cliente aprovou: a loja captura, consulta e só então o pedido fica PAGO (uma única vez)", async () => {
    const { order, ppId } = await startPaying();
    pp.approve(ppId);
    expect(await confirmPaymentOnReturn(order.id)).toBe("paid");
    const paid = await loadOrder(order.id);
    expect(paid.status).toBe("PAGO");
    expect(paid.paymentMethod).toBe("paypal");
    expect(await confirmPaymentOnReturn(order.id)).toBe("already_paid");
    expect(pp.captureCalls).toBe(1);
    expect(await db.select().from(payments).where(eq(payments.orderId, order.id))).toHaveLength(1);
  });

  it("chegar na página de retorno SEM aprovar no PayPal não paga o pedido", async () => {
    const { order } = await startPaying();
    expect(await confirmPaymentOnReturn(order.id)).toBe("not_captured");
    expect((await loadOrder(order.id)).status).toBe("PAGAMENTO_PENDENTE");
  });

  it("pedido cancelado/expirado não é cobrado, mesmo que o cliente tenha aprovado", async () => {
    const { order, ppId, product } = await startPaying();
    await db.update(orders).set({ status: "CANCELADO" }).where(eq(orders.id, order.id));
    pp.approve(ppId);
    await confirmPaymentOnReturn(order.id);
    expect(pp.captureCalls).toBe(0);
    expect((await loadOrder(order.id)).status).toBe("CANCELADO");
    expect(await stockOf(product.id)).toBeLessThanOrEqual(5);
  });

  it("pagamento que pertence a OUTRO pedido é ignorado", async () => {
    const { order, ppId } = await startPaying();
    pp.orders.get(ppId)!.custom_id = "11111111-1111-4111-8111-111111111111";
    pp.approve(ppId);
    expect(await confirmPaymentOnReturn(order.id)).toBe("ignored_order_mismatch");
    expect((await loadOrder(order.id)).status).toBe("PAGAMENTO_PENDENTE");
  });

  it("valor diferente do pedido: não paga e deixa aviso para o administrador", async () => {
    const { order, ppId } = await startPaying();
    pp.orders.get(ppId)!.amount = "1.00";
    pp.approve(ppId);
    expect(await confirmPaymentOnReturn(order.id)).toBe("amount_mismatch");
    const o = await loadOrder(order.id);
    expect(o.status).not.toBe("PAGO");
    expect(o.attentionNote).toContain("valor diferente");
  });

  it("pedido sem pagamento iniciado: nada acontece", async () => {
    const { order } = await makeOrder();
    expect(await confirmPaymentOnReturn(order.id)).toBe("not_applicable");
    expect(await confirmPaymentOnReturn("não-é-uuid")).toBe("not_applicable");
  });
});

describe("PayPal: webhook", () => {
  it("assinatura inválida: 401, nada muda e o evento fica registrado", async () => {
    const { order, ppId } = await startPaying();
    pp.approve(ppId);
    const r = await webhook("CHECKOUT.ORDER.APPROVED", { id: ppId }, { signature: "falsa" });
    expect(r.status).toBe(401);
    expect((await loadOrder(order.id)).status).toBe("PAGAMENTO_PENDENTE");
    expect(pp.captureCalls).toBe(0);
    const log = await db.select().from(webhookEvents);
    expect(log[0]).toMatchObject({ provider: "paypal", signatureValid: false });
  });

  it("sem cabeçalhos de assinatura ou com certificado de outro domínio: 401", async () => {
    const { ppId } = await startPaying();
    expect((await webhook("CHECKOUT.ORDER.APPROVED", { id: ppId }, { omitHeaders: true })).status).toBe(401);
    expect((await webhook("CHECKOUT.ORDER.APPROVED", { id: ppId }, { certUrl: "https://evil.example.com/cert" })).status).toBe(401);
  });

  it("sem PAYPAL_WEBHOOK_ID configurado: 503", async () => {
    const saved = process.env.PAYPAL_WEBHOOK_ID;
    process.env.PAYPAL_WEBHOOK_ID = "";
    try {
      expect((await webhook("CHECKOUT.ORDER.APPROVED", { id: "x" })).status).toBe(503);
    } finally {
      process.env.PAYPAL_WEBHOOK_ID = saved;
    }
  });

  it("CHECKOUT.ORDER.APPROVED: a loja captura sozinha e o pedido fica PAGO (cliente fechou a página)", async () => {
    const { order, ppId } = await startPaying();
    pp.approve(ppId);
    const r = await webhook("CHECKOUT.ORDER.APPROVED", { id: ppId });
    expect(r).toEqual({ status: 200, outcome: "paid" });
    expect((await loadOrder(order.id)).status).toBe("PAGO");
    // Reenvio do mesmo evento: idempotente.
    expect((await webhook("CHECKOUT.ORDER.APPROVED", { id: ppId })).outcome).toBe("already_paid");
    expect(pp.captureCalls).toBe(1);
  });

  it("evento 'COMPLETED' assinado, mas a API do PayPal diz que não houve cobrança: NÃO paga", async () => {
    const { order, ppId } = await startPaying();
    const r = await webhook("PAYMENT.CAPTURE.COMPLETED", { id: "CAP-fake", supplementary_data: { related_ids: { order_id: ppId } } });
    expect(r.outcome).toBe("pending");
    expect((await loadOrder(order.id)).status).toBe("PAGAMENTO_PENDENTE");
  });

  it("PAYMENT.CAPTURE.COMPLETED de uma cobrança real marca o pedido como PAGO", async () => {
    const { order, ppId } = await startPaying();
    pp.approve(ppId);
    await confirmPaymentOnReturn(order.id); // captura
    await db.update(orders).set({ status: "PAGAMENTO_PENDENTE", paymentStatus: "PENDENTE", paidAt: null }).where(eq(orders.id, order.id));
    const r = await webhook("PAYMENT.CAPTURE.COMPLETED", { id: `CAP-${ppId}`, supplementary_data: { related_ids: { order_id: ppId } } });
    expect(r.outcome).toBe("paid");
  });

  it("eventos que não são de pagamento são ignorados com 200", async () => {
    expect(await webhook("CUSTOMER.DISPUTE.CREATED", { id: "D-1" })).toEqual({ status: 200, outcome: "ignored_event" });
  });

  it("reembolso feito direto no PayPal (evento só com o link da captura) atualiza o pedido e devolve o estoque", async () => {
    const { order, ppId, product } = await startPaying();
    pp.approve(ppId);
    await confirmPaymentOnReturn(order.id);
    const before = await stockOf(product.id);
    pp.orders.get(ppId)!.capture!.refunded = pp.orders.get(ppId)!.capture!.amount;
    const capId = `CAP-${ppId}`;
    const r = await webhook("PAYMENT.CAPTURE.REFUNDED", { id: "RF-1", links: [{ rel: "up", href: `https://api.paypal.com/v2/payments/captures/${capId}` }] });
    expect(r.outcome).toBe("refunded");
    expect((await loadOrder(order.id)).status).toBe("REEMBOLSADO");
    expect(await stockOf(product.id)).toBe(before + 1);
    expect((await webhook("PAYMENT.CAPTURE.REFUNDED", { id: "RF-1", links: [{ rel: "up", href: `https://api.paypal.com/v2/payments/captures/${capId}` }] })).outcome).toBe("refunded");
    expect(await stockOf(product.id)).toBe(before + 1);
  });
});

describe("PayPal: reembolso pelo painel", () => {
  it("reembolsa a captura, marca REEMBOLSADO e devolve o estoque", async () => {
    const { order, ppId, product } = await startPaying();
    pp.approve(ppId);
    await confirmPaymentOnReturn(order.id);
    const before = await stockOf(product.id);
    expect(await refundOrder(order.id)).toEqual({ confirmed: true });
    expect((await loadOrder(order.id)).status).toBe("REEMBOLSADO");
    expect(await stockOf(product.id)).toBe(before + 1);
    await expect(refundOrder(order.id)).rejects.toThrow(/já foi reembolsado/);
  });

  it("pedido sem pagamento aprovado não pode ser reembolsado", async () => {
    const { order } = await startPaying();
    await expect(refundOrder(order.id)).rejects.toThrow(/Não há pagamento aprovado/);
  });
});
