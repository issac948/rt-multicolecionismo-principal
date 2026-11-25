import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";

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
import { GET as cronGet, POST as cronPost } from "@/app/api/cron/maintenance/route";
import { runMaintenanceNowAction } from "@/server/actions/admin";
import { createSession } from "@/server/auth/session";
import { orders, products, sessions, storedFiles } from "@/server/db/schema";
import { clearAllRateLimits } from "@/server/security/rate-limit";
import { addToCart, getOrCreateUserCart } from "@/server/services/cart";
import {
  describeMaintenance,
  getMaintenanceStatus,
  resetMaintenanceGate,
  runHousekeeping,
  runMaintenance,
  runOrderMaintenance,
} from "@/server/services/maintenance";
import { createOrderFromCart } from "@/server/services/orders";
import { DatabaseStorage } from "@/server/storage";
import { getStorageUsage, usageLevel } from "@/server/storage/usage";
import { createAddress, createAdmin, createTestProduct, createUser, db, resetDb } from "./helpers";

const ENV_KEYS = ["STORAGE_DRIVER", "STORAGE_DB_MAX_MB", "DATABASE_PLAN_LIMIT_MB"];
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.STORAGE_DRIVER = "database";
  await resetDb();
  browser.token = null;
  clearAllRateLimits();
  resetMaintenanceGate();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function unpaidOrder(opts: { overdue: boolean }) {
  const product = await createTestProduct({ stock: 5, priceCents: 10000 });
  const user = await createUser();
  const address = await createAddress(user.id);
  const cartId = await getOrCreateUserCart(user.id);
  await addToCart(cartId, product.id, 2);
  const order = await createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "ENTREGA", note: null });
  if (opts.overdue) await db.update(orders).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(orders.id, order.id));
  return { product, user, order };
}
/** Vence o prazo DEPOIS de criar todos os pedidos: criar pedido já libera reservas vencidas (reservas.test.ts). */
const makeOverdue = (orderId: string) => db.update(orders).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(orders.id, orderId));
const stockOf = async (id: string) => (await db.select().from(products).where(eq(products.id, id)))[0].stock;
const statusOf = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0].status;

describe("manutenção: separação entre o que mexe em pedidos e a limpeza", () => {
  it("a LIMPEZA nunca toca em pedido, estoque ou pagamento (mesmo vencido)", async () => {
    const { product, order, user } = await unpaidOrder({ overdue: true });
    await db.insert(sessions).values({ userId: user.id, tokenHash: "x".repeat(64), expiresAt: new Date(Date.now() - 1000) });

    const report = await runHousekeeping();
    expect(report.expiredSessions).toBe(1);
    expect(await statusOf(order.id)).toBe("PENDENTE"); // vencido, mas a limpeza não cancela
    expect(await stockOf(product.id)).toBe(3); // estoque continua reservado
  });

  it("o grupo PEDIDOS cancela só o não pago vencido e devolve o estoque; pago e no prazo ficam intactos", async () => {
    const overdue = await unpaidOrder({ overdue: false });
    const fresh = await unpaidOrder({ overdue: false });
    const paid = await unpaidOrder({ overdue: false });
    await makeOverdue(overdue.order.id);
    await makeOverdue(paid.order.id);
    await db.update(orders).set({ status: "PAGO", paymentStatus: "APROVADO" }).where(eq(orders.id, paid.order.id));

    expect(await runOrderMaintenance()).toEqual({ expiredOrders: 1 });
    expect(await statusOf(overdue.order.id)).toBe("CANCELADO");
    expect(await stockOf(overdue.product.id)).toBe(5);
    expect(await statusOf(fresh.order.id)).toBe("PENDENTE");
    expect(await stockOf(fresh.product.id)).toBe(3);
    expect(await statusOf(paid.order.id)).toBe("PAGO");
    expect(await stockOf(paid.product.id)).toBe(3);
  });

  it("registra a última execução e mostra pedidos vencidos ainda segurando estoque", async () => {
    const old = await unpaidOrder({ overdue: false });
    await unpaidOrder({ overdue: false });
    await makeOverdue(old.order.id);
    const before = await getMaintenanceStatus();
    expect(before).toMatchObject({ lastRunAt: null, source: null, overdueUnpaidOrders: 1 });

    const report = await runMaintenance("agendador");
    expect(report.expiredOrders).toBe(1);
    const after = await getMaintenanceStatus();
    expect(after.overdueUnpaidOrders).toBe(0);
    expect(after.source).toBe("agendador");
    expect(after.report?.expiredOrders).toBe(1);
    expect(Date.now() - after.lastRunAt!.getTime()).toBeLessThan(10_000);
    // A linha de controle não estraga as configurações da loja.
    expect(await db.execute(sql`SELECT count(*)::int AS n FROM settings WHERE key = 'store'`).then((r) => (r.rows[0] as { n: number }).n)).toBe(1);
  });

  it("descreve em português o que foi feito", () => {
    expect(describeMaintenance({ expiredOrders: 2, expiredSessions: 0, orphanImages: 1, orphanEventImages: 1, oldWebhookEvents: 0 })).toBe(
      "Manutenção concluída: 2 pedido(s) não pago(s) vencido(s) cancelado(s) e estoque devolvido; 2 foto(s) abandonada(s) removida(s).",
    );
    expect(describeMaintenance({ expiredOrders: 0, expiredSessions: 0, orphanImages: 0, orphanEventImages: 0, oldWebhookEvents: 0 })).toContain("nada para fazer");
  });

  it("a loja pública NUNCA dispara a manutenção; só o painel do dono (rede de segurança)", () => {
    const shopLayout = readFileSync("src/app/(shop)/layout.tsx", "utf8");
    expect(shopLayout).not.toMatch(/maintenance|runMaintenance/);
    const adminLayout = readFileSync("src/app/admin/layout.tsx", "utf8");
    expect(adminLayout).toContain("runMaintenanceIfDue");
    expect(adminLayout).toMatch(/after\(/); // depois da resposta, sem atrasar a página
  });
});

describe("rota do agendador (/api/cron/maintenance)", () => {
  const call = (method: "GET" | "POST", token?: string) =>
    (method === "GET" ? cronGet : cronPost)(new Request("http://localhost:3000/api/cron/maintenance", { method, headers: token ? { authorization: `Bearer ${token}` } : {} }));

  it("recusa sem segredo e com segredo errado; aceita o certo e registra a origem 'agendador'", async () => {
    expect((await call("POST")).status).toBe(401);
    expect((await call("POST", "segredo-errado-com-tamanho-suficiente")).status).toBe(401);
    expect((await call("GET", "test-cron-secret-with-enough-length-X")).status).toBe(401);
    const ok = await call("POST", "test-cron-secret-with-enough-length");
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { ok: boolean }).ok).toBe(true);
    expect((await getMaintenanceStatus()).source).toBe("agendador");
  });

  it("fica desligada (503) se o segredo não estiver configurado", async () => {
    const saved = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "curto";
    try {
      expect((await call("POST", "curto")).status).toBe(503);
    } finally {
      process.env.CRON_SECRET = saved;
    }
  });
});

describe("botão 'Executar manutenção agora' (somente ADMIN)", () => {
  it("visitante e cliente são recusados e nada é alterado", async () => {
    const { order, product } = await unpaidOrder({ overdue: true });
    expect((await runMaintenanceNowAction()).ok).toBeFalsy();
    browser.token = (await createSession((await createUser()).id, "CLIENTE")).token;
    expect((await runMaintenanceNowAction()).ok).toBeFalsy();
    expect(await statusOf(order.id)).toBe("PENDENTE");
    expect(await stockOf(product.id)).toBe(3);
  });

  it("administrador executa; limita tentativas repetidas", async () => {
    const { order } = await unpaidOrder({ overdue: true });
    browser.token = (await createSession((await createAdmin()).id, "ADMIN")).token;
    const result = await runMaintenanceNowAction();
    expect(result.ok).toBe(true);
    expect(result.message).toContain("1 pedido(s) não pago(s) vencido(s) cancelado(s)");
    expect(await statusOf(order.id)).toBe("CANCELADO");
    for (let i = 0; i < 4; i++) await runMaintenanceNowAction();
    expect((await runMaintenanceNowAction()).ok).toBeFalsy(); // 6ª tentativa no mesmo minuto
  });
});

describe("trava de espaço das fotos no banco", () => {
  const png = () => sharp({ create: { width: 64, height: 48, channels: 3, background: "#2a7a5a" } }).png().toBuffer();

  it("recusa foto quando passaria do teto reservado (STORAGE_DB_MAX_MB) e explica como resolver", async () => {
    process.env.STORAGE_DB_MAX_MB = "10"; // 10 MB (mínimo aceito)
    const storage = new DatabaseStorage();
    await storage.put("products/a.webp", Buffer.alloc(6 * 1024 * 1024, 1), "image/webp");
    await expect(storage.put("products/b.webp", Buffer.alloc(5 * 1024 * 1024, 1), "image/webp")).rejects.toThrow(/espaço reservado para fotos.*STORAGE_DB_MAX_MB/);
    expect(await storage.get("products/b.webp")).toBeNull(); // nada foi gravado
    await storage.put("products/c.webp", Buffer.alloc(3 * 1024 * 1024, 1), "image/webp"); // o que cabe continua cabendo
  });

  it("substituir uma foto por outra menor/igual não conta como espaço novo", async () => {
    process.env.STORAGE_DB_MAX_MB = "10";
    const storage = new DatabaseStorage();
    await storage.put("products/a.webp", Buffer.alloc(9 * 1024 * 1024, 1), "image/webp");
    await storage.put("products/a.webp", Buffer.alloc(9 * 1024 * 1024, 2), "image/webp");
    expect(await db.select().from(storedFiles)).toHaveLength(1);
  });

  it("recusa quando o BANCO inteiro está perto do limite do plano (protege pedidos e pagamentos)", async () => {
    process.env.DATABASE_PLAN_LIMIT_MB = "100"; // mínimo aceito; o banco de testes já passa de 90 MB? não: forçamos o plano pequeno abaixo
    const usage = await getStorageUsage();
    // Plano de 100 MB com banco de teste pequeno: cabe uma foto pequena...
    await new DatabaseStorage().put("products/ok.webp", Buffer.from("x"), "image/webp");
    // ...mas uma foto que levaria o banco a mais de 90% do plano é recusada.
    const room = 90 * 1024 * 1024 - usage.databaseBytes;
    await expect(new DatabaseStorage().put("products/grande.webp", Buffer.alloc(room + 1024 * 1024, 1), "image/webp")).rejects.toThrow(/perto do limite do plano/);
  });

  it("a rota de envio devolve 507 com a mensagem (nunca erro técnico) e não deixa foto pela metade", async () => {
    process.env.STORAGE_DB_MAX_MB = "10";
    await new DatabaseStorage().put("products/enche.webp", Buffer.alloc(10 * 1024 * 1024 - 100, 1), "image/webp");
    browser.token = (await createSession((await createAdmin()).id, "ADMIN")).token;
    const fd = new FormData();
    fd.set("file", new Blob([await png()], { type: "image/png" }), "f.png");
    const response = await uploadRoute(new Request("http://localhost:3000/api/admin/upload", { method: "POST", body: fd, headers: { origin: "http://localhost:3000" } }));
    expect(response.status).toBe(507);
    expect(((await response.json()) as { error: string }).error).toMatch(/espaço reservado para fotos/);
    expect(await db.select().from(storedFiles)).toHaveLength(1); // só a que já existia
  });

  it("medidor: soma por tipo de foto e níveis de alerta", async () => {
    const storage = new DatabaseStorage();
    await storage.put("products/a.webp", Buffer.alloc(1000), "image/webp");
    await storage.put("products/a-thumb.webp", Buffer.alloc(200), "image/webp");
    await storage.put("events/e.webp", Buffer.alloc(300), "image/webp");
    const usage = await getStorageUsage();
    expect(usage).toMatchObject({ driver: "database", files: 3, photoBytes: 1500 });
    expect(usage.byPrefix).toEqual([
      { prefix: "events", files: 1, bytes: 300 },
      { prefix: "products", files: 2, bytes: 1200 },
    ]);
    expect(usage.databaseBytes).toBeGreaterThan(0);
    expect(usageLevel(50, 100)).toBe("ok");
    expect(usageLevel(70, 100)).toBe("warn");
    expect(usageLevel(90, 100)).toBe("danger");
    expect(usageLevel(1, 0)).toBe("ok");
  });
});
