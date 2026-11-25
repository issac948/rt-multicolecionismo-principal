import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orders } from "@/server/db/schema";
import { addressToText } from "@/lib/address-text";
import { addToCart, getOrCreateUserCart } from "@/server/services/cart";
import { createOrderFromCart, listOrdersWithItems } from "@/server/services/orders";
import { createAddress, createTestProduct, createUser, db, resetDb } from "./helpers";

beforeEach(resetDb);

async function makeOrder(name: string) {
  const product = await createTestProduct({ name, priceCents: 5000, stock: 9 });
  const user = await createUser();
  const address = await createAddress(user.id);
  const cartId = await getOrCreateUserCart(user.id);
  await addToCart(cartId, product.id, 2);
  return createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "ENTREGA", note: "Embrulhar para presente" });
}

describe("listOrdersWithItems (romaneio e CSV)", () => {
  it("filtra por status, traz os itens e ordena do mais antigo para o mais novo", async () => {
    const a = await makeOrder("Fusca azul");
    const b = await makeOrder("Opala preto");
    await makeOrder("Kombi branca"); // continua pendente
    await db.update(orders).set({ status: "PAGO", paymentStatus: "APROVADO" }).where(eq(orders.id, a.id));
    await db.update(orders).set({ status: "PAGO", paymentStatus: "APROVADO" }).where(eq(orders.id, b.id));

    const { rows, truncated } = await listOrdersWithItems({ status: "PAGO" });
    expect(truncated).toBe(false);
    expect(rows.map((o) => o.number)).toEqual([a.number, b.number]);
    expect(rows[0].items[0]).toMatchObject({ name: "Fusca azul", quantity: 2 });
    expect(rows[0].customerNote).toBe("Embrulhar para presente");
  });

  it("endereço em texto para copiar traz destinatário, rua, cidade e CEP", async () => {
    const o = await makeOrder("Fusca azul");
    const [row] = (await listOrdersWithItems({})).rows;
    const text = addressToText(row.shippingAddress!);
    expect(text).toContain(row.shippingAddress!.recipientName);
    expect(text).toMatch(/CEP \d/);
    expect(o.id).toBe(row.id);
  });
});
