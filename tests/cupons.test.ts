import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  applyDiscountToLines,
  checkCouponRules,
  couponDiscountCents,
  normalizeCouponCode,
  type CouponRuleData,
} from "@/lib/coupons";
import { formatBRL } from "@/lib/money";
import { couponRedemptions, coupons, orders, products } from "@/server/db/schema";
import { ConflictError, ValidationError } from "@/server/errors";
import { addToCart, getOrCreateUserCart } from "@/server/services/cart";
import { createCoupon, deleteCoupon, listCoupons, setCouponActive, type CouponInput } from "@/server/services/coupons";
import { cancelOrderByCustomer, createOrderFromCart, expireUnpaidOrders, startPaymentForOrder, updateOrderStatus } from "@/server/services/orders";
import { createAddress, createTestProduct, createUser, db, resetDb, startMockMercadoPago, type MockMp } from "./helpers";

let mp: MockMp;
beforeAll(async () => {
  mp = await startMockMercadoPago();
});
afterAll(async () => {
  await mp.close();
});
beforeEach(async () => {
  await resetDb();
  mp.preferences.length = 0;
});

const HOUR = 3_600_000;
const baseCoupon = (over: Partial<CouponInput> = {}): CouponInput => ({
  code: "BLACK10",
  description: null,
  kind: "PERCENT",
  value: 10,
  minSubtotalCents: 0,
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  maxPerUser: null,
  ...over,
});
const sessionOf = (u: { id: string }) => ({ id: u.id, email: "", name: "", phone: null, role: "CLIENTE" as const });

async function buyer(opts: { price?: number; qty?: number; stock?: number } = {}) {
  const product = await createTestProduct({ priceCents: opts.price ?? 10000, stock: opts.stock ?? 20 });
  const user = await createUser();
  const address = await createAddress(user.id);
  return { product, user, address };
}
async function order(b: Awaited<ReturnType<typeof buyer>>, couponCode: string | null, qty = 1, extra: { expectedDiscountCents?: number | null } = {}) {
  const cartId = await getOrCreateUserCart(b.user.id);
  await addToCart(cartId, b.product.id, qty);
  return createOrderFromCart({ userId: b.user.id, cartId, addressId: b.address.id, shippingCode: "ENTREGA", note: null, couponCode, ...extra });
}
const redemptions = async (couponCode = "BLACK10") => {
  const [c] = await db.select().from(coupons).where(eq(coupons.code, couponCode));
  return db.select().from(couponRedemptions).where(eq(couponRedemptions.couponId, c.id));
};
const stockOf = async (id: string) => (await db.select().from(products).where(eq(products.id, id)))[0].stock;

describe("regras puras", () => {
  it("normaliza o código (maiúsculas, sem espaços) e recusa lixo", () => {
    expect(normalizeCouponCode(" black 10 ")).toBe("BLACK10");
    expect(normalizeCouponCode("ab")).toBeNull();
    expect(normalizeCouponCode("com acento ç")).toBeNull();
    expect(normalizeCouponCode("A".repeat(33))).toBeNull();
    expect(normalizeCouponCode(null)).toBeNull();
  });

  it("calcula percentual e valor fixo, sem passar de 90% do subtotal", () => {
    expect(couponDiscountCents({ kind: "PERCENT", value: 10 }, 12345)).toBe(1234);
    expect(couponDiscountCents({ kind: "FIXED", value: 2000 }, 10000)).toBe(2000);
    expect(couponDiscountCents({ kind: "FIXED", value: 50000 }, 10000)).toBe(9000);
    expect(couponDiscountCents({ kind: "PERCENT", value: 90 }, 999)).toBe(899);
    expect(couponDiscountCents({ kind: "PERCENT", value: 10 }, 0)).toBe(0);
  });

  it("confere vigência, mínimo, limites e ativo", () => {
    const now = new Date("2026-11-27T12:00:00Z");
    const c: CouponRuleData = { kind: "PERCENT", value: 10, minSubtotalCents: 10000, startsAt: null, endsAt: null, maxRedemptions: 5, maxPerUser: 1, active: true };
    const ctx = { now, subtotalCents: 20000, redemptionsTotal: 0, redemptionsByUser: 0 };
    const check = (over: Partial<CouponRuleData>, ctxOver = {}) => checkCouponRules({ ...c, ...over }, { ...ctx, ...ctxOver }, formatBRL);
    expect(check({})).toEqual({ ok: true, discountCents: 2000 });
    expect(check({ active: false })).toMatchObject({ ok: false });
    expect(check({ startsAt: new Date("2026-11-28T00:00:00Z") })).toMatchObject({ ok: false, reason: expect.stringMatching(/ainda não começou/) });
    expect(check({ endsAt: new Date("2026-11-27T12:00:00Z") })).toMatchObject({ ok: false, reason: expect.stringMatching(/expirou/) });
    expect(check({}, { subtotalCents: 9999 })).toMatchObject({ ok: false, reason: expect.stringMatching(/a partir de/) });
    expect(check({}, { redemptionsTotal: 5 })).toMatchObject({ ok: false, reason: expect.stringMatching(/limite/) });
    expect(check({}, { redemptionsByUser: 1 })).toMatchObject({ ok: false, reason: expect.stringMatching(/já usou/) });
    expect(check({}, { redemptionsByUser: null })).toMatchObject({ ok: true });
  });

  it("distribui o desconto pelos itens sem sobrar nem faltar centavo (várias combinações)", () => {
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let round = 0; round < 500; round++) {
      const lines = Array.from({ length: 1 + rnd(4) }, (_, i) => ({ title: `P${i}`, quantity: 1 + rnd(5), unitPriceCents: 100 + rnd(90000) }));
      const subtotal = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
      const discount = couponDiscountCents({ kind: "PERCENT", value: 1 + rnd(90) }, subtotal);
      if (discount === 0) continue;
      const out = applyDiscountToLines(lines, discount);
      const sum = out.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
      expect(sum).toBe(subtotal - discount);
      expect(out.every((l) => l.unitPriceCents >= 1 && l.quantity >= 1)).toBe(true);
      expect(out.reduce((s, l) => s + l.quantity, 0)).toBe(lines.reduce((s, l) => s + l.quantity, 0));
    }
  });
});

describe("pedido com cupom", () => {
  it("aplica o desconto no servidor, grava no pedido e registra o uso", async () => {
    await createCoupon(baseCoupon());
    const b = await buyer({ price: 10000 });
    const o = await order(b, "black10", 2); // digitado em minúsculas
    expect(o.subtotalCents).toBe(20000);
    expect(o.discountCents).toBe(2000);
    expect(o.couponCode).toBe("BLACK10");
    expect(o.totalCents).toBe(20000 + o.shippingCents - 2000);
    const rows = await redemptions();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ orderId: o.id, userId: b.user.id, discountCents: 2000, releasedAt: null });
    expect(await stockOf(b.product.id)).toBe(18);
  });

  it("sem cupom, nada muda (desconto zero)", async () => {
    const b = await buyer();
    const o = await order(b, null);
    expect(o.discountCents).toBe(0);
    expect(o.couponCode).toBeNull();
  });

  it("cupom de valor fixo", async () => {
    await createCoupon(baseCoupon({ kind: "FIXED", value: 1500 }));
    const b = await buyer({ price: 8000 });
    const o = await order(b, "BLACK10");
    expect(o.discountCents).toBe(1500);
    expect(o.totalCents).toBe(8000 + o.shippingCents - 1500);
  });

  it.each([
    ["inexistente", async () => {}, "NAOEXISTE", /não encontrado/i],
    ["desativado", async () => { await createCoupon(baseCoupon()); const [c] = await db.select().from(coupons); await setCouponActive(c.id, false); }, "BLACK10", /Cupom não encontrado/],
    ["expirado", async () => { await createCoupon(baseCoupon({ startsAt: new Date(Date.now() - 3 * HOUR), endsAt: new Date(Date.now() - HOUR) })); }, "BLACK10", /expirou/],
    ["ainda não começou", async () => { await createCoupon(baseCoupon({ startsAt: new Date(Date.now() + HOUR) })); }, "BLACK10", /ainda não começou/],
    ["abaixo do mínimo", async () => { await createCoupon(baseCoupon({ minSubtotalCents: 50000 })); }, "BLACK10", /a partir de/],
    ["código inválido", async () => {}, "x", /inválido/i],
  ])("recusa cupom %s e NÃO cria pedido nem baixa estoque", async (_name, setup, code, message) => {
    await setup();
    const b = await buyer();
    const error = await order(b, code).catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors.couponCode).toMatch(message);
    expect(await db.select().from(orders)).toHaveLength(0);
    expect(await stockOf(b.product.id)).toBe(20);
  });

  it("avisa (sem criar pedido) quando o desconto que a pessoa viu é diferente do calculado", async () => {
    await createCoupon(baseCoupon());
    const b = await buyer({ price: 10000 });
    await expect(order(b, "BLACK10", 1, { expectedDiscountCents: 999 })).rejects.toThrow(/desconto mudou/i);
    expect(await db.select().from(orders)).toHaveLength(0);
    // O pedido recusado não esvazia o carrinho: o item continua lá e este segundo `order` soma mais um (2 × R$ 100,00).
    const ok = await order(b, "BLACK10", 1, { expectedDiscountCents: 2000 });
    expect(ok.discountCents).toBe(2000);
  });

  it("limite total: dois clientes ao mesmo tempo, só um leva o último uso", async () => {
    await createCoupon(baseCoupon({ maxRedemptions: 1 }));
    const [a, b] = await Promise.all([buyer(), buyer()]);
    const results = await Promise.allSettled([order(a, "BLACK10"), order(b, "BLACK10")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(ValidationError);
    expect(failed.reason.fieldErrors.couponCode).toMatch(/limite de usos/);
    expect(await redemptions()).toHaveLength(1);
    expect(await db.select().from(orders)).toHaveLength(1);
  });

  it("limite por cliente: o mesmo cliente não usa duas vezes, outro cliente usa", async () => {
    await createCoupon(baseCoupon({ maxPerUser: 1 }));
    const a = await buyer();
    await order(a, "BLACK10");
    await expect(order(a, "BLACK10")).rejects.toThrow(/já usou/);
    const b = await buyer();
    expect((await order(b, "BLACK10")).discountCents).toBeGreaterThan(0);
  });

  it("cancelar o pedido (ou ele expirar sem pagar) devolve o uso ao cupom", async () => {
    await createCoupon(baseCoupon({ maxRedemptions: 1, maxPerUser: 1 }));
    const a = await buyer();
    const o1 = await order(a, "BLACK10");
    await expect(order(await buyer(), "BLACK10")).rejects.toThrow(/limite de usos/);

    await cancelOrderByCustomer(o1.id, sessionOf(a.user));
    expect((await redemptions())[0].releasedAt).not.toBeNull();
    const o2 = await order(a, "BLACK10"); // o mesmo cliente volta a poder usar
    expect(o2.discountCents).toBeGreaterThan(0);

    // Expira sem pagar: também devolve.
    await db.update(orders).set({ expiresAt: new Date(Date.now() - HOUR) }).where(eq(orders.id, o2.id));
    expect(await expireUnpaidOrders()).toBe(1);
    const active = (await redemptions()).filter((r) => r.releasedAt === null);
    expect(active).toHaveLength(0);
  });

  it("cancelamento feito pelo administrador também devolve o uso ao cupom", async () => {
    await createCoupon(baseCoupon({ maxRedemptions: 1 }));
    const a = await buyer();
    const o = await order(a, "BLACK10");
    await expect(order(await buyer(), "BLACK10")).rejects.toThrow(/limite de usos/);
    await updateOrderStatus({ orderId: o.id, next: "CANCELADO", actorId: a.user.id });
    expect((await redemptions())[0].releasedAt).not.toBeNull();
    expect((await order(await buyer(), "BLACK10")).discountCents).toBeGreaterThan(0);
  });

  it("pedido pago continua segurando o cupom", async () => {
    await createCoupon(baseCoupon({ maxRedemptions: 1 }));
    const a = await buyer();
    const o = await order(a, "BLACK10");
    await db.update(orders).set({ status: "PAGO", paymentStatus: "APROVADO" }).where(eq(orders.id, o.id));
    await db.update(orders).set({ expiresAt: new Date(Date.now() - HOUR) }).where(eq(orders.id, o.id));
    await expireUnpaidOrders();
    await expect(order(await buyer(), "BLACK10")).rejects.toThrow(/limite de usos/);
  });
});

describe("pagamento com cupom", () => {
  it("o Mercado Pago recebe itens + frete com soma EXATA do total (centavos quebrados)", async () => {
    await createCoupon(baseCoupon({ value: 7 }));
    const a = await buyer({ price: 3333, qty: 3 });
    const o = await order(a, "BLACK10", 3);
    expect(o.discountCents).toBe(Math.floor((3333 * 3 * 7) / 100));
    await startPaymentForOrder(o.id, a.user.id);
    const pref = mp.preferences[0] as { items: Array<{ title: string; quantity: number; unit_price: number }> };
    const sum = pref.items.reduce((s, i) => s + Math.round(i.unit_price * 100) * i.quantity, 0);
    expect(sum).toBe(o.totalCents);
  });
});

describe("painel de cupons", () => {
  it("não repete código, mantém maiúsculas e conta usos", async () => {
    await createCoupon(baseCoupon({ code: "promo-natal" }));
    await expect(createCoupon(baseCoupon({ code: "PROMO-NATAL" }))).rejects.toBeInstanceOf(ConflictError);
    await expect(createCoupon(baseCoupon({ code: "a b" }))).rejects.toBeInstanceOf(ValidationError);
    const list = await listCoupons();
    expect(list.map((c) => c.code)).toEqual(["PROMO-NATAL"]);
    expect(list[0].used).toBe(0);
  });

  it("só exclui cupom que nunca foi usado", async () => {
    await createCoupon(baseCoupon());
    const a = await buyer();
    await order(a, "BLACK10");
    const [c] = await db.select().from(coupons);
    await expect(deleteCoupon(c.id)).rejects.toThrow(/Desative/);
    await createCoupon(baseCoupon({ code: "LIVRE" }));
    const [free] = await db.select().from(coupons).where(eq(coupons.code, "LIVRE"));
    await deleteCoupon(free.id);
    expect(await db.select().from(coupons)).toHaveLength(1);
    expect((await listCoupons())[0].used).toBe(1);
  });

  it("recusa limite de usos absurdo (não estoura o inteiro do banco)", async () => {
    await expect(createCoupon(baseCoupon({ maxRedemptions: 99_999_999_999 }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createCoupon(baseCoupon({ maxPerUser: 2_000_000 }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createCoupon(baseCoupon({ maxRedemptions: 1_000_000, maxPerUser: 5 }))).resolves.toHaveProperty("code", "BLACK10");
  });

  it("o banco recusa valores impossíveis mesmo fora da aplicação", async () => {
    await expect(db.insert(coupons).values({ code: "ABC", kind: "PERCENT", value: 95 })).rejects.toThrow();
    await expect(db.insert(coupons).values({ code: "abc", kind: "FIXED", value: 100 })).rejects.toThrow();
    await expect(db.insert(coupons).values({ code: "ABC", kind: "FIXED", value: 0 })).rejects.toThrow();
  });
});
