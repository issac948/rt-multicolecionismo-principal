import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orderItems, orders, products, stockMovements } from "@/server/db/schema";
import { MAX_CART_LINE_QUANTITY } from "@/lib/constants";
import {
  addToCart,
  createGuestCart,
  getCartView,
  getOrCreateUserCart,
  mergeGuestCartIntoUser,
  normalizeCart,
  removeCartItem,
  setCartItemQuantity,
} from "@/server/services/cart";
import {
  allowedNextStatuses,
  cancelOrderByCustomer,
  createOrderFromCart,
  expireUnpaidOrders,
  getOrderForUser,
  updateOrderStatus,
} from "@/server/services/orders";
import { deleteProduct, listPublicProducts, updateProduct, getProductById, createProduct } from "@/server/services/products";
import { saveSettings } from "@/server/services/settings";
import { createAddress, createAdmin, createTestProduct, createUser, db, productInput, resetDb, testSettings } from "./helpers";

beforeEach(async () => {
  await resetDb();
});

async function order(opts: { stock?: number; qty?: number; price?: number; sale?: number | null } = {}) {
  const product = await createTestProduct({
    stock: opts.stock ?? 10,
    priceCents: opts.price ?? 10000,
    salePriceCents: opts.sale ?? null,
  });
  const user = await createUser();
  const address = await createAddress(user.id);
  const cartId = await getOrCreateUserCart(user.id);
  await addToCart(cartId, product.id, opts.qty ?? 1);
  const created = await createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "ENTREGA", note: null });
  return { product, user, order: created, cartId };
}

describe("carrinho", () => {
  it("soma quantidades do mesmo produto e respeita o estoque", async () => {
    const product = await createTestProduct({ stock: 3 });
    const user = await createUser();
    const cartId = await getOrCreateUserCart(user.id);

    await addToCart(cartId, product.id, 2);
    expect((await addToCart(cartId, product.id, 1)).quantity).toBe(3);
    await expect(addToCart(cartId, product.id, 1)).rejects.toThrow(/já tem 3.*3 em estoque/i);
    const view = await getCartView(cartId);
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0].quantity).toBe(3);
  });

  it("impede quantidade maior que o estoque ao alterar e ao adicionar", async () => {
    const product = await createTestProduct({ stock: 2 });
    const user = await createUser();
    const cartId = await getOrCreateUserCart(user.id);
    await expect(addToCart(cartId, product.id, 3)).rejects.toThrow(/2 unidade/);
    await addToCart(cartId, product.id, 1);
    const [line] = (await getCartView(cartId)).lines;
    await expect(setCartItemQuantity(cartId, line.itemId, 5)).rejects.toThrow(/2 unidade/);
    await setCartItemQuantity(cartId, line.itemId, 2);
    expect((await getCartView(cartId)).lines[0].quantity).toBe(2);
  });

  it("recusa quantidade inválida, produto inativo e limite por linha", async () => {
    const product = await createTestProduct({ stock: 500 });
    const hidden = await createTestProduct({ active: false, stock: 5 });
    const cartId = await getOrCreateUserCart((await createUser()).id);
    for (const q of [0, -1, 1.5, Number.NaN]) await expect(addToCart(cartId, product.id, q)).rejects.toThrow();
    await expect(addToCart(cartId, hidden.id, 1)).rejects.toThrow(/não está disponível/i);
    await expect(addToCart(cartId, product.id, MAX_CART_LINE_QUANTITY + 1)).rejects.toThrow(/no máximo/i);
  });

  it("calcula subtotal com preço promocional e remove itens", async () => {
    const a = await createTestProduct({ priceCents: 10000, salePriceCents: 7500, stock: 5 });
    const b = await createTestProduct({ priceCents: 2590, stock: 5 });
    const cartId = await getOrCreateUserCart((await createUser()).id);
    await addToCart(cartId, a.id, 2);
    await addToCart(cartId, b.id, 3);

    const view = await getCartView(cartId);
    expect(view.subtotalCents).toBe(2 * 7500 + 3 * 2590);
    expect(view.itemCount).toBe(5);
    await removeCartItem(cartId, view.lines[0].itemId);
    expect((await getCartView(cartId)).lines).toHaveLength(1);
  });

  it("não deixa mexer no item de outro carrinho", async () => {
    const product = await createTestProduct({ stock: 5 });
    const mine = await getOrCreateUserCart((await createUser()).id);
    const theirs = await getOrCreateUserCart((await createUser()).id);
    await addToCart(theirs, product.id, 2);
    const [theirLine] = (await getCartView(theirs)).lines;

    await expect(setCartItemQuantity(mine, theirLine.itemId, 1)).rejects.toThrow();
    await removeCartItem(mine, theirLine.itemId);
    expect((await getCartView(theirs)).lines).toHaveLength(1);
  });

  it("sinaliza e corrige itens que ficaram indisponíveis", async () => {
    const product = await createTestProduct({ stock: 5 });
    const gone = await createTestProduct({ stock: 5 });
    const cartId = await getOrCreateUserCart((await createUser()).id);
    await addToCart(cartId, product.id, 5);
    await addToCart(cartId, gone.id, 1);

    await db.update(products).set({ stock: 2 }).where(eq(products.id, product.id));
    await db.update(products).set({ active: false }).where(eq(products.id, gone.id));

    const before = await getCartView(cartId);
    expect(before.hasIssues).toBe(true);
    const messages = await normalizeCart(cartId);
    expect(messages).toHaveLength(2);

    const after = await getCartView(cartId);
    expect(after.hasIssues).toBe(false);
    expect(after.lines).toHaveLength(1);
    expect(after.lines[0].quantity).toBe(2);
  });

  it("junta o carrinho de visitante ao da conta ao entrar", async () => {
    const product = await createTestProduct({ stock: 4 });
    const other = await createTestProduct({ stock: 4 });
    const user = await createUser();
    const userCart = await getOrCreateUserCart(user.id);
    await addToCart(userCart, product.id, 3);

    const guest = await createGuestCart();
    await addToCart(guest, product.id, 3); // 3 + 3 passaria do estoque (4)
    await addToCart(guest, other.id, 1);

    await mergeGuestCartIntoUser(guest, user.id);
    const view = await getCartView(userCart);
    expect(view.lines.find((l) => l.productId === product.id)?.quantity).toBe(4);
    expect(view.lines.find((l) => l.productId === other.id)?.quantity).toBe(1);
    expect((await getCartView(guest)).lines).toHaveLength(0);
  });

  it("não funde um carrinho que pertence a outra conta", async () => {
    const product = await createTestProduct({ stock: 4 });
    const victim = await createUser();
    const attacker = await createUser();
    const victimCart = await getOrCreateUserCart(victim.id);
    await addToCart(victimCart, product.id, 2);

    await mergeGuestCartIntoUser(victimCart, attacker.id); // id de carrinho alheio no "cookie"
    expect((await getCartView(victimCart)).lines).toHaveLength(1);
    expect((await getCartView(await getOrCreateUserCart(attacker.id))).lines).toHaveLength(0);
  });
});

describe("criação do pedido", () => {
  it("calcula subtotal, frete e total com os preços do BANCO", async () => {
    const { order: o, product } = await order({ price: 89990, sale: 79990, qty: 2 });
    expect(o.subtotalCents).toBe(2 * 79990);
    expect(o.shippingCents).toBe(3000);
    expect(o.totalCents).toBe(2 * 79990 + 3000);
    expect(o.number).toBe(1001);
    expect(o.status).toBe("PENDENTE");
    expect(o.paymentStatus).toBe("PENDENTE");
    expect(o.expiresAt).toBeTruthy();

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ productId: product.id, unitPriceCents: 79990, quantity: 2, totalCents: 159980, name: product.name });
  });

  it("se o preço mudar depois de ir ao carrinho, vale o preço atual do banco", async () => {
    const product = await createTestProduct({ priceCents: 10000, stock: 5 });
    const user = await createUser();
    const address = await createAddress(user.id);
    const cartId = await getOrCreateUserCart(user.id);
    await addToCart(cartId, product.id, 1);
    await db.update(products).set({ priceCents: 12000 }).where(eq(products.id, product.id));

    const o = await createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "ENTREGA", note: null });
    expect(o.subtotalCents).toBe(12000);
  });

  it("aplica frete grátis acima do valor configurado", async () => {
    await saveSettings(testSettings({ freeAboveCents: 50000 }));
    const { order: free } = await order({ price: 30000, qty: 2 });
    expect(free.shippingCents).toBe(0);
    expect(free.totalCents).toBe(60000);
    const { order: paid } = await order({ price: 10000, qty: 1 });
    expect(paid.shippingCents).toBe(3000);
  });

  it("ignora qualquer frete que não seja o calculado pelo servidor (só aceita o código)", async () => {
    const product = await createTestProduct({ stock: 5 });
    const user = await createUser();
    const address = await createAddress(user.id);
    const cartId = await getOrCreateUserCart(user.id);
    await addToCart(cartId, product.id, 1);
    await expect(
      createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "FRETE-GRATIS-HACK", note: null }),
    ).rejects.toThrow(/entrega indisponível/i);
    expect((await getCartView(cartId)).lines).toHaveLength(1); // carrinho intacto
  });

  it("esvazia o carrinho e baixa o estoque; carrinho vazio não gera pedido", async () => {
    const { product, cartId, user, order: o } = await order({ stock: 5, qty: 2 });
    expect((await getCartView(cartId)).lines).toHaveLength(0);
    expect((await db.select().from(products).where(eq(products.id, product.id)))[0].stock).toBe(3);
    const address = await createAddress(user.id);
    await expect(
      createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "ENTREGA", note: null }),
    ).rejects.toThrow(/vazio/i);
    expect(o.id).toBeTruthy();
  });

  it("usa só endereço do próprio cliente e guarda uma cópia no pedido", async () => {
    const product = await createTestProduct({ stock: 5 });
    const owner = await createUser();
    const stranger = await createUser();
    const strangerAddress = await createAddress(stranger.id);
    const cartId = await getOrCreateUserCart(owner.id);
    await addToCart(cartId, product.id, 1);

    await expect(
      createOrderFromCart({ userId: owner.id, cartId, addressId: strangerAddress.id, shippingCode: "ENTREGA", note: null }),
    ).rejects.toThrow(/endereço/i);

    const mine = await createAddress(owner.id);
    const o = await createOrderFromCart({ userId: owner.id, cartId, addressId: mine.id, shippingCode: "ENTREGA", note: "Portão azul" });
    expect(o.shippingAddress).toMatchObject({ street: "Avenida Paulista", city: "São Paulo", state: "SP" });
    expect(o.customerNote).toBe("Portão azul");
  });

  it("não usa o carrinho de outra pessoa", async () => {
    const product = await createTestProduct({ stock: 5 });
    const victim = await createUser();
    const attacker = await createUser();
    const victimCart = await getOrCreateUserCart(victim.id);
    await addToCart(victimCart, product.id, 1);
    const address = await createAddress(attacker.id);
    await expect(
      createOrderFromCart({ userId: attacker.id, cartId: victimCart, addressId: address.id, shippingCode: "ENTREGA", note: null }),
    ).rejects.toThrow(/carrinho/i);
  });

  it("o banco recusa pedido com total que não bate (CHECK)", async () => {
    const { order: o } = await order();
    await expect(db.update(orders).set({ totalCents: 1 }).where(eq(orders.id, o.id))).rejects.toThrow();
  });

  it("numera os pedidos em sequência a partir de 1001", async () => {
    const a = (await order()).order;
    const b = (await order()).order;
    expect([a.number, b.number]).toEqual([1001, 1002]);
  });

  it("o histórico do pedido sobrevive a mudança de preço e à exclusão do produto", async () => {
    const { product, order: o } = await order({ price: 10000 });
    // pedido pago, para o produto poder ser excluído
    await db.update(orders).set({ status: "PAGO", paymentStatus: "APROVADO" }).where(eq(orders.id, o.id));
    await db.update(products).set({ priceCents: 99999 }).where(eq(products.id, product.id));
    await deleteProduct(product.id);

    const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
    expect(item.productId).toBeNull();
    expect(item.name).toBe(product.name);
    expect(item.unitPriceCents).toBe(10000);
  });

  it("bloqueia excluir produto que está em pedido aguardando pagamento", async () => {
    const { product } = await order();
    await expect(deleteProduct(product.id)).rejects.toThrow(/aguardando pagamento/i);
  });
});

describe("acesso aos pedidos", () => {
  it("cliente só enxerga os próprios pedidos", async () => {
    const { order: o, user } = await order();
    const stranger = await createUser();
    expect((await getOrderForUser(o.id, user.id))?.id).toBe(o.id);
    expect(await getOrderForUser(o.id, stranger.id)).toBeNull();
  });
});

describe("cancelamento e expiração", () => {
  it("o cliente cancela o pedido não pago e o estoque volta", async () => {
    const { order: o, user, product } = await order({ stock: 5, qty: 2 });
    const stranger = await createUser();
    await expect(cancelOrderByCustomer(o.id, { id: stranger.id, email: "", name: "", phone: null, role: "CLIENTE" })).rejects.toThrow(/não encontrado/i);

    const cancelled = await cancelOrderByCustomer(o.id, { id: user.id, email: "", name: "", phone: null, role: "CLIENTE" });
    expect(cancelled.status).toBe("CANCELADO");
    expect((await db.select().from(products).where(eq(products.id, product.id)))[0].stock).toBe(5);
  });

  it("não cancela pedido já pago pelo cliente", async () => {
    const { order: o, user } = await order();
    await db.update(orders).set({ status: "PAGO", paymentStatus: "APROVADO" }).where(eq(orders.id, o.id));
    await expect(cancelOrderByCustomer(o.id, { id: user.id, email: "", name: "", phone: null, role: "CLIENTE" })).rejects.toThrow(/já foi pago/i);
  });

  it("pedidos não pagos vencidos são cancelados e o estoque volta; pagos não são tocados", async () => {
    const stale = await order({ stock: 5, qty: 2 });
    const paid = await order({ stock: 5, qty: 1 });
    const fresh = await order({ stock: 5, qty: 1 });
    const past = new Date(Date.now() - 60_000);
    await db.update(orders).set({ expiresAt: past }).where(eq(orders.id, stale.order.id));
    await db.update(orders).set({ expiresAt: past, status: "PAGO", paymentStatus: "APROVADO" }).where(eq(orders.id, paid.order.id));

    expect(await expireUnpaidOrders()).toBe(1);
    expect(await expireUnpaidOrders()).toBe(0); // rodar de novo não faz nada

    const status = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0].status;
    expect(await status(stale.order.id)).toBe("CANCELADO");
    expect(await status(paid.order.id)).toBe("PAGO");
    expect(await status(fresh.order.id)).toBe("PENDENTE");
    expect((await db.select().from(products).where(eq(products.id, stale.product.id)))[0].stock).toBe(5);

    const restores = await db.select().from(stockMovements).where(eq(stockMovements.type, "RESTAURACAO"));
    expect(restores).toHaveLength(1);
  });
});

describe("status do pedido (painel)", () => {
  it("segue o fluxo PAGO → PROCESSANDO → ENVIADO → ENTREGUE", async () => {
    const admin = await createAdmin();
    const { order: o } = await order();
    await db.update(orders).set({ status: "PAGO", paymentStatus: "APROVADO" }).where(eq(orders.id, o.id));

    const processing = await updateOrderStatus({ orderId: o.id, next: "PROCESSANDO", actorId: admin.id });
    expect(processing.status).toBe("PROCESSANDO");
    const shipped = await updateOrderStatus({ orderId: o.id, next: "ENVIADO", trackingCode: "BR123456789", actorId: admin.id });
    expect(shipped.status).toBe("ENVIADO");
    expect(shipped.trackingCode).toBe("BR123456789");
    expect(shipped.shippedAt).toBeTruthy();
    const delivered = await updateOrderStatus({ orderId: o.id, next: "ENTREGUE", actorId: admin.id });
    expect(delivered.deliveredAt).toBeTruthy();
    expect(allowedNextStatuses("ENTREGUE")).toEqual([]);
  });

  it("recusa transições inválidas (ex.: enviar pedido que não foi pago)", async () => {
    const admin = await createAdmin();
    const { order: o } = await order();
    await expect(updateOrderStatus({ orderId: o.id, next: "ENVIADO", actorId: admin.id })).rejects.toThrow(/não é possível/i);
    await expect(updateOrderStatus({ orderId: o.id, next: "ENTREGUE", actorId: admin.id })).rejects.toThrow();
    await expect(updateOrderStatus({ orderId: o.id, next: "PAGO", actorId: admin.id })).rejects.toThrow();
  });

  it("cancelar pelo painel devolve o estoque e não permite cancelar pedido enviado", async () => {
    const admin = await createAdmin();
    const { order: o, product } = await order({ stock: 4, qty: 3 });
    await updateOrderStatus({ orderId: o.id, next: "CANCELADO", actorId: admin.id });
    expect((await db.select().from(products).where(eq(products.id, product.id)))[0].stock).toBe(4);

    const shipped = await order();
    await db.update(orders).set({ status: "ENVIADO", paymentStatus: "APROVADO" }).where(eq(orders.id, shipped.order.id));
    await expect(updateOrderStatus({ orderId: shipped.order.id, next: "CANCELADO", actorId: admin.id })).rejects.toThrow();
  });
});

describe("catálogo", () => {
  it("o produto publicado aparece na loja; o desativado some", async () => {
    const live = await createTestProduct({ name: "Carrinho Publicado", active: true });
    await createTestProduct({ name: "Carrinho Rascunho", active: false });

    const names = (await listPublicProducts()).items.map((p) => p.name);
    expect(names).toContain("Carrinho Publicado");
    expect(names).not.toContain("Carrinho Rascunho");

    await updateProduct(live.id, productInput({ name: "Carrinho Publicado", active: false }));
    expect((await listPublicProducts()).items).toHaveLength(0);
  });

  it("busca ignora acentos e maiúsculas e exige todas as palavras", async () => {
    await createTestProduct({ name: "Cupê Esportivo Clássico", tags: ["edição especial"] });
    await createTestProduct({ name: "Picape Vintage Azul" });

    const find = async (q: string) => (await listPublicProducts({ q })).items.map((p) => p.name);
    expect(await find("cupe")).toEqual(["Cupê Esportivo Clássico"]);
    expect(await find("PICAPE azul")).toEqual(["Picape Vintage Azul"]);
    expect(await find("edicao especial")).toEqual(["Cupê Esportivo Clássico"]);
    expect(await find("%")).toEqual([]); // curinga do SQL não vira "tudo"
    expect(await find("'; DROP TABLE products; --")).toEqual([]);
    expect((await listPublicProducts({})).items).toHaveLength(2); // tabela continua lá
  });

  it("filtra por preço efetivo, promoção e estoque, e ordena", async () => {
    await createTestProduct({ name: "Barato", priceCents: 10000, stock: 5 });
    await createTestProduct({ name: "Promo", priceCents: 30000, salePriceCents: 9000, stock: 5 });
    await createTestProduct({ name: "Caro", priceCents: 50000, stock: 0 });

    const names = async (f: Parameters<typeof listPublicProducts>[0]) => (await listPublicProducts(f)).items.map((p) => p.name);
    expect(await names({ onSale: true })).toEqual(["Promo"]);
    expect(await names({ inStock: true, sort: "menor-preco" })).toEqual(["Promo", "Barato"]);
    expect(await names({ maxPriceCents: 9500 })).toEqual(["Promo"]);
    expect(await names({ minPriceCents: 40000 })).toEqual(["Caro"]);
    expect(await names({ sort: "maior-preco" })).toEqual(["Caro", "Barato", "Promo"]);
  });

  it("cadastrar com estoque registra o histórico; editar NÃO altera o estoque", async () => {
    const product = await createTestProduct({ stock: 7 });
    const moves = await db.select().from(stockMovements).where(eq(stockMovements.productId, product.id));
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ type: "CADASTRO", quantityChange: 7, stockAfter: 7 });

    await updateProduct(product.id, productInput({ name: "Novo Nome", stock: 999, priceCents: 5000 }));
    const reloaded = await getProductById(product.id);
    expect(reloaded?.stock).toBe(7); // o campo "stock" do formulário de edição é ignorado
    expect(reloaded?.name).toBe("Novo Nome");
    expect(reloaded?.priceCents).toBe(5000);
    expect(reloaded?.slug).toBe(product.slug); // link não muda ao renomear
  });

  it("gera slugs únicos para nomes iguais e recusa SKU repetido", async () => {
    const a = await createProduct(productInput({ name: "Carrinho Igual", sku: "SKU-1" }), null);
    const b = await createProduct(productInput({ name: "Carrinho Igual" }), null);
    expect(a.slug).toBe("carrinho-igual");
    expect(b.slug).toBe("carrinho-igual-2");
    await expect(createProduct(productInput({ sku: "SKU-1" }), null)).rejects.toThrow(/SKU/);
  });

  it("criações simultâneas com o mesmo nome não falham", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => createProduct(productInput({ name: "Carrinho Concorrente" }), null)),
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const slugs = results.map((r) => (r as PromiseFulfilledResult<{ slug: string }>).value.slug);
    expect(new Set(slugs).size).toBe(6);
  });
});
