import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { carts } from "@/server/db/schema";
import { addToCart, createGuestCart, getCartView, getOrCreateUserCart, removeCartItem, setCartItemQuantity } from "@/server/services/cart";
import { getLiveCartsReport, getProductCartInterest } from "@/server/services/live-carts";
import { createOrderFromCart } from "@/server/services/orders";
import { createAddress, createTestProduct, createUser, db, resetDb } from "./helpers";

beforeEach(resetDb);

const age = (cartId: string, minutes: number) =>
  db.update(carts).set({ updatedAt: sql`now() - make_interval(mins => ${minutes})` }).where(eq(carts.id, cartId));

async function guestWith(productId: string, qty = 1) {
  const id = await createGuestCart();
  await addToCart(id, productId, qty);
  return id;
}

describe("prova social (loja)", () => {
  it("conta só OUTROS carrinhos ativos e ignora os parados há mais de 30 min", async () => {
    const p = await createTestProduct({ stock: 9, active: true });
    expect(await getProductCartInterest(p.id)).toBe(0);
    const a = await guestWith(p.id);
    const b = await guestWith(p.id);
    const old = await guestWith(p.id);
    await age(old, 45);
    expect(await getProductCartInterest(p.id)).toBe(2);
    expect(await getProductCartInterest(p.id, a)).toBe(1); // sem contar o próprio carrinho
    expect(await getProductCartInterest(p.id, b)).toBe(1);
  });

  it("mexer no carrinho (quantidade, remover) renova a atividade", async () => {
    const p = await createTestProduct({ stock: 9, active: true });
    const id = await guestWith(p.id, 2);
    await age(id, 45);
    expect(await getProductCartInterest(p.id)).toBe(0);
    const [line] = (await getCartView(id)).lines;
    await setCartItemQuantity(id, line.itemId, 3);
    expect(await getProductCartInterest(p.id)).toBe(1);
    await age(id, 45);
    await removeCartItem(id, line.itemId);
    const q = await db.select({ u: carts.updatedAt }).from(carts).where(eq(carts.id, id));
    expect(Date.now() - q[0].u.getTime()).toBeLessThan(10_000);
  });
});

describe("painel de carrinhos ao vivo", () => {
  it("separa ativos de abandonados, mostra cliente só quando logado e soma com o preço promocional", async () => {
    const car = await createTestProduct({ name: "Fusca Azul", priceCents: 10000, salePriceCents: 8000, stock: 9, active: true });
    const user = await createUser({ name: "Maria Colecionadora" });
    const logged = await getOrCreateUserCart(user.id);
    await addToCart(logged, car.id, 2);
    const guest = await guestWith(car.id, 1);
    await age(guest, 120);

    const r = await getLiveCartsReport();
    expect(r.active.map((c) => c.id)).toEqual([logged]);
    expect(r.active[0].customerName).toBe("Maria Colecionadora");
    expect(r.active[0].totalCents).toBe(16000);
    expect(r.active[0].items).toEqual([{ name: "Fusca Azul", quantity: 2 }]);
    expect(r.abandoned.map((c) => c.id)).toEqual([guest]);
    expect(r.abandoned[0].customerName).toBeNull();
    expect(r.funnel.cartsWithItems).toBe(2);
  });

  it("ranking dos mais colocados agora, só carrinhos ativos", async () => {
    const a = await createTestProduct({ name: "Produto A", stock: 9, active: true });
    const b = await createTestProduct({ name: "Produto B", stock: 9, active: true });
    await guestWith(a.id);
    await guestWith(a.id, 2);
    await guestWith(b.id);
    const stale = await guestWith(b.id);
    await age(stale, 90);
    const r = await getLiveCartsReport();
    expect(r.ranking.map((x) => [x.name, x.carts, x.units])).toEqual([
      ["Produto A", 2, 3],
      ["Produto B", 1, 1],
    ]);
  });

  it("quem já fez pedido depois não aparece como abandonado e o funil conta pedidos", async () => {
    const p = await createTestProduct({ stock: 9, active: true });
    const user = await createUser();
    const address = await createAddress(user.id);
    const cartId = await getOrCreateUserCart(user.id);
    await addToCart(cartId, p.id, 1);
    await createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "ENTREGA", note: null });
    // volta a ter item no carrinho antigo, mas o pedido é posterior à atividade
    await addToCart(cartId, p.id, 1);
    await age(cartId, 600);
    const r = await getLiveCartsReport();
    expect(r.abandoned).toHaveLength(0);
    expect(r.funnel.ordersCreated).toBe(1);
    expect(r.funnel.ordersPaid).toBe(0);
  });
});
