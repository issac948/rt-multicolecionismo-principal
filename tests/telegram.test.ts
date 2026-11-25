import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyOwner, telegramConfigured } from "@/server/notify";
import { applyProviderPayment } from "@/server/services/payments";
import { addToCart, getOrCreateUserCart } from "@/server/services/cart";
import { createOrderFromCart } from "@/server/services/orders";
import { createAddress, createTestProduct, createUser, resetDb } from "./helpers";

const ENV = { TELEGRAM_BOT_TOKEN: "123456789:ABCdefGhIJKlmNoPQRsTUVwxyz0123456789", TELEGRAM_CHAT_ID: "42" };

describe("notifyOwner", () => {
  it("sem as variáveis não faz nada nem chama a rede", async () => {
    const fetchImpl = vi.fn();
    expect(telegramConfigured({})).toBe(false);
    expect(await notifyOwner("oi", { env: {}, fetchImpl })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("envia ao Telegram e devolve true; erro de rede devolve false sem vazar o token no log", async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true });
    expect(await notifyOwner("Pedido pago", { env: ENV, fetchImpl: ok as unknown as typeof fetch })).toBe(true);
    const [url, init] = ok.mock.calls[0];
    expect(String(url)).toContain("/sendMessage");
    expect(JSON.parse(String(init.body))).toMatchObject({ chat_id: "42", text: "Pedido pago" });

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fail = vi.fn().mockRejectedValue(new Error(`falhou ${ENV.TELEGRAM_BOT_TOKEN}`));
    expect(await notifyOwner("x", { env: ENV, fetchImpl: fail as unknown as typeof fetch })).toBe(false);
    expect(JSON.stringify(log.mock.calls)).not.toContain(ENV.TELEGRAM_BOT_TOKEN);
    log.mockRestore();
  });
});

describe("aviso de pedido pago", () => {
  let server: http.Server;
  let received: string[] = [];
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push(`${req.url}|${body}`);
        res.setHeader("Content-Type", "application/json");
        res.end('{"ok":true}');
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(async () => {
    await resetDb();
    received = [];
    vi.stubEnv("TELEGRAM_BOT_TOKEN", ENV.TELEGRAM_BOT_TOKEN);
    vi.stubEnv("TELEGRAM_CHAT_ID", ENV.TELEGRAM_CHAT_ID);
    vi.stubEnv("TELEGRAM_API_BASE", `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("avisa uma vez quando o pagamento é aprovado, sem dados do cliente", async () => {
    const product = await createTestProduct({ priceCents: 10000, stock: 5 });
    const user = await createUser({ name: "Maria Segredo da Silva" });
    const address = await createAddress(user.id);
    const cartId = await getOrCreateUserCart(user.id);
    await addToCart(cartId, product.id, 1);
    const order = await createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "ENTREGA", note: null });
    const pp = { provider: "mercadopago", providerPaymentId: "9001", orderId: order.id, status: "APROVADO" as const, rawStatus: "approved", statusDetail: null, method: "pix", amountCents: order.totalCents, refundedCents: 0 };
    expect((await applyProviderPayment(pp)).outcome).toBe("paid");
    expect((await applyProviderPayment(pp)).outcome).toBe("already_paid");
    expect(received).toHaveLength(1);
    expect(received[0]).toContain(`Pedido #${order.number} PAGO`);
    expect(received[0]).not.toContain("Maria");
    expect(received[0]).not.toContain("@");
  });
});
