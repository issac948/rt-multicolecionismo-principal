import { createHmac, randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db, pool } from "@/server/db";
import { addresses, type Product, type User } from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";
import { users } from "@/server/db/schema";
import { createProduct } from "@/server/services/products";
import { clearAllRateLimits } from "@/server/security/rate-limit";
import { defaultSettings, saveSettings } from "@/server/services/settings";
import type { ProductInput } from "@/lib/schemas";

export { db, pool };

const TABLES = [
  "webhook_events",
  "stock_movements",
  "payments",
  "order_items",
  "orders",
  "cart_items",
  "carts",
  "addresses",
  "product_images",
  "products",
  "categories",
  "sessions",
  "users",
  "settings",
];

/**
 * Configurações "do dono" usadas nos testes: entrega com frete fixo de R$ 30,00 em 3 a 7 dias úteis.
 * (Os padrões reais da loja NÃO trazem frete nenhum: quem decide é o dono.)
 */
export function testSettings(shipping: Partial<ReturnType<typeof defaultSettings>["shipping"]> = {}) {
  const base = defaultSettings();
  return { ...base, shipping: { ...base.shipping, deliveryEnabled: true, flatRateCents: 3000, estimate: "3 a 7 dias úteis", ...shipping } };
}

/** Esvazia todas as tabelas, reinicia o contador de números de pedido e grava as configurações de teste. */
export async function resetDb(): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`));
  clearAllRateLimits();
  await saveSettings(testSettings());
}

let counter = 0;
const next = () => ++counter;

// A senha é "hasheada" uma única vez (scrypt é lento de propósito).
let cachedHash: string | undefined;
export const TEST_PASSWORD = "senha-de-teste-123";

export async function createUser(overrides: Partial<{ email: string; name: string; role: "CLIENTE" | "ADMIN"; active: boolean }> = {}): Promise<User> {
  cachedHash ??= await hashPassword(TEST_PASSWORD);
  const n = next();
  const [user] = await db
    .insert(users)
    .values({
      email: overrides.email ?? `cliente${n}@teste.com`,
      name: overrides.name ?? `Cliente ${n}`,
      passwordHash: cachedHash,
      role: overrides.role ?? "CLIENTE",
      active: overrides.active ?? true,
    })
    .returning();
  return user;
}

export async function createAdmin(): Promise<User> {
  return createUser({ role: "ADMIN", name: "Administrador" });
}

export async function createAddress(userId: string) {
  const [address] = await db
    .insert(addresses)
    .values({
      userId,
      recipientName: "Maria Teste",
      phone: "11999998888",
      cep: "01310100",
      street: "Avenida Paulista",
      number: "1000",
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "SP",
      isDefault: true,
    })
    .returning();
  return address;
}

export function productInput(overrides: Partial<ProductInput> = {}): ProductInput {
  const n = next();
  return {
    name: `Miniatura de Teste ${n}`,
    sku: null,
    shortDescription: "Descrição curta",
    description: "Descrição completa da miniatura de teste.",
    priceCents: 89900,
    salePriceCents: null,
    stock: 10,
    lowStockThreshold: 3,
    active: true,
    featured: false,
    categoryId: null,
    features: [],
    tags: [],
    promoText: null,
    seoTitle: null,
    seoDescription: null,
    weightGrams: null,
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    imageIds: [],
    brand: null,
    model: null,
    scale: null,
    series: null,
    releaseYear: null,
    condition: null,
    packagingState: null,
    conservationNotes: null,
    ...overrides,
  };
}

export async function createTestProduct(overrides: Partial<ProductInput> = {}): Promise<Product> {
  return createProduct(productInput(overrides), null);
}

/* -------------------- Servidor Mercado Pago simulado -------------------- */

export type MockMpPayment = {
  id: string;
  status: string;
  transaction_amount: number;
  transaction_amount_refunded?: number;
  external_reference: string | null;
  payment_type_id?: string;
  status_detail?: string;
};

export type MockMp = {
  baseUrl: string;
  payments: Map<string, MockMpPayment>;
  preferences: Array<Record<string, unknown>>;
  refunds: string[];
  failPreferences: boolean;
  close(): Promise<void>;
};

/**
 * Sobe um servidor HTTP local que imita os 3 endpoints do Mercado Pago usados pela
 * loja. Serve APENAS para os testes automatizados: não prova que a integração
 * funciona com o Mercado Pago real (isso exige credenciais de teste).
 */
export async function startMockMercadoPago(): Promise<MockMp> {
  const state: Omit<MockMp, "baseUrl" | "close"> = {
    payments: new Map(),
    preferences: [],
    refunds: [],
    failPreferences: false,
  };

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (status: number, json: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      };
      if (req.headers.authorization !== "Bearer TEST-access-token") return send(401, { message: "unauthorized" });

      const url = req.url ?? "";
      if (req.method === "POST" && url === "/checkout/preferences") {
        if (state.failPreferences) return send(500, { message: "boom" });
        const parsed = JSON.parse(body || "{}");
        state.preferences.push(parsed);
        const id = `pref-${state.preferences.length}`;
        return send(201, { id, init_point: `https://mp.test/checkout/${id}` });
      }
      const refundMatch = url.match(/^\/v1\/payments\/(\d+)\/refunds$/);
      if (req.method === "POST" && refundMatch) {
        const payment = state.payments.get(refundMatch[1]);
        if (!payment) return send(404, { message: "not found" });
        state.refunds.push(refundMatch[1]);
        payment.status = "refunded";
        payment.transaction_amount_refunded = payment.transaction_amount;
        return send(201, { id: 1 });
      }
      const getMatch = url.match(/^\/v1\/payments\/(\d+)$/);
      if (req.method === "GET" && getMatch) {
        const payment = state.payments.get(getMatch[1]);
        return payment ? send(200, payment) : send(404, { message: "not found" });
      }
      send(404, { message: "route not found" });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  process.env.MERCADOPAGO_API_BASE = baseUrl;

  return Object.assign(state, {
    baseUrl,
    close: () =>
      new Promise<void>((resolve) => {
        delete process.env.MERCADOPAGO_API_BASE;
        server.close(() => resolve());
      }),
  });
}

/** Monta uma notificação de webhook assinada exatamente como o Mercado Pago faz. */
export function signedWebhook(
  paymentId: string,
  options: { secret?: string; requestId?: string; ts?: string; type?: string; tamper?: boolean } = {},
): { headers: Headers; url: URL } {
  const secret = options.secret ?? "test-webhook-secret";
  const requestId = options.requestId ?? randomUUID();
  const ts = options.ts ?? String(Date.now());
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");

  const url = new URL("http://localhost:3000/api/webhooks/mercadopago");
  url.searchParams.set("data.id", options.tamper ? `${paymentId}9` : paymentId);
  url.searchParams.set("type", options.type ?? "payment");

  return {
    url,
    headers: new Headers({ "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId }),
  };
}

/* -------------------- Servidor PayPal simulado -------------------- */

export type MockPpOrder = {
  id: string;
  status: "CREATED" | "APPROVED" | "COMPLETED" | "VOIDED";
  custom_id: string;
  amount: string;
  request: Record<string, any>;
  capture?: { id: string; status: string; amount: string; refunded: string };
};

export type MockPp = {
  baseUrl: string;
  orders: Map<string, MockPpOrder>;
  tokenCalls: number;
  captureCalls: number;
  failCreate: boolean;
  /** O cliente "aprova" a order no site do PayPal. */
  approve(id: string): void;
  close(): Promise<void>;
};

/**
 * Imita os endpoints do PayPal usados pela loja (token, orders v2, captura, reembolso, verificação de assinatura).
 * Serve APENAS para testes automatizados: NÃO prova que a integração funciona com o PayPal real.
 */
export async function startMockPayPal(): Promise<MockPp> {
  const state = { orders: new Map<string, MockPpOrder>(), tokenCalls: 0, captureCalls: 0, failCreate: false };
  let seq = 0;

  const view = (o: MockPpOrder) => ({
    id: o.id,
    status: o.status,
    purchase_units: [
      {
        custom_id: o.custom_id,
        amount: { currency_code: "BRL", value: o.amount },
        payments: o.capture
          ? {
              captures: [{ id: o.capture.id, status: o.capture.refunded === o.capture.amount ? "REFUNDED" : o.capture.status, amount: { currency_code: "BRL", value: o.capture.amount } }],
              refunds: Number(o.capture.refunded) > 0 ? [{ id: `RF-${o.id}`, status: "COMPLETED", amount: { currency_code: "BRL", value: o.capture.refunded } }] : [],
            }
          : undefined,
      },
    ],
    links: [{ rel: "payer-action", href: `https://paypal.test/approve/${o.id}` }],
  });

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (status: number, json: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      };
      const url = req.url ?? "";
      if (req.method === "POST" && url === "/v1/oauth2/token") {
        const expected = `Basic ${Buffer.from("test-client-id:test-client-secret").toString("base64")}`;
        if (req.headers.authorization !== expected) return send(401, { error: "invalid_client" });
        state.tokenCalls++;
        return send(200, { access_token: "tok-test", expires_in: 3600 });
      }
      if (req.headers.authorization !== "Bearer tok-test") return send(401, { name: "AUTHENTICATION_FAILURE" });

      if (req.method === "POST" && url === "/v2/checkout/orders") {
        if (state.failCreate) return send(500, { name: "INTERNAL_SERVER_ERROR" });
        const parsed = JSON.parse(body || "{}");
        const unit = parsed.purchase_units?.[0] ?? {};
        const o: MockPpOrder = { id: `PP-ORDER-${++seq}`, status: "CREATED", custom_id: unit.custom_id, amount: unit.amount?.value, request: parsed };
        state.orders.set(o.id, o);
        return send(201, view(o));
      }
      const orderMatch = url.match(/^\/v2\/checkout\/orders\/([^/]+)(\/capture)?$/);
      if (orderMatch) {
        const o = state.orders.get(orderMatch[1]);
        if (!o) return send(404, { name: "RESOURCE_NOT_FOUND" });
        if (req.method === "GET" && !orderMatch[2]) return send(200, view(o));
        if (req.method === "POST" && orderMatch[2]) {
          state.captureCalls++;
          if (o.status === "COMPLETED") return send(422, { details: [{ issue: "ORDER_ALREADY_CAPTURED" }] });
          if (o.status !== "APPROVED") return send(422, { details: [{ issue: "ORDER_NOT_APPROVED" }] });
          o.status = "COMPLETED";
          o.capture = { id: `CAP-${o.id}`, status: "COMPLETED", amount: o.amount, refunded: "0.00" };
          return send(201, view(o));
        }
      }
      const refundMatch = url.match(/^\/v2\/payments\/captures\/([^/]+)\/refund$/);
      if (req.method === "POST" && refundMatch) {
        const o = [...state.orders.values()].find((x) => x.capture?.id === refundMatch[1]);
        if (!o?.capture) return send(404, { name: "RESOURCE_NOT_FOUND" });
        const amount = JSON.parse(body || "{}").amount?.value ?? o.capture.amount;
        o.capture.refunded = amount;
        return send(201, { id: `RF-${o.id}`, status: "COMPLETED" });
      }
      const capMatch = url.match(/^\/v2\/payments\/captures\/([^/]+)$/);
      if (req.method === "GET" && capMatch) {
        const o = [...state.orders.values()].find((x) => x.capture?.id === capMatch[1]);
        return o ? send(200, { id: capMatch[1], supplementary_data: { related_ids: { order_id: o.id } } }) : send(404, { name: "RESOURCE_NOT_FOUND" });
      }
      if (req.method === "POST" && url === "/v1/notifications/verify-webhook-signature") {
        const p = JSON.parse(body || "{}");
        const ok = p.webhook_id === "WH-TEST" && p.transmission_sig === "assinatura-valida";
        return send(200, { verification_status: ok ? "SUCCESS" : "FAILURE" });
      }
      send(404, { name: "ROUTE_NOT_FOUND" });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.PAYPAL_API_BASE = baseUrl;
  process.env.PAYMENT_PROVIDER = "paypal";

  return Object.assign(state, {
    baseUrl,
    approve(id: string) {
      const o = state.orders.get(id);
      if (o && o.status === "CREATED") o.status = "APPROVED";
    },
    close: () =>
      new Promise<void>((resolve) => {
        delete process.env.PAYPAL_API_BASE;
        process.env.PAYMENT_PROVIDER = "mercadopago";
        server.close(() => resolve());
      }),
  });
}

/** Monta uma notificação do PayPal (a verificação é feita pela API simulada: "assinatura-valida" passa, qualquer outra falha). */
export function paypalWebhook(
  eventType: string,
  resource: Record<string, unknown>,
  options: { signature?: string; omitHeaders?: boolean; certUrl?: string } = {},
): { headers: Headers; url: URL; body: string } {
  const headers = new Headers();
  if (!options.omitHeaders) {
    headers.set("paypal-auth-algo", "SHA256withRSA");
    headers.set("paypal-cert-url", options.certUrl ?? "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1");
    headers.set("paypal-transmission-id", randomUUID());
    headers.set("paypal-transmission-sig", options.signature ?? "assinatura-valida");
    headers.set("paypal-transmission-time", new Date().toISOString());
  }
  return { headers, url: new URL("http://localhost:3000/api/webhooks/paypal"), body: JSON.stringify({ id: `WH-${randomUUID()}`, event_type: eventType, resource }) };
}
