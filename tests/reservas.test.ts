import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { orders, products } from "@/server/db/schema";
import { addToCart, getCartView, getOrCreateUserCart } from "@/server/services/cart";
import { createOrderFromCart } from "@/server/services/orders";
import { getPublicProductBySlug, listPublicProducts } from "@/server/services/products";
import { releaseExpiredReservations, resetReservationGate } from "@/server/services/reservations";
import { defaultSettings } from "@/server/services/settings";
import { createAddress, createTestProduct, createUser, db, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  resetReservationGate();
});

async function buy(productId: string, qty = 1) {
  const user = await createUser();
  const address = await createAddress(user.id);
  const cartId = await getOrCreateUserCart(user.id);
  await addToCart(cartId, productId, qty);
  return { user, cartId, address };
}
const place = (b: Awaited<ReturnType<typeof buy>>) =>
  createOrderFromCart({ userId: b.user.id, cartId: b.cartId, addressId: b.address.id, shippingCode: "ENTREGA", note: null });
const stockOf = async (id: string) => (await db.select({ s: products.stock }).from(products).where(eq(products.id, id)))[0].s;
const expire = (orderId: string) => db.update(orders).set({ expiresAt: sql`now() - interval '1 minute'` }).where(eq(orders.id, orderId));

describe("reserva de estoque de pedido não pago", () => {
  it("o prazo padrão para pagar é de 45 minutos", async () => {
    expect(defaultSettings().payment.windowMinutes).toBe(45);
  });

  it("reserva vencida volta para a loja ao abrir a página do produto", async () => {
    const p = await createTestProduct({ stock: 1, active: true });
    const o = await place(await buy(p.id));
    expect(await stockOf(p.id)).toBe(0);
    await expire(o.id);
    expect(await stockOf(p.id)).toBe(0); // ainda presa: ninguém liberou
    resetReservationGate(); // criar o pedido já marcou o intervalo de 30 s
    const view = await getPublicProductBySlug(p.slug);
    expect(view?.stock).toBe(1);
    const [row] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(row.status).toBe("CANCELADO");
  });

  it("libera também ao listar o catálogo e ao abrir o carrinho", async () => {
    const p = await createTestProduct({ stock: 1, active: true });
    const o = await place(await buy(p.id));
    await expire(o.id);
    resetReservationGate(); // criar o pedido já marcou o intervalo de 30 s
    const list = await listPublicProducts({});
    expect(list.items.find((i) => i.id === p.id)?.stock).toBe(1);

    resetReservationGate();
    const q = await createTestProduct({ stock: 1, active: true });
    const o2 = await place(await buy(q.id));
    await expire(o2.id);
    resetReservationGate();
    const other = await buy(q.id);
    await getCartView(other.cartId);
    expect(await stockOf(q.id)).toBe(1);
  });

  it("ao criar pedido, a reserva vencida de outro cliente não faz faltar a última unidade", async () => {
    const p = await createTestProduct({ stock: 1, active: true });
    const first = await place(await buy(p.id));
    resetReservationGate();
    // enquanto a reserva está valendo, ninguém mais consegue pôr a peça no carrinho
    await expect(buy(p.id)).rejects.toThrow(/sem estoque/i);
    await expire(first.id);
    resetReservationGate();
    const b = await buy(p.id); // a reserva vencida é liberada ao adicionar
    const created = await place(b);
    expect(created.status).not.toBe("CANCELADO");
    expect(await stockOf(p.id)).toBe(0);
  });

  it("não passa de uma execução a cada 30 s, exceto com force", async () => {
    const p = await createTestProduct({ stock: 2, active: true });
    const a = await place(await buy(p.id));
    expect(await releaseExpiredReservations()).toBe(0); // nada vencido (marca o intervalo)
    await expire(a.id);
    expect(await releaseExpiredReservations()).toBe(0); // dentro do intervalo
    expect(await releaseExpiredReservations({ force: true })).toBe(1);
  });

  it("pedido pago nunca é liberado", async () => {
    const p = await createTestProduct({ stock: 1, active: true });
    const o = await place(await buy(p.id));
    await db.update(orders).set({ status: "PAGO", paymentStatus: "APROVADO", expiresAt: sql`now() - interval '1 hour'` }).where(eq(orders.id, o.id));
    expect(await releaseExpiredReservations({ force: true })).toBe(0);
    expect(await stockOf(p.id)).toBe(0);
  });

  it("falha ao liberar não derruba a página", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "select").mockImplementation(() => {
      throw new Error("banco fora do ar");
    });
    try {
      expect(await releaseExpiredReservations({ force: true })).toBe(0);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("várias liberações ao mesmo tempo devolvem o estoque uma única vez", async () => {
    const p = await createTestProduct({ stock: 3, active: true });
    const o = await place(await buy(p.id, 2));
    expect(await stockOf(p.id)).toBe(1);
    await expire(o.id);
    const results = await Promise.all(Array.from({ length: 6 }, () => releaseExpiredReservations({ force: true })));
    expect(results.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await stockOf(p.id)).toBe(3);
  });
});
