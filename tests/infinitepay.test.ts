import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { couponRedemptions, orders, payments, products } from "@/server/db/schema";
import { addToCart, getOrCreateUserCart } from "@/server/services/cart";
import { createOrderFromCart, startPaymentForOrder } from "@/server/services/orders";
import { confirmPaymentOnReturn, processPaymentWebhook, refundOrder } from "@/server/services/payments";
import { buildInfinitePayRef, parseInfinitePayRef } from "@/server/payments/infinitepay";
import { getPaymentProvider } from "@/server/payments";
import { ExternalServiceError } from "@/server/errors";
import { createCoupon } from "@/server/services/coupons";
import { createAddress, createTestProduct, createUser, db, resetDb } from "./helpers";

// Tudo aqui roda contra um InfinitePay SIMULADO (abaixo). Não prova funcionamento com o InfinitePay real.
const TOKEN = "token-de-teste-0123456789";
type MockOrder = { request: Record<string, any>; paid?: { tx: string; slug: string; amount: number; paidAmount: number; method: string; installments: number } };
const mock = { orders: new Map<string, MockOrder>(), calls: [] as string[], failLinks: false, naive: false, baseUrl: "", close: async () => {} };

beforeAll(async () => {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (status: number, json: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      };
      mock.calls.push(`${req.method} ${req.url}`);
      const json = body ? JSON.parse(body) : {};
      if (req.method === "POST" && req.url === "/links") {
        if (mock.failLinks) return send(500, { error: "boom" });
        mock.orders.set(json.order_nsu, { request: json });
        return send(200, { url: `https://checkout.infinitepay.test/${json.order_nsu}` });
      }
      if (req.method === "POST" && req.url === "/payment_check") {
        // naive = simula um InfinitePay que NÃO confere o vínculo da transação com o pedido (acha o pagamento em qualquer pedido).
        if (mock.naive) {
          const found = [...mock.orders.values()].find((x) => x.paid && (x.paid.tx === json.transaction_nsu || x.paid.slug === json.slug));
          if (!found?.paid) return send(200, { success: true, paid: false });
          return send(200, { success: true, paid: true, amount: found.paid.amount, paid_amount: found.paid.paidAmount, installments: found.paid.installments, capture_method: found.paid.method });
        }
        const o = mock.orders.get(json.order_nsu);
        if (!o || json.handle !== "rt_test") return send(200, { success: false, paid: false });
        if (!o.paid) return send(200, { success: true, paid: false });
        if (json.transaction_nsu && json.transaction_nsu !== o.paid.tx) return send(200, { success: false, paid: false });
        return send(200, { success: true, paid: true, amount: o.paid.amount, paid_amount: o.paid.paidAmount, installments: o.paid.installments, capture_method: o.paid.method });
      }
      send(404, {});
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  mock.baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  mock.close = () => new Promise<void>((r) => server.close(() => r()));
  Object.assign(process.env, { PAYMENT_PROVIDER: "infinitepay", INFINITEPAY_HANDLE: "rt_test", INFINITEPAY_WEBHOOK_TOKEN: TOKEN, INFINITEPAY_API_BASE: mock.baseUrl });
});
afterAll(async () => {
  await mock.close();
  process.env.PAYMENT_PROVIDER = "mercadopago";
});
beforeEach(async () => {
  await resetDb();
  mock.orders.clear();
  mock.calls.length = 0;
  mock.failLinks = false;
  mock.naive = false;
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
async function startPaying() {
  const made = await makeOrder();
  const { url } = await startPaymentForOrder(made.order.id, made.user.id);
  return { ...made, url };
}
/** O cliente paga no site do InfinitePay (simulado). */
function pay(orderId: string, over: Partial<NonNullable<MockOrder["paid"]>> = {}, total?: number) {
  const amount = total ?? 0;
  mock.orders.get(orderId)!.paid = { tx: "TX-123", slug: "slug-abc", amount, paidAmount: amount, method: "pix", installments: 1, ...over };
}
const hook = (orderId: string, opts: { token?: string | null; tx?: string; slug?: string; raw?: string } = {}) => {
  const url = new URL("http://localhost:3000/api/webhooks/infinitepay");
  if (opts.token !== null) url.searchParams.set("t", opts.token ?? TOKEN);
  const body = opts.raw ?? JSON.stringify({ order_nsu: orderId, transaction_nsu: opts.tx ?? "TX-123", invoice_slug: opts.slug ?? "slug-abc", amount: 1, paid_amount: 1, capture_method: "pix" });
  return processPaymentWebhook({ headers: new Headers(), url, body });
};

describe("InfinitePay: identificador do pagamento", () => {
  it("monta e lê 'pedido|transaction_nsu|slug' e recusa lixo", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(parseInfinitePayRef(buildInfinitePayRef(id))).toEqual({ orderId: id, transactionNsu: null, slug: null });
    expect(parseInfinitePayRef(buildInfinitePayRef(id, "TX1", "s-1"))).toEqual({ orderId: id, transactionNsu: "TX1", slug: "s-1" });
    expect(parseInfinitePayRef("nao-e-uuid")).toBeNull();
    expect(parseInfinitePayRef(`${id}|TX 1|s`)).toBeNull();
    expect(parseInfinitePayRef(`${id}|a|b|c`)).toBeNull();
  });
});

describe("InfinitePay: criação do pagamento", () => {
  it("envia a InfiniteTag, o pedido, itens+frete que somam o TOTAL, endereço de volta e de aviso com segredo", async () => {
    const { order, url } = await startPaying();
    expect(getPaymentProvider().id).toBe("infinitepay");
    expect(url).toBe(`https://checkout.infinitepay.test/${order.id}`);
    const sent = mock.orders.get(order.id)!.request;
    expect(sent.handle).toBe("rt_test");
    expect(sent.order_nsu).toBe(order.id);
    expect(sent.items.reduce((s: number, i: any) => s + i.price * i.quantity, 0)).toBe(order.totalCents);
    expect(sent.items.some((i: any) => i.description === "Frete")).toBe(true);
    expect(sent.redirect_url).toBe(`http://localhost:3000/pedido/${order.id}/retorno`);
    expect(sent.webhook_url).toBe(`http://localhost:3000/api/webhooks/infinitepay?t=${TOKEN}`);
    const saved = await loadOrder(order.id);
    expect(saved.status).toBe("PAGAMENTO_PENDENTE");
    expect(saved.paymentCheckoutRef).toBe(order.id);
  });

  it("sem InfiniteTag ou com segredo curto: avisa e não chama o InfinitePay", async () => {
    const { order, user } = await makeOrder();
    const saved = process.env.INFINITEPAY_WEBHOOK_TOKEN;
    process.env.INFINITEPAY_WEBHOOK_TOKEN = "curto";
    try {
      await expect(startPaymentForOrder(order.id, user.id)).rejects.toThrow(ExternalServiceError);
    } finally {
      process.env.INFINITEPAY_WEBHOOK_TOKEN = saved;
    }
    expect(mock.calls).toEqual([]);
  });

  it("falha do InfinitePay não marca nada como pago e deixa tentar de novo", async () => {
    const { order, user } = await makeOrder();
    mock.failLinks = true;
    await expect(startPaymentForOrder(order.id, user.id)).rejects.toThrow(ExternalServiceError);
    expect((await loadOrder(order.id)).status).toBe("PENDENTE");
    mock.failLinks = false;
    await expect(startPaymentForOrder(order.id, user.id)).resolves.toHaveProperty("url");
  });
});

describe("InfinitePay: aviso (webhook) sem assinatura, protegido por segredo + conferência na API", () => {
  it("segredo errado, ausente ou corpo inválido: recusa (401) e não muda nada", async () => {
    const { order } = await startPaying();
    pay(order.id, {}, order.totalCents);
    expect((await hook(order.id, { token: "errado-errado-errado" })).status).toBe(401);
    expect((await hook(order.id, { token: null })).status).toBe(401);
    expect((await hook(order.id, { raw: "{não é json" })).status).toBe(401);
    expect((await hook(order.id, { tx: "TX 1" })).status).toBe(401);
    expect((await loadOrder(order.id)).status).toBe("PAGAMENTO_PENDENTE");
  });

  it("aviso válido + API confirma o valor: pedido PAGO uma única vez (repetir não duplica)", async () => {
    const { order } = await startPaying();
    pay(order.id, {}, order.totalCents);
    expect((await hook(order.id)).outcome).toBe("paid");
    expect((await hook(order.id)).outcome).toBe("already_paid");
    const o = await loadOrder(order.id);
    expect([o.status, o.paymentStatus, o.paymentMethod]).toEqual(["PAGO", "APROVADO", "pix"]);
    expect(await db.select().from(payments).where(eq(payments.orderId, order.id))).toHaveLength(1);
  });

  it("o corpo do aviso não vale: se a API diz que NÃO foi pago, o pedido continua aguardando", async () => {
    const { order } = await startPaying();
    expect((await hook(order.id)).outcome).toBe("pending");
    expect((await loadOrder(order.id)).status).toBe("PAGAMENTO_PENDENTE");
  });

  it("valor diferente do pedido: não vira pago e fica um aviso para o dono", async () => {
    const { order } = await startPaying();
    pay(order.id, {}, order.totalCents - 100);
    expect((await hook(order.id)).outcome).toBe("amount_mismatch");
    const o = await loadOrder(order.id);
    expect(o.status).toBe("PAGAMENTO_PENDENTE");
    expect(o.attentionNote).toContain("valor diferente");
  });

  it("parcelado com juros (pagou MAIS que o valor) é aprovado; pagou MENOS não é", async () => {
    const a = await startPaying();
    pay(a.order.id, { paidAmount: a.order.totalCents + 450, installments: 3, method: "credit_card" }, a.order.totalCents);
    expect((await hook(a.order.id)).outcome).toBe("paid");
    const b = await startPaying();
    pay(b.order.id, { tx: "TX-B", slug: "slug-b", paidAmount: b.order.totalCents - 1 }, b.order.totalCents);
    expect((await hook(b.order.id, { tx: "TX-B", slug: "slug-b" })).outcome).toBe("pending");
  });
});

describe("InfinitePay: volta do cliente à loja", () => {
  it("a URL de volta só serve de pergunta: a API confirma e o pedido fica PAGO", async () => {
    const { order } = await startPaying();
    pay(order.id, {}, order.totalCents);
    const query = new URLSearchParams({ transaction_nsu: "TX-123", slug: "slug-abc", order_nsu: "outro", capture_method: "pix" });
    expect(await confirmPaymentOnReturn(order.id, query)).toBe("paid");
    expect((await loadOrder(order.id)).status).toBe("PAGO");
    expect(await confirmPaymentOnReturn(order.id, query)).toBe("already_paid");
  });

  it("voltou sem pagar (ou com dados falsos): continua aguardando", async () => {
    const { order } = await startPaying();
    expect(await confirmPaymentOnReturn(order.id, new URLSearchParams({ transaction_nsu: "FALSO", slug: "x" }))).toBe("not_captured");
    expect(await confirmPaymentOnReturn(order.id, new URLSearchParams())).toBe("not_captured");
    expect((await loadOrder(order.id)).status).toBe("PAGAMENTO_PENDENTE");
  });

  it("parâmetros com caracteres estranhos são ignorados (nada vai para a API)", async () => {
    const { order } = await startPaying();
    mock.calls.length = 0;
    await confirmPaymentOnReturn(order.id, new URLSearchParams({ transaction_nsu: "a|b", slug: "<x>" }));
    expect(mock.calls).toEqual(["POST /payment_check"]);
  });
});

describe("InfinitePay: um pagamento vale para UM pedido só (mesmo que a API não confira o vínculo)", () => {
  it("o endereço de volta de um pedido pago não quita outro pedido de mesmo valor", async () => {
    mock.naive = true;
    const a = await startPaying();
    const b = await startPaying();
    expect(b.order.totalCents).toBe(a.order.totalCents);
    pay(a.order.id, {}, a.order.totalCents);
    const query = new URLSearchParams({ transaction_nsu: "TX-123", slug: "slug-abc" });

    expect(await confirmPaymentOnReturn(b.order.id, query)).toBe("paid"); // quem chegou primeiro leva o pagamento...
    expect(await confirmPaymentOnReturn(a.order.id, query)).toBe("ignored_order_mismatch"); // ...e o outro pedido NÃO é quitado

    expect((await loadOrder(b.order.id)).status).toBe("PAGO");
    const loser = await loadOrder(a.order.id);
    expect(loser.status).toBe("PAGAMENTO_PENDENTE");
    expect(loser.attentionNote).toContain("OUTRO pedido");
    const rows = await db.select().from(payments);
    expect(rows.filter((r) => r.status === "APROVADO")).toHaveLength(1);
  });

  it("o mesmo vale pelo aviso (webhook) e para o mesmo link (slug) com outra transação", async () => {
    mock.naive = true;
    const a = await startPaying();
    const b = await startPaying();
    pay(a.order.id, {}, a.order.totalCents);
    expect((await hook(a.order.id)).outcome).toBe("paid");

    expect((await hook(b.order.id)).outcome).toBe("ignored_order_mismatch"); // mesma transação em outro pedido
    expect((await hook(b.order.id, { tx: "TX-OUTRA" })).outcome).toBe("ignored_order_mismatch"); // mesmo slug, outra transação
    expect((await loadOrder(b.order.id)).status).toBe("PAGAMENTO_PENDENTE");
    expect((await hook(a.order.id)).outcome).toBe("already_paid"); // o dono legítimo continua funcionando
    expect(await db.select().from(payments).where(eq(payments.orderId, b.order.id))).toHaveLength(0);
  });

  it("repetir o aviso do MESMO pedido continua normal (não é bloqueado)", async () => {
    mock.naive = true;
    const a = await startPaying();
    pay(a.order.id, {}, a.order.totalCents);
    expect((await hook(a.order.id)).outcome).toBe("paid");
    expect((await hook(a.order.id)).outcome).toBe("already_paid");
    expect(await confirmPaymentOnReturn(a.order.id, new URLSearchParams({ transaction_nsu: "TX-123", slug: "slug-abc" }))).toBe("already_paid");
  });
});

describe("InfinitePay: reembolso é manual (o InfinitePay não tem reembolso por API)", () => {
  it("o dono confirma no painel: pedido REEMBOLSADO, estoque devolvido, nenhuma chamada de reembolso", async () => {
    const { order, product } = await startPaying();
    pay(order.id, {}, order.totalCents);
    await hook(order.id);
    expect(await stockOf(product.id)).toBe(4);
    mock.calls.length = 0;
    expect(await refundOrder(order.id)).toEqual({ confirmed: true });
    const o = await loadOrder(order.id);
    expect([o.status, o.paymentStatus]).toEqual(["REEMBOLSADO", "REEMBOLSADO"]);
    expect(await stockOf(product.id)).toBe(5);
    expect(mock.calls).toEqual([]);
    await expect(refundOrder(order.id)).rejects.toThrow("já foi reembolsado");
  });

  it("pedido que não foi pago não pode ser reembolsado", async () => {
    const { order } = await startPaying();
    await expect(refundOrder(order.id)).rejects.toThrow("Não há pagamento aprovado");
  });
});

describe("InfinitePay com cupom de desconto", () => {
  async function couponOrder(newCoupon = true, qty = 3, price = 3333) {
    if (newCoupon) await createCoupon({ code: "BLACK10", description: null, kind: "PERCENT", value: 7, minSubtotalCents: 0, startsAt: null, endsAt: null, maxRedemptions: null, maxPerUser: null });
    const product = await createTestProduct({ stock: 9, priceCents: price });
    const user = await createUser();
    const address = await createAddress(user.id);
    const cartId = await getOrCreateUserCart(user.id);
    await addToCart(cartId, product.id, qty);
    const order = await createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "ENTREGA", note: null, couponCode: "BLACK10" });
    return { product, user, order };
  }

  it("itens + frete enviados ao InfinitePay somam o TOTAL já com desconto (centavos exatos, sem item zerado)", async () => {
    const { order, user } = await couponOrder();
    expect(order.discountCents).toBeGreaterThan(0);
    expect(order.totalCents).toBe(order.subtotalCents + order.shippingCents - order.discountCents);
    await startPaymentForOrder(order.id, user.id);
    const sent = mock.orders.get(order.id)!.request;
    expect(sent.items.reduce((s: number, i: any) => s + i.price * i.quantity, 0)).toBe(order.totalCents);
    expect(sent.items.every((i: any) => Number.isInteger(i.price) && i.price > 0 && Number.isInteger(i.quantity) && i.quantity > 0)).toBe(true);
  });

  it("pagar o valor COM desconto quita o pedido; pagar o valor SEM desconto (provedor ignorou o cupom) não quita e deixa aviso", async () => {
    const a = await couponOrder();
    await startPaymentForOrder(a.order.id, a.user.id);
    pay(a.order.id, {}, a.order.totalCents);
    expect((await hook(a.order.id)).outcome).toBe("paid");
    expect((await loadOrder(a.order.id)).status).toBe("PAGO");

    const b = await couponOrder(false);
    await startPaymentForOrder(b.order.id, b.user.id);
    pay(b.order.id, { tx: "TX-B", slug: "slug-b" }, b.order.totalCents + b.order.discountCents);
    expect((await hook(b.order.id, { tx: "TX-B", slug: "slug-b" })).outcome).toBe("amount_mismatch");
    expect((await loadOrder(b.order.id)).status).toBe("PAGAMENTO_PENDENTE");
  });

  it("reembolso (confirmado pelo dono) devolve o uso do cupom", async () => {
    const a = await couponOrder();
    await startPaymentForOrder(a.order.id, a.user.id);
    pay(a.order.id, {}, a.order.totalCents);
    expect((await hook(a.order.id)).outcome).toBe("paid");
    const before = await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, a.order.id));
    expect(before.map((r) => r.releasedAt)).toEqual([null]);
    await refundOrder(a.order.id);
    const after = await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, a.order.id));
    expect(after[0].releasedAt).not.toBeNull();
  });
});
