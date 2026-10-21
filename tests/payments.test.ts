import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orders, payments, products, stockMovements, webhookEvents } from "@/server/db/schema";
import { addToCart, getOrCreateUserCart } from "@/server/services/cart";
import { createOrderFromCart, expireUnpaidOrders, startPaymentForOrder, updateOrderStatus } from "@/server/services/orders";
import { applyProviderPayment, processPaymentWebhook, refundOrder } from "@/server/services/payments";
import { mapMercadoPagoStatus } from "@/server/payments/mercadopago";
import { getPaymentProvider } from "@/server/payments";
import { ExternalServiceError } from "@/server/errors";
import { createAddress, createAdmin, createTestProduct, createUser, db, resetDb, signedWebhook, startMockMercadoPago, type MockMp } from "./helpers";

let mp: MockMp;

beforeAll(async () => {
  mp = await startMockMercadoPago();
});
afterAll(async () => {
  await mp.close();
});

beforeEach(async () => {
  await resetDb();
  mp.payments.clear();
  mp.preferences.length = 0;
  mp.refunds.length = 0;
  mp.failPreferences = false;
});

async function makeOrder(opts: { stock?: number; qty?: number; price?: number } = {}) {
  const product = await createTestProduct({ stock: opts.stock ?? 5, priceCents: opts.price ?? 10000 });
  const user = await createUser();
  const address = await createAddress(user.id);
  const cartId = await getOrCreateUserCart(user.id);
  await addToCart(cartId, product.id, opts.qty ?? 1);
  const order = await createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "ENTREGA", note: null });
  return { product, user, order };
}

type MpStatus = "approved" | "pending" | "rejected" | "cancelled" | "refunded";
function mpPayment(id: string, orderId: string | null, totalCents: number, status: MpStatus = "approved", extra = {}) {
  mp.payments.set(id, {
    id,
    status,
    transaction_amount: totalCents / 100,
    external_reference: orderId,
    payment_type_id: "bank_transfer",
    ...extra,
  });
}

const loadOrder = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0];
const stockOf = async (id: string) => (await db.select().from(products).where(eq(products.id, id)))[0].stock;
const webhook = (id: string, opts = {}) => processPaymentWebhook(signedWebhook(id, opts));

describe("tradução de status do Mercado Pago", () => {
  it("só 'approved' é aprovado; o que for desconhecido nunca vira aprovado", () => {
    expect(mapMercadoPagoStatus("approved")).toBe("APROVADO");
    for (const s of ["pending", "in_process", "in_mediation", "authorized", "algo-novo", "", undefined, null]) {
      expect(mapMercadoPagoStatus(s as string), String(s)).toBe("PENDENTE");
    }
    expect(mapMercadoPagoStatus("rejected")).toBe("RECUSADO");
    expect(mapMercadoPagoStatus("cancelled")).toBe("CANCELADO");
    expect(mapMercadoPagoStatus("expired")).toBe("CANCELADO");
    expect(mapMercadoPagoStatus("refunded")).toBe("REEMBOLSADO");
    expect(mapMercadoPagoStatus("charged_back")).toBe("REEMBOLSADO");
  });
});

describe("criação do pagamento", () => {
  it("envia ao Mercado Pago os itens e o frete, com soma IGUAL ao total do pedido", async () => {
    const { order } = await makeOrder({ price: 89990, qty: 2 });
    const { url } = await startPaymentForOrder(order.id, order.userId!);

    expect(url).toBe("https://mp.test/checkout/pref-1");
    const pref = mp.preferences[0] as { items: Array<{ title: string; quantity: number; unit_price: number }>; external_reference: string };
    expect(pref.external_reference).toBe(order.id);
    const sum = pref.items.reduce((s, i) => s + Math.round(i.unit_price * 100) * i.quantity, 0);
    expect(sum).toBe(order.totalCents);
    expect(pref.items.some((i) => i.title === "Frete" && i.unit_price === 30)).toBe(true);

    const saved = await loadOrder(order.id);
    expect(saved.status).toBe("PAGAMENTO_PENDENTE");
    expect(saved.paymentCheckoutUrl).toBe(url);
  });

  it("reaproveita o link em vez de criar vários", async () => {
    const { order } = await makeOrder();
    await startPaymentForOrder(order.id, order.userId!);
    await startPaymentForOrder(order.id, order.userId!);
    expect(mp.preferences).toHaveLength(1);
  });

  it("só o dono do pedido gera o pagamento", async () => {
    const { order } = await makeOrder();
    const stranger = await createUser();
    await expect(startPaymentForOrder(order.id, stranger.id)).rejects.toThrow(/não encontrado/i);
    expect(mp.preferences).toHaveLength(0);
  });

  it("não gera pagamento para pedido expirado ou já pago", async () => {
    const expired = await makeOrder();
    await db.update(orders).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(orders.id, expired.order.id));
    await expect(startPaymentForOrder(expired.order.id, expired.order.userId!)).rejects.toThrow(/prazo/i);

    const paid = await makeOrder();
    await db.update(orders).set({ status: "PAGO" }).where(eq(orders.id, paid.order.id));
    await expect(startPaymentForOrder(paid.order.id, paid.order.userId!)).rejects.toThrow(/não está aguardando/i);
  });

  it("sem credenciais configuradas, avisa claramente e não chama o Mercado Pago", async () => {
    const { order } = await makeOrder();
    const saved = process.env.MERCADOPAGO_ACCESS_TOKEN;
    process.env.MERCADOPAGO_ACCESS_TOKEN = "";
    try {
      expect(getPaymentProvider().isConfigured()).toBe(false);
      await expect(startPaymentForOrder(order.id, order.userId!)).rejects.toThrow(/ainda não está disponível/i);
      expect(mp.preferences).toHaveLength(0);
    } finally {
      process.env.MERCADOPAGO_ACCESS_TOKEN = saved;
    }
  });

  it("falha do Mercado Pago não marca nada como pago e deixa tentar de novo", async () => {
    const { order } = await makeOrder();
    mp.failPreferences = true;
    await expect(startPaymentForOrder(order.id, order.userId!)).rejects.toBeInstanceOf(ExternalServiceError);
    const saved = await loadOrder(order.id);
    expect(saved.status).toBe("PENDENTE");
    expect(saved.paymentCheckoutUrl).toBeNull();

    mp.failPreferences = false;
    await expect(startPaymentForOrder(order.id, order.userId!)).resolves.toBeTruthy();
  });

  it("em https envia notification_url e auto_return; em http não envia", async () => {
    const savedUrl = process.env.SITE_URL;
    try {
      process.env.SITE_URL = "https://loja.exemplo.com.br";
      const { order } = await makeOrder();
      await startPaymentForOrder(order.id, order.userId!);
      const pref = mp.preferences[0] as Record<string, unknown>;
      expect(pref.notification_url).toBe("https://loja.exemplo.com.br/api/webhooks/mercadopago");
      expect(pref.auto_return).toBe("approved");
      expect((pref.back_urls as Record<string, string>).success).toBe(`https://loja.exemplo.com.br/pedido/${order.id}`);
    } finally {
      process.env.SITE_URL = savedUrl;
    }
  });
});

describe("webhook: autenticidade", () => {
  it("assinatura adulterada é recusada (401) e NADA muda no pedido", async () => {
    const { order } = await makeOrder();
    mpPayment("1001", order.id, order.totalCents, "approved");

    const result = await webhook("1001", { tamper: true });
    expect(result.status).toBe(401);
    expect((await loadOrder(order.id)).status).toBe("PENDENTE");
  });

  it("segredo errado, sem cabeçalho de assinatura ou malformado: 401", async () => {
    const { order } = await makeOrder();
    mpPayment("1001", order.id, order.totalCents);

    expect((await webhook("1001", { secret: "segredo-errado" })).status).toBe(401);

    const signed = signedWebhook("1001");
    signed.headers.delete("x-signature");
    expect((await processPaymentWebhook(signed)).status).toBe(401);

    const malformed = signedWebhook("1001");
    malformed.headers.set("x-signature", "lixo");
    expect((await processPaymentWebhook(malformed)).status).toBe(401);

    expect((await loadOrder(order.id)).status).toBe("PENDENTE");
  });

  it("chamada sem assinatura nenhuma (alguém só 'avisando' que pagou) não faz nada", async () => {
    const { order } = await makeOrder();
    mpPayment("1001", order.id, order.totalCents);
    const url = new URL("http://localhost:3000/api/webhooks/mercadopago?data.id=1001&type=payment");
    const result = await processPaymentWebhook({ headers: new Headers(), url });
    expect(result.status).toBe(401);
    expect((await loadOrder(order.id)).status).toBe("PENDENTE");
  });

  it("sem MERCADOPAGO_WEBHOOK_SECRET o webhook é recusado (503), nunca aceito", async () => {
    const { order } = await makeOrder();
    mpPayment("1001", order.id, order.totalCents);
    const saved = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    process.env.MERCADOPAGO_WEBHOOK_SECRET = "";
    try {
      const result = await processPaymentWebhook(signedWebhook("1001", { secret: "" }));
      expect(result.status).toBe(503);
      expect((await loadOrder(order.id)).status).toBe("PENDENTE");
    } finally {
      process.env.MERCADOPAGO_WEBHOOK_SECRET = saved;
    }
  });

  it("registra no log tanto os eventos aceitos quanto os recusados", async () => {
    const { order } = await makeOrder();
    mpPayment("1001", order.id, order.totalCents);
    await webhook("1001", { tamper: true });
    await webhook("1001");
    const events = await db.select().from(webhookEvents);
    expect(events.map((e) => e.signatureValid).sort()).toEqual([false, true]);
  });

  it("eventos que não são de pagamento são ignorados com 200", async () => {
    const result = await webhook("77", { type: "merchant_order" });
    expect(result).toEqual({ status: 200, outcome: "ignored_event" });
  });
});

describe("webhook: a fonte da verdade é o provedor, não a notificação", () => {
  it("pagamento APROVADO no Mercado Pago marca o pedido como PAGO", async () => {
    const { order } = await makeOrder();
    mpPayment("1001", order.id, order.totalCents, "approved");

    const result = await webhook("1001");
    expect(result).toEqual({ status: 200, outcome: "paid" });

    const saved = await loadOrder(order.id);
    expect(saved.status).toBe("PAGO");
    expect(saved.paymentStatus).toBe("APROVADO");
    expect(saved.paidAt).toBeTruthy();
    expect(saved.paymentMethod).toBe("bank_transfer");

    const rows = await db.select().from(payments).where(eq(payments.orderId, order.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ providerPaymentId: "1001", status: "APROVADO", amountCents: order.totalCents });
  });

  it("notificação assinada, mas o Mercado Pago diz PENDENTE: o pedido NÃO é pago", async () => {
    const { order } = await makeOrder();
    mpPayment("1001", order.id, order.totalCents, "pending");
    const result = await webhook("1001");
    expect(result.outcome).toBe("pending");
    const saved = await loadOrder(order.id);
    expect(saved.status).toBe("PAGAMENTO_PENDENTE");
    expect(saved.paidAt).toBeNull();
  });

  it("pagamento recusado: pedido continua aguardando, cliente pode tentar de novo", async () => {
    const { order } = await makeOrder();
    mpPayment("1001", order.id, order.totalCents, "rejected");
    await webhook("1001");
    const saved = await loadOrder(order.id);
    expect(saved.status).toBe("PENDENTE");
    expect(saved.paymentStatus).toBe("RECUSADO");

    mpPayment("1002", order.id, order.totalCents, "approved");
    await webhook("1002");
    expect((await loadOrder(order.id)).status).toBe("PAGO");
  });

  it("valor pago diferente do total do pedido NÃO aprova e avisa o administrador", async () => {
    const { order } = await makeOrder({ price: 10000 });
    mpPayment("1001", order.id, 100, "approved"); // pagou R$ 1,00 num pedido de R$ 130,00
    const result = await webhook("1001");
    expect(result.outcome).toBe("amount_mismatch");
    const saved = await loadOrder(order.id);
    expect(saved.status).toBe("PENDENTE");
    expect(saved.attentionNote).toMatch(/valor diferente/i);
  });

  it("pagamento sem pedido, com pedido inexistente ou de outro sistema é ignorado", async () => {
    mpPayment("1001", null, 5000);
    expect((await webhook("1001")).outcome).toBe("ignored_no_order");
    mpPayment("1002", "00000000-0000-4000-8000-000000000000", 5000);
    expect((await webhook("1002")).outcome).toBe("ignored_unknown_order");
    mpPayment("1003", "isso-nao-e-um-uuid", 5000);
    expect((await webhook("1003")).outcome).toBe("ignored_no_order");
  });

  it("pagamento inexistente no provedor: 502 (para o Mercado Pago tentar de novo)", async () => {
    const result = await webhook("999999");
    expect(result.status).toBe(502);
  });

  it("a mesma notificação várias vezes (inclusive ao mesmo tempo) não duplica nada", async () => {
    const { order } = await makeOrder();
    mpPayment("1001", order.id, order.totalCents, "approved");

    const results = await Promise.all(Array.from({ length: 8 }, () => webhook("1001")));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.outcome === "paid")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "already_paid")).toHaveLength(7);

    expect(await db.select().from(payments).where(eq(payments.orderId, order.id))).toHaveLength(1);
    expect((await loadOrder(order.id)).status).toBe("PAGO");
  });

  it("um aviso atrasado de 'pendente' não faz um pedido pago voltar atrás", async () => {
    const { order } = await makeOrder();
    mpPayment("1001", order.id, order.totalCents, "approved");
    await webhook("1001");

    mpPayment("1002", order.id, order.totalCents, "pending"); // outra tentativa, ficou pendente
    await webhook("1002");
    mpPayment("1003", order.id, order.totalCents, "rejected");
    await webhook("1003");

    const saved = await loadOrder(order.id);
    expect(saved.status).toBe("PAGO");
    expect(saved.paymentStatus).toBe("APROVADO");
  });

  it("um pagamento aprovado não pode ser 'roubado' por outro pedido", async () => {
    const a = await makeOrder();
    const b = await makeOrder();
    mpPayment("1001", a.order.id, a.order.totalCents, "approved");
    await webhook("1001");

    // O mesmo id de pagamento chega apontando para outro pedido.
    mpPayment("1001", b.order.id, b.order.totalCents, "approved");
    const result = await webhook("1001");
    expect(result.outcome).toBe("ignored_order_mismatch");
    expect((await loadOrder(b.order.id)).status).toBe("PENDENTE");
  });
});

describe("pagamento chegando depois de expirar", () => {
  it("pedido expirou, mas há estoque: o pagamento reativa o pedido como PAGO", async () => {
    const { order, product } = await makeOrder({ stock: 5, qty: 2 });
    await db.update(orders).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(orders.id, order.id));
    await expireUnpaidOrders();
    expect((await loadOrder(order.id)).status).toBe("CANCELADO");
    expect(await stockOf(product.id)).toBe(5);

    mpPayment("1001", order.id, order.totalCents, "approved");
    expect((await webhook("1001")).outcome).toBe("paid");
    expect((await loadOrder(order.id)).status).toBe("PAGO");
    expect(await stockOf(product.id)).toBe(3); // estoque foi reservado de novo
  });

  it("pedido expirou e o estoque foi vendido a outro: NÃO vende a mais, avisa o admin e permite reembolso", async () => {
    const { order, product } = await makeOrder({ stock: 1, qty: 1 });
    await db.update(orders).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(orders.id, order.id));
    await expireUnpaidOrders();

    // Outro cliente compra a última unidade.
    const rivalUser = await createUser();
    const rivalAddress = await createAddress(rivalUser.id);
    const rivalCart = await getOrCreateUserCart(rivalUser.id);
    await addToCart(rivalCart, product.id, 1);
    await createOrderFromCart({ userId: rivalUser.id, cartId: rivalCart, addressId: rivalAddress.id, shippingCode: "ENTREGA", note: null });
    expect(await stockOf(product.id)).toBe(0);

    mpPayment("1001", order.id, order.totalCents, "approved");
    expect((await webhook("1001")).outcome).toBe("approved_after_cancel_no_stock");

    const saved = await loadOrder(order.id);
    expect(saved.status).toBe("CANCELADO");
    expect(saved.paymentStatus).toBe("APROVADO");
    expect(saved.attentionNote).toMatch(/reembolso/i);
    expect(await stockOf(product.id)).toBe(0); // continua 0: nunca negativo

    // O admin consegue devolver o dinheiro.
    expect(await refundOrder(order.id)).toEqual({ confirmed: true });
    const refunded = await loadOrder(order.id);
    expect(refunded.paymentStatus).toBe("REEMBOLSADO");
    expect(refunded.attentionNote).toBeNull();
  });

  it("expiração e pagamento ao mesmo tempo terminam num estado consistente", async () => {
    const { order, product } = await makeOrder({ stock: 5, qty: 2 });
    await db.update(orders).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(orders.id, order.id));
    mpPayment("1001", order.id, order.totalCents, "approved");

    await Promise.all([expireUnpaidOrders(), webhook("1001")]);
    await webhook("1001"); // garante que o aviso foi processado depois de qualquer expiração

    const saved = await loadOrder(order.id);
    expect(saved.status).toBe("PAGO");
    expect(await stockOf(product.id)).toBe(3);
  });
});

describe("reembolso", () => {
  async function paidOrder(opts = {}) {
    const ctx = await makeOrder({ stock: 5, qty: 2, ...opts });
    mpPayment("1001", ctx.order.id, ctx.order.totalCents, "approved");
    await webhook("1001");
    return ctx;
  }

  it("reembolsa pelo painel, marca REEMBOLSADO e devolve o estoque (pedido ainda não enviado)", async () => {
    const { order, product } = await paidOrder();
    expect(await stockOf(product.id)).toBe(3);

    expect(await refundOrder(order.id)).toEqual({ confirmed: true });
    expect(mp.refunds).toEqual(["1001"]);

    const saved = await loadOrder(order.id);
    expect(saved.status).toBe("REEMBOLSADO");
    expect(saved.paymentStatus).toBe("REEMBOLSADO");
    expect(await stockOf(product.id)).toBe(5);
  });

  it("não reembolsa duas vezes", async () => {
    const { order } = await paidOrder();
    await refundOrder(order.id);
    await expect(refundOrder(order.id)).rejects.toThrow(/já foi reembolsado/i);
    expect(mp.refunds).toHaveLength(1);
  });

  it("pedido já enviado é reembolsado, mas o estoque NÃO volta sozinho", async () => {
    const admin = await createAdmin();
    const { order, product } = await paidOrder();
    await updateOrderStatus({ orderId: order.id, next: "ENVIADO", actorId: admin.id });
    await refundOrder(order.id);
    expect((await loadOrder(order.id)).status).toBe("REEMBOLSADO");
    expect(await stockOf(product.id)).toBe(3);
  });

  it("webhook de reembolso feito direto no Mercado Pago também atualiza o pedido, uma única vez", async () => {
    const { order, product } = await paidOrder();
    mpPayment("1001", order.id, order.totalCents, "refunded", { transaction_amount_refunded: order.totalCents / 100 });

    await Promise.all([webhook("1001"), webhook("1001"), webhook("1001")]);
    expect((await loadOrder(order.id)).status).toBe("REEMBOLSADO");
    expect(await stockOf(product.id)).toBe(5); // devolvido uma vez só

    const restores = await db.select().from(stockMovements).where(eq(stockMovements.type, "RESTAURACAO"));
    expect(restores).toHaveLength(1);
  });

  it("recusa reembolso de pedido sem pagamento aprovado", async () => {
    const { order } = await makeOrder();
    await expect(refundOrder(order.id)).rejects.toThrow(/não há pagamento aprovado/i);
  });
});

describe("applyProviderPayment direto", () => {
  it("é idempotente: aplicar o mesmo pagamento aprovado duas vezes dá o mesmo resultado", async () => {
    const { order } = await makeOrder();
    const pp = {
      provider: "mercadopago",
      providerPaymentId: "555",
      orderId: order.id,
      status: "APROVADO" as const,
      rawStatus: "approved",
      statusDetail: null,
      method: "credit_card",
      amountCents: order.totalCents,
      refundedCents: 0,
    };
    expect((await applyProviderPayment(pp)).outcome).toBe("paid");
    expect((await applyProviderPayment(pp)).outcome).toBe("already_paid");
    expect((await loadOrder(order.id)).paidAt).toBeTruthy();
  });
});
