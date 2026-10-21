import { beforeEach, describe, expect, it, vi } from "vitest";
import { count, eq } from "drizzle-orm";
import sharp from "sharp";

/**
 * As ações e rotas do painel leem o cookie de sessão via next/headers.
 * Aqui o "navegador" é simulado: `browser.token` é o cookie que a requisição leva.
 */
const browser = vi.hoisted(() => ({ token: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "loja_session" && browser.token ? { name, value: browser.token } : undefined),
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { POST as uploadRoute } from "@/app/api/admin/upload/route";
import {
  adjustStockAction,
  deleteProductAction,
  refundOrderAction,
  saveCategoryAction,
  saveProductAction,
  saveSettingsAction,
  suggestProductAction,
  toggleCustomerActiveAction,
  toggleProductActiveAction,
  updateOrderStatusAction,
} from "@/server/actions/admin";
import { createSession } from "@/server/auth/session";
import { categories, orders, productImages, products, settings, stockMovements, users } from "@/server/db/schema";
import { clearAllRateLimits } from "@/server/security/rate-limit";
import { getDashboardStats } from "@/server/services/dashboard";
import { addToCart, getOrCreateUserCart } from "@/server/services/cart";
import { createOrderFromCart } from "@/server/services/orders";
import { saveProductImage, MAX_UPLOAD_BYTES } from "@/server/storage/images";
import { getStorage } from "@/server/storage";
import { createAddress, createAdmin, createTestProduct, createUser, db, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  browser.token = null;
  clearAllRateLimits();
});

async function loginAs(user: { id: string; role: "CLIENTE" | "ADMIN" }) {
  browser.token = (await createSession(user.id, user.role)).token;
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const row = async (table: Parameters<typeof db.select>[0] extends never ? never : any) => (await db.select({ n: count() }).from(table))[0].n;

/** Retrato simples do banco para provar que NADA mudou. */
async function snapshot() {
  return {
    products: await row(products),
    categories: await row(categories),
    movements: await row(stockMovements),
    users: JSON.stringify(await db.select({ id: users.id, active: users.active }).from(users).orderBy(users.id)),
    orders: JSON.stringify(await db.select({ id: orders.id, status: orders.status }).from(orders).orderBy(orders.id)),
    stock: JSON.stringify(await db.select({ id: products.id, stock: products.stock, active: products.active }).from(products).orderBy(products.id)),
  };
}

describe("permissões das ações do painel (todas exigem ADMIN)", () => {
  async function allAdminActionCalls() {
    const target = await createTestProduct({ stock: 5 });
    const victim = await createUser({ name: "Outro cliente" });
    const buyer = await createUser();
    const address = await createAddress(buyer.id);
    const cartId = await getOrCreateUserCart(buyer.id);
    await addToCart(cartId, target.id, 1);
    const created = await createOrderFromCart({ userId: buyer.id, cartId, addressId: address.id, shippingCode: "ENTREGA", note: null });

    const calls: Array<[string, () => Promise<{ ok?: boolean; message?: string }>]> = [
      ["saveProductAction", () => saveProductAction({}, form({ name: "Invasor", price: "10,00", stock: "1", intent: "publish" }))],
      ["deleteProductAction", () => deleteProductAction({}, form({ productId: target.id }))],
      ["toggleProductActiveAction", () => toggleProductActiveAction({}, form({ productId: target.id, active: "false" }))],
      ["saveCategoryAction", () => saveCategoryAction({}, form({ name: "Categoria Invasora" }))],
      ["adjustStockAction", () => adjustStockAction({}, form({ productId: target.id, mode: "ENTRADA", quantity: "500", reason: "x" }))],
      ["updateOrderStatusAction", () => updateOrderStatusAction({}, form({ orderId: created.id, next: "CANCELADO" }))],
      ["refundOrderAction", () => refundOrderAction({}, form({ orderId: created.id }))],
      ["toggleCustomerActiveAction", () => toggleCustomerActiveAction({}, form({ userId: victim.id, active: "false" }))],
      ["saveSettingsAction", () => saveSettingsAction({}, form({ storeName: "Loja Invadida" }))],
      ["suggestProductAction", () => suggestProductAction({}, form({ description: "Miniatura de teste lacrada" }))],
    ];
    return calls;
  }

  it("visitante (sem login): toda ação é recusada e o banco não muda", async () => {
    const calls = await allAdminActionCalls();
    const before = await snapshot();
    for (const [name, call] of calls) {
      const result = await call();
      expect(result.ok, name).toBeFalsy();
      expect(result.message, name).toMatch(/entrar|login|conta/i);
    }
    expect(await snapshot()).toEqual(before);
  });

  it("cliente comum logado: toda ação é recusada (403) e o banco não muda", async () => {
    const calls = await allAdminActionCalls();
    const client = await createUser();
    await loginAs(client);
    const before = await snapshot();
    for (const [name, call] of calls) {
      const result = await call();
      expect(result.ok, name).toBeFalsy();
      expect(result.message, name).toMatch(/permiss/i);
    }
    expect(await snapshot()).toEqual(before);
  });

  it("administrador consegue (prova de que os testes acima recusam pelo motivo certo)", async () => {
    const product = await createTestProduct({ stock: 5 });
    await loginAs(await createAdmin());
    const result = await adjustStockAction({}, form({ productId: product.id, mode: "ENTRADA", quantity: "3", reason: "teste" }));
    expect(result.ok).toBe(true);
    expect((await db.select().from(products).where(eq(products.id, product.id)))[0].stock).toBe(8);
  });

  it("cliente desativado perde o acesso na hora, mesmo com o cookie antigo", async () => {
    const admin = await createAdmin();
    await loginAs(admin);
    const product = await createTestProduct({ stock: 1 });
    await db.update(users).set({ active: false }).where(eq(users.id, admin.id));
    const result = await adjustStockAction({}, form({ productId: product.id, mode: "ENTRADA", quantity: "3", reason: "teste" }));
    expect(result.ok).toBeFalsy();
  });

  it("o assistente de IA não chama o serviço externo quando quem pede não é administrador", async () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.AI_API_KEY = "chave";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      await loginAs(await createUser());
      const result = await suggestProductAction({}, form({ description: "Miniatura de teste lacrada" }));
      expect(result.ok).toBeFalsy();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      delete process.env.AI_PROVIDER;
      delete process.env.AI_API_KEY;
    }
  });

  it("administrador sem IA configurada recebe aviso claro (nada é inventado)", async () => {
    delete process.env.AI_PROVIDER;
    await loginAs(await createAdmin());
    const result = await suggestProductAction({}, form({ description: "Miniatura de teste lacrada" }));
    expect(result.ok).toBeFalsy();
    expect(result.message).toMatch(/não foi configurado/);
  });
});

describe("upload de imagens (/api/admin/upload)", () => {
  const png = () => sharp({ create: { width: 64, height: 48, channels: 3, background: "#2a7a5a" } }).png().toBuffer();

  async function upload(opts: { file?: Blob | null; name?: string; origin?: string | null; query?: string } = {}) {
    const fd = new FormData();
    if (opts.file !== null) fd.set("file", opts.file ?? new Blob([await png()], { type: "image/png" }), opts.name ?? "foto.png");
    const headers: Record<string, string> = {};
    if (opts.origin !== null) headers.origin = opts.origin ?? "http://localhost:3000";
    const response = await uploadRoute(new Request(`http://localhost:3000/api/admin/upload${opts.query ?? ""}`, { method: "POST", body: fd, headers }));
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  it("visitante e cliente comum são recusados; nada é gravado", async () => {
    expect((await upload()).status).toBe(401);
    await loginAs(await createUser());
    expect((await upload()).status).toBe(403);
    expect(await row(productImages)).toBe(0);
  });

  it("CSRF: requisição de outro site (ou sem Origin) é recusada mesmo com o cookie do administrador", async () => {
    await loginAs(await createAdmin());
    expect((await upload({ origin: "https://site-malicioso.example" })).status).toBe(403);
    expect((await upload({ origin: null })).status).toBe(403);
    expect(await row(productImages)).toBe(0);
  });

  it("administrador envia PNG: é regravado como WebP e vinculado só depois (fica 'solto')", async () => {
    await loginAs(await createAdmin());
    const { status, body } = await upload();
    expect(status).toBe(200);
    expect(String(body.url)).toMatch(/^\/uploads\/products\/[0-9a-f-]+\.webp$/);

    const [image] = await db.select().from(productImages);
    expect(image.productId).toBeNull();
    const stored = await getStorage().get(image.storageKey);
    expect(stored?.contentType).toBe("image/webp");
    expect(stored?.data.subarray(0, 4).toString()).toBe("RIFF");
    expect(stored?.data.subarray(8, 12).toString()).toBe("WEBP");
  });

  it("rejeita o que não é imagem de verdade: texto, SVG, HTML, 'PNG' falso, arquivo vazio", async () => {
    await loginAs(await createAdmin());
    const cases: Array<[string, Blob, string]> = [
      ["texto", new Blob(["só um texto"], { type: "text/plain" }), "a.txt"],
      ["svg", new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: "image/svg+xml" }), "a.svg"],
      ["html", new Blob(["<html><script>alert(1)</script></html>"], { type: "image/png" }), "a.png"],
      ["png falso", new Blob([Buffer.from("isto não é um PNG de verdade")], { type: "image/png" }), "falso.png"],
      ["vazio", new Blob([], { type: "image/png" }), "vazio.png"],
    ];
    for (const [label, file, name] of cases) {
      const { status, body } = await upload({ file, name });
      expect(status, label).toBe(422); // conteúdo inválido
      expect(String(body.error), label).not.toMatch(/at |node_modules|sharp/i);
    }
    expect(await row(productImages)).toBe(0);
  });

  it("rejeita arquivo acima de 8 MB e requisição sem arquivo", async () => {
    await loginAs(await createAdmin());
    const big = new Blob([Buffer.alloc(MAX_UPLOAD_BYTES + 1)], { type: "image/png" });
    expect((await upload({ file: big })).status).toBe(413);
    expect((await upload({ file: null })).status).toBe(400);
  });

  it("logo (?kind=logo) também é validado e regravado como WebP", async () => {
    await loginAs(await createAdmin());
    const ok = await upload({ query: "?kind=logo" });
    expect(ok.status).toBe(200);
    expect(String(ok.body.key)).toMatch(/^branding\/[0-9a-f-]+\.webp$/);
    const bad = await upload({ query: "?kind=logo", file: new Blob(["nada"], { type: "image/png" }), name: "x.png" });
    expect(bad.status).toBe(422);
  });

  it("imagem enorme em pixels é recusada em vez de estourar a memória", async () => {
    const huge = await sharp({ create: { width: 9000, height: 9000, channels: 3, background: "#000" } }).png({ compressionLevel: 9 }).toBuffer();
    await expect(saveProductImage(huge)).rejects.toThrow();
  });
});

describe("painel: números do dashboard", () => {
  async function newOrder(price: number) {
    const product = await createTestProduct({ stock: 50, priceCents: price });
    const user = await createUser();
    const address = await createAddress(user.id);
    const cartId = await getOrCreateUserCart(user.id);
    await addToCart(cartId, product.id, 1);
    return createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "ENTREGA", note: null });
  }

  it("faturamento conta só pedidos pagos; pendentes, cancelados e reembolsados ficam de fora", async () => {
    const paid1 = await newOrder(10000);
    const paid2 = await newOrder(20000);
    const shipped = await newOrder(30000);
    const refunded = await newOrder(40000);
    const cancelled = await newOrder(50000);
    await newOrder(60000); // continua aguardando pagamento

    const now = new Date();
    const setStatus = (id: string, status: "PAGO" | "ENVIADO" | "REEMBOLSADO" | "CANCELADO") =>
      db.update(orders).set({ status, paidAt: now }).where(eq(orders.id, id));
    await setStatus(paid1.id, "PAGO");
    await setStatus(paid2.id, "PAGO");
    await setStatus(shipped.id, "ENVIADO");
    await setStatus(refunded.id, "REEMBOLSADO");
    await setStatus(cancelled.id, "CANCELADO");

    const expectedRevenue = paid1.totalCents + paid2.totalCents + shipped.totalCents;
    const stats = await getDashboardStats();

    expect(stats.revenueCents).toBe(expectedRevenue);
    expect(stats.paidOrders).toBe(3);
    expect(stats.averageTicketCents).toBe(Math.round(expectedRevenue / 3));
    expect(stats.todayCents).toBe(expectedRevenue);
    expect(stats.last30Cents).toBe(expectedRevenue);
    expect(stats.ordersToShip).toBe(2); // só PAGO/PROCESSANDO esperam envio
    expect(stats.pendingOrders).toBe(1);
    expect(stats.customers).toBe(6);

    expect(stats.daily).toHaveLength(14);
    expect(stats.daily.reduce((sum, d) => sum + d.revenueCents, 0)).toBe(expectedRevenue);
    expect(stats.daily.reduce((sum, d) => sum + d.orders, 0)).toBe(3);
  });

  it("banco vazio: tudo zerado, sem erro de divisão", async () => {
    const stats = await getDashboardStats();
    expect(stats).toMatchObject({ revenueCents: 0, paidOrders: 0, averageTicketCents: 0, pendingOrders: 0, ordersToShip: 0 });
    expect(stats.daily).toHaveLength(14);
    expect(stats.topProducts).toEqual([]);
  });

  it("alerta de produto publicado sem foto e estoque baixo", async () => {
    await createTestProduct({ stock: 2, lowStockThreshold: 3 });
    await createTestProduct({ stock: 0 });
    await createTestProduct({ stock: 20 });
    const stats = await getDashboardStats();
    expect(stats.activeWithoutImages).toBe(3);
    expect(stats.lowStock.length).toBe(2);
  });
});

describe("configurações: frete nunca é inventado nem vira 'grátis' sem querer", () => {
  const base = { storeName: "RT Multicolecionismo", shippingDeliveryEnabled: "on", payPix: "on", shippingEstimate: "5 dias úteis" };

  it("entrega ligada com o valor do frete em branco é recusada (0 é o jeito de dizer 'grátis')", async () => {
    await loginAs(await createAdmin());
    const blank = await saveSettingsAction({}, form({ ...base, shippingFlatRate: "" }));
    expect(blank.ok).not.toBe(true);
    expect(blank.errors?.shippingFlatRate).toMatch(/valor do frete/i);

    const free = await saveSettingsAction({}, form({ ...base, shippingFlatRate: "0" }));
    expect(free.ok).toBe(true);
  });

  it("sem nenhuma forma de entrega ativa, não salva (ninguém conseguiria comprar)", async () => {
    await loginAs(await createAdmin());
    const none = await saveSettingsAction({}, form({ storeName: "RT Multicolecionismo", payPix: "on" }));
    expect(none.ok).not.toBe(true);
    expect(none.errors?.shippingDeliveryEnabled).toBeTruthy();
  });

  it("com valor e prazo informados, salva exatamente o que o dono digitou", async () => {
    await loginAs(await createAdmin());
    const saved = await saveSettingsAction({}, form({ ...base, shippingFlatRate: "27,50" }));
    expect(saved.ok).toBe(true);
    const row = (await db.select().from(settings))[0].value as { shipping: { flatRateCents: number; estimate: string; deliveryEnabled: boolean } };
    expect(row.shipping).toMatchObject({ flatRateCents: 2750, estimate: "5 dias úteis", deliveryEnabled: true });
  });
});
