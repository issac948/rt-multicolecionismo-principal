import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { products, stockMovements } from "@/server/db/schema";
import { InsufficientStockError } from "@/server/errors";
import { addToCart, getOrCreateUserCart } from "@/server/services/cart";
import { adjustStock, restoreStockForOrder } from "@/server/services/inventory";
import { createOrderFromCart } from "@/server/services/orders";
import { saveSettings } from "@/server/services/settings";
import { createAddress, createTestProduct, createUser, db, resetDb, testSettings } from "./helpers";

beforeEach(async () => {
  await resetDb();
  // Retirada na loja evita precisar de endereço em todo teste de estoque.
  await saveSettings(testSettings({ pickupEnabled: true }));
});

async function buyer(productId: string, quantity = 1) {
  const user = await createUser();
  const cartId = await getOrCreateUserCart(user.id);
  await addToCart(cartId, productId, quantity);
  return { user, cartId };
}

const checkout = (b: { user: { id: string }; cartId: string }) =>
  createOrderFromCart({ userId: b.user.id, cartId: b.cartId, addressId: null, shippingCode: "RETIRADA", note: null });

const stockOf = async (id: string) => (await db.select().from(products).where(eq(products.id, id)))[0].stock;

describe("estoque e concorrência", () => {
  it("10 compradores disputando o ÚLTIMO item: só 1 consegue, estoque nunca fica negativo", async () => {
    const product = await createTestProduct({ stock: 1 });
    const buyers = await Promise.all(Array.from({ length: 10 }, () => buyer(product.id)));

    const results = await Promise.allSettled(buyers.map(checkout));
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(9);
    for (const f of failed) {
      expect(f.reason?.message).toMatch(/estoque|unidade/i);
    }
    expect(await stockOf(product.id)).toBe(0);
  });

  it("estoque 5 e 20 compras de 1 unidade em paralelo: vende exatamente 5", async () => {
    const product = await createTestProduct({ stock: 5 });
    const buyers = await Promise.all(Array.from({ length: 20 }, () => buyer(product.id)));
    const results = await Promise.allSettled(buyers.map(checkout));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(await stockOf(product.id)).toBe(0);
    const sales = await db.select().from(stockMovements).where(eq(stockMovements.type, "VENDA"));
    expect(sales.reduce((sum, m) => sum + m.quantityChange, 0)).toBe(-5);
  });

  it("pedido com vários produtos: se um falta, NENHUM estoque é baixado", async () => {
    const a = await createTestProduct({ stock: 10 });
    const b = await createTestProduct({ stock: 1 });
    const user = await createUser();
    const cartId = await getOrCreateUserCart(user.id);
    await addToCart(cartId, a.id, 2);
    await addToCart(cartId, b.id, 1);

    // Outro cliente leva a última unidade de B antes de este finalizar.
    const rival = await buyer(b.id);
    await checkout(rival);

    await expect(checkout({ user, cartId })).rejects.toThrow();
    expect(await stockOf(a.id)).toBe(10); // A não foi tocado: a transação foi desfeita
    expect(await stockOf(b.id)).toBe(0);
  });

  it("o banco recusa estoque negativo mesmo se o código errar (CHECK)", async () => {
    const product = await createTestProduct({ stock: 2 });
    await expect(db.update(products).set({ stock: -1 }).where(eq(products.id, product.id))).rejects.toThrow();
  });

  it("não vende produto desativado", async () => {
    const product = await createTestProduct({ stock: 5, active: true });
    const b = await buyer(product.id);
    await db.update(products).set({ active: false }).where(eq(products.id, product.id));
    await expect(checkout(b)).rejects.toThrow(/dispon/i);
    expect(await stockOf(product.id)).toBe(5);
  });
});

describe("devolução ao estoque", () => {
  it("devolve uma única vez, mesmo chamado repetidamente (idempotente)", async () => {
    const product = await createTestProduct({ stock: 3 });
    const b = await buyer(product.id, 2);
    const order = await checkout(b);
    expect(await stockOf(product.id)).toBe(1);

    const first = await db.transaction((tx) => restoreStockForOrder(tx, order.id, "teste"));
    const second = await db.transaction((tx) => restoreStockForOrder(tx, order.id, "teste"));
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(await stockOf(product.id)).toBe(3);
  });

  it("devoluções simultâneas do mesmo pedido também só contam uma vez", async () => {
    const product = await createTestProduct({ stock: 4 });
    const b = await buyer(product.id, 4);
    const order = await checkout(b);
    expect(await stockOf(product.id)).toBe(0);

    await Promise.all(Array.from({ length: 5 }, () => db.transaction((tx) => restoreStockForOrder(tx, order.id, "teste"))));
    expect(await stockOf(product.id)).toBe(4);
  });
});

describe("ajustes manuais do painel", () => {
  it("registra histórico em entrada, saída e definição", async () => {
    const product = await createTestProduct({ stock: 10 });
    await adjustStock({ productId: product.id, mode: "ENTRADA", quantity: 5, reason: "Chegou carga", actorId: null });
    await adjustStock({ productId: product.id, mode: "SAIDA", quantity: 3, reason: "Avaria", actorId: null });
    const result = await adjustStock({ productId: product.id, mode: "DEFINIR", quantity: 20, reason: "Contagem", actorId: null });

    expect(result).toMatchObject({ before: 12, after: 20, changed: true });
    expect(await stockOf(product.id)).toBe(20);

    const moves = await db.select().from(stockMovements).where(eq(stockMovements.productId, product.id));
    // 1 de cadastro (estoque inicial) + 3 ajustes
    expect(moves).toHaveLength(4);
    expect(moves.map((m) => m.stockAfter).sort((a, b) => a - b)).toEqual([10, 12, 15, 20]);
  });

  it("não deixa retirar mais do que existe", async () => {
    const product = await createTestProduct({ stock: 2 });
    await expect(
      adjustStock({ productId: product.id, mode: "SAIDA", quantity: 3, reason: null, actorId: null }),
    ).rejects.toThrow(/só há 2/i);
    expect(await stockOf(product.id)).toBe(2);
  });

  it("ajustes simultâneos não perdem atualização", async () => {
    const product = await createTestProduct({ stock: 0 });
    await Promise.all(
      Array.from({ length: 15 }, () =>
        adjustStock({ productId: product.id, mode: "ENTRADA", quantity: 2, reason: null, actorId: null }),
      ),
    );
    expect(await stockOf(product.id)).toBe(30);
  });
});

describe("mensagens de estoque", () => {
  it("InsufficientStockError informa a quantidade disponível", () => {
    expect(new InsufficientStockError("x", "Carrinho X", 2).message).toContain("2 unidade");
    expect(new InsufficientStockError("x", "Carrinho X", 0).message).toContain("sem estoque");
  });

  it("usa um endereço só quando a entrega precisa dele", async () => {
    const product = await createTestProduct({ stock: 3 });
    const user = await createUser();
    const cartId = await getOrCreateUserCart(user.id);
    await addToCart(cartId, product.id, 1);

    await expect(
      createOrderFromCart({ userId: user.id, cartId, addressId: null, shippingCode: "ENTREGA", note: null }),
    ).rejects.toThrow();
    expect(await stockOf(product.id)).toBe(3);

    const address = await createAddress(user.id);
    const order = await createOrderFromCart({
      userId: user.id,
      cartId,
      addressId: address.id,
      shippingCode: "ENTREGA",
      note: null,
    });
    expect(order.shippingCents).toBe(3000);
  });
});
