import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { count, eq } from "drizzle-orm";

/**
 * Frete por CEP (SuperFrete) — tudo aqui roda contra uma SuperFrete SIMULADA (abaixo).
 * Isso prova a lógica da loja (montagem do pacote, leitura da resposta, reserva, recálculo no servidor),
 * mas NÃO prova que a SuperFrete real aceita exatamente estes campos: isso só se confirma com o token real
 * (botão "Testar frete" no painel).
 */
const browser = vi.hoisted(() => ({ session: null as string | null, cart: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (name === "loja_session" && browser.session) return { name, value: browser.session };
      if (name === "loja_cart" && browser.cart) return { name, value: browser.cart };
      return undefined;
    },
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { POST as freteRoute } from "@/app/api/frete/route";
import { deliveryLines } from "@/components/shop/delivery-info";
import { answerIsGrounded } from "@/server/ai/shop-assistant";
import { saveSettingsAction, testShippingAction } from "@/server/actions/admin";
import { createSession } from "@/server/auth/session";
import { orders, products, settings } from "@/server/db/schema";
import { BusinessRuleError, ValidationError } from "@/server/errors";
import { clearAllRateLimits } from "@/server/security/rate-limit";
import { addToCart, createGuestCart, getOrCreateUserCart } from "@/server/services/cart";
import { createOrderFromCart } from "@/server/services/orders";
import { defaultSettings, saveSettings, type StoreSettings } from "@/server/services/settings";
import { getShippingOptions, getShippingQuote, resolveShippingOption } from "@/server/shipping";
import { buildPackage } from "@/server/shipping/package";
import {
  SUPERFRETE_SERVICES,
  ShippingServiceError,
  SuperFreteShippingProvider,
  calculateSuperFrete,
  clearShippingQuoteCache,
  formatEstimate,
  parseSuperFreteResponse,
} from "@/server/shipping/superfrete";
import type { ShippingQuoteInput } from "@/server/shipping/types";
import { createAddress, createAdmin, createTestProduct, createUser, db, resetDb, testSettings } from "./helpers";

/* ------------------------------ SuperFrete simulada ------------------------------ */

type Call = { headers: http.IncomingHttpHeaders; body: any };
type Mode = "ok" | "http500" | "badjson" | "empty" | "slow" | "naoLista";
const mock = { calls: [] as Call[], mode: "ok" as Mode, baseUrl: "", close: async () => {} };

const OK_RESPONSE = [
  { id: 1, name: "PAC", price: 22.5, delivery_time: 6, delivery_range: { min: 5, max: 6 }, company: { id: 1, name: "Correios" } },
  { id: 2, name: "SEDEX", price: "35,90", delivery_time: 2, delivery_range: { min: 1, max: 2 } },
  { id: 17, name: "Mini Envios", has_error: true, error: "Dimensões acima do limite do serviço" },
];

beforeAll(async () => {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const send = (status: number, payload: string, type = "application/json") => {
        res.writeHead(status, { "Content-Type": type });
        res.end(payload);
      };
      if (req.method !== "POST" || req.url !== "/api/v0/calculator") return send(404, "{}");
      if (req.headers.authorization !== "Bearer sf-test-token") return send(401, JSON.stringify({ message: "Token inválido" }));
      mock.calls.push({ headers: req.headers, body: raw ? JSON.parse(raw) : {} });
      switch (mock.mode) {
        case "http500":
          return send(500, JSON.stringify({ message: "boom" }));
        case "badjson":
          return send(200, "<html>não é json</html>", "text/html");
        case "empty":
          return send(200, JSON.stringify([{ id: 1, name: "PAC", has_error: true, error: "CEP sem atendimento" }]));
        case "naoLista":
          return send(200, JSON.stringify({ ok: true }));
        case "slow":
          return void setTimeout(() => send(200, JSON.stringify(OK_RESPONSE)), 2_000);
        default:
          return send(200, JSON.stringify(OK_RESPONSE));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  mock.baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  mock.close = () =>
    new Promise<void>((r) => {
      server.closeAllConnections();
      server.close(() => r());
    });
  Object.assign(process.env, { SUPERFRETE_TOKEN: "sf-test-token", SUPERFRETE_API_BASE: mock.baseUrl, SUPERFRETE_TIMEOUT_MS: "500" });
});

afterAll(async () => {
  await mock.close();
  for (const key of ["SUPERFRETE_TOKEN", "SUPERFRETE_API_BASE", "SUPERFRETE_TIMEOUT_MS"]) delete process.env[key];
});

beforeEach(async () => {
  await resetDb();
  clearAllRateLimits();
  clearShippingQuoteCache();
  mock.calls.length = 0;
  mock.mode = "ok";
  browser.session = null;
  browser.cart = null;
});

/* ------------------------------ auxiliares ------------------------------ */

type Shipping = StoreSettings["shipping"];

/** Configurações com frete calculado: sai do CEP 80010-000, sem valor de reserva (flatRate 0) salvo se informado. */
function calcSettings(over: Partial<Shipping> = {}): StoreSettings {
  const base = testSettings();
  return {
    ...base,
    shipping: {
      ...base.shipping,
      mode: "calculated",
      flatRateCents: 0,
      estimate: "",
      origin: { ...base.shipping.origin, cep: "80010000", city: "Curitiba", state: "PR" },
      ...over,
    },
  };
}

const ITEM = { productId: "p1", quantity: 1, weightGrams: null, lengthCm: null, widthCm: null, heightCm: null };
function quoteInput(over: Partial<ShippingQuoteInput> = {}): ShippingQuoteInput {
  return { subtotalCents: 10_000, destinationCep: "01310100", items: [ITEM], ...over };
}

async function cartWith(price = 10_000, stock = 5) {
  const product = await createTestProduct({ stock, priceCents: price });
  const user = await createUser();
  const address = await createAddress(user.id);
  const cartId = await getOrCreateUserCart(user.id);
  await addToCart(cartId, product.id, 1);
  return { product, user, address, cartId };
}

/* ------------------------------ pacote ------------------------------ */

describe("pacote do pedido", () => {
  const s = defaultSettings();

  it("produto sem peso e medidas usa o padrão do painel e respeita o mínimo dos Correios", () => {
    const r = buildPackage([ITEM], s);
    expect(r).toEqual({ ok: true, package: { weightGrams: 100, lengthCm: 16, widthCm: 11, heightCm: 3 } });
  });

  it("empilha os itens: pesos e alturas somam; comprimento e largura são os maiores", () => {
    const r = buildPackage(
      [
        { ...ITEM, quantity: 2 },
        { productId: "p2", quantity: 1, weightGrams: 250, lengthCm: 20, widthCm: 15, heightCm: 4 },
      ],
      s,
    );
    expect(r).toEqual({ ok: true, package: { weightGrams: 450, lengthCm: 20, widthCm: 15, heightCm: 10 } });
  });

  it("deita cada item pela menor medida (3 x 11 x 16 vira 16 x 11 x 3)", () => {
    const r = buildPackage([{ ...ITEM, lengthCm: 3, widthCm: 11, heightCm: 16 }], s);
    expect(r).toMatchObject({ ok: true, package: { lengthCm: 16, widthCm: 11, heightCm: 3 } });
  });

  it("medida menor que o mínimo dos Correios sobe para 16 x 11 x 2", () => {
    const r = buildPackage([{ ...ITEM, lengthCm: 5, widthCm: 4, heightCm: 1 }], s);
    expect(r).toMatchObject({ ok: true, package: { lengthCm: 16, widthCm: 11, heightCm: 2 } });
  });

  it("pedido grande demais para um volume não é cotado", () => {
    const r = buildPackage([{ ...ITEM, quantity: 99, weightGrams: 400 }, { ...ITEM, productId: "p2", quantity: 99, heightCm: 20 }], s);
    expect(r.ok).toBe(false);
  });
});

/* ------------------------------ leitura da resposta ------------------------------ */

describe("leitura da resposta da SuperFrete", () => {
  it("aceita preço em número ou texto com vírgula e acha o serviço por id ou por nome", () => {
    const quotes = parseSuperFreteResponse(
      [
        { id: 2, name: "qualquer", price: "1.234,56", delivery_range: { min: 2, max: 3 } },
        { name: "PAC", price: 20, delivery_time: 7 },
      ],
      SUPERFRETE_SERVICES,
    );
    expect(quotes).toEqual([
      { code: "SEDEX", label: "SEDEX", priceCents: 123456, minDays: 2, maxDays: 3 },
      { code: "PAC", label: "PAC", priceCents: 2000, minDays: 7, maxDays: 7 },
    ]);
  });

  it("ignora serviços com erro, sem preço válido ou que a loja não oferece", () => {
    const quotes = parseSuperFreteResponse(
      [
        { id: 1, name: "PAC", price: 0 },
        { id: 2, name: "SEDEX", price: 30, has_error: true },
        { id: 17, name: "Mini Envios", price: 12, error: "fora do limite" },
        { id: 3, name: "Jadlog", price: 19 },
        { id: 1, name: "PAC", price: 25, delivery_time: 5 },
      ],
      SUPERFRETE_SERVICES.filter((s) => s.code !== "MINI"),
    );
    expect(quotes.map((q) => [q.code, q.priceCents])).toEqual([["PAC", 2500]]);
  });

  it("aceita a lista dentro de `data` e fica com o menor preço quando o serviço se repete", () => {
    const quotes = parseSuperFreteResponse({ data: [{ id: 1, price: 30 }, { id: 1, price: 24.9 }] }, SUPERFRETE_SERVICES);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].priceCents).toBe(2490);
  });

  it("resposta fora do formato ou sem nenhum serviço útil vira erro (nunca um preço inventado)", () => {
    expect(() => parseSuperFreteResponse({ ok: true }, SUPERFRETE_SERVICES)).toThrow(ShippingServiceError);
    expect(() => parseSuperFreteResponse([{ id: 1, has_error: true }], SUPERFRETE_SERVICES)).toThrow(/nenhum serviço/);
    expect(() => parseSuperFreteResponse("texto", SUPERFRETE_SERVICES)).toThrow(ShippingServiceError);
  });

  it("monta o prazo com os dias de postagem", () => {
    expect(formatEstimate(5, 6, 0)).toBe("5 a 6 dias úteis");
    expect(formatEstimate(2, 2, 1)).toBe("3 dias úteis");
    expect(formatEstimate(0, 0, 1)).toBe("1 dia útil");
    expect(formatEstimate(null, null, 0)).toBeNull();
  });
});

/* ------------------------------ provedor ------------------------------ */

describe("frete calculado pela SuperFrete", () => {
  const provider = new SuperFreteShippingProvider();

  it("envia origem, destino, serviços e pacote; o token vai só no cabeçalho", async () => {
    const settings = calcSettings();
    await provider.quote(quoteInput(), settings);

    expect(mock.calls).toHaveLength(1);
    const { headers, body } = mock.calls[0];
    expect(headers.authorization).toBe("Bearer sf-test-token");
    expect(headers["user-agent"]).toContain(settings.storeName);
    expect(JSON.stringify(body)).not.toContain("sf-test-token");
    expect(body.from).toEqual({ postal_code: "80010000" });
    expect(body.to).toEqual({ postal_code: "01310100" });
    expect(body.services).toBe("2,1"); // SEDEX e PAC (Mini Envios desligado por padrão)
    expect(body.package).toEqual({ height: 3, width: 11, length: 16, weight: 0.1 });
    expect(body.options.use_insurance_value).toBe(false);
  });

  it("nome da loja com emoji, travessão, acento ou quebra de linha não derruba a consulta (User-Agent só com ASCII)", async () => {
    const settings = { ...calcSettings(), storeName: "Loja do Zé — Miniaturas 🚗\nTeste" };
    const r = await provider.quote(quoteInput(), settings);
    expect(r.source).toBe("superfrete");
    expect(r.options.length).toBeGreaterThan(0);
    const ua = String(mock.calls[0].headers["user-agent"]);
    expect(ua).toMatch(/^[\x20-\x7E]+$/);
    expect(ua).toContain("Loja do Ze");
  });

  it("token com caracteres inválidos (aspas curvas, acento) vira aviso claro, sem chamar a SuperFrete", async () => {
    const saved = process.env.SUPERFRETE_TOKEN;
    process.env.SUPERFRETE_TOKEN = "sf-\u201Ctoken\u201D";
    try {
      await expect(calculateSuperFrete({ originCep: "80010000", destinationCep: "01310100", pkg: { weightGrams: 100, lengthCm: 16, widthCm: 11, heightCm: 3 }, services: [SUPERFRETE_SERVICES[0]], insuranceCents: null, appLabel: "Loja" })).rejects.toThrow(/caracteres inv/);
      expect(mock.calls).toHaveLength(0);
    } finally {
      process.env.SUPERFRETE_TOKEN = saved;
    }
  });

  it("devolve as opções por preço, com prazo, e a retirada em mãos quando ligada", async () => {
    const r = await provider.quote(quoteInput(), calcSettings({ pickupEnabled: true }));
    expect(r.source).toBe("superfrete");
    expect(r.notice).toBeNull();
    expect(r.options.map((o) => [o.code, o.label, o.priceCents, o.estimate, o.requiresAddress])).toEqual([
      ["PAC", "PAC", 2250, "5 a 6 dias úteis", true],
      ["SEDEX", "SEDEX", 3590, "1 a 2 dias úteis", true],
      ["RETIRADA", "Retirada em mãos", 0, "Combine a retirada após a confirmação do pagamento", false],
    ]);
  });

  it("soma o acréscimo de embalagem ao frete e os dias de postagem ao prazo", async () => {
    const r = await provider.quote(quoteInput(), calcSettings({ handlingCents: 300, postingDays: 2 }));
    expect(r.options.map((o) => [o.code, o.priceCents, o.estimate])).toEqual([
      ["PAC", 2550, "7 a 8 dias úteis"],
      ["SEDEX", 3890, "3 a 4 dias úteis"],
    ]);
  });

  it("frete grátis a partir de um valor vale para a opção mais barata", async () => {
    const abaixo = await provider.quote(quoteInput({ subtotalCents: 9_999 }), calcSettings({ freeAboveCents: 10_000 }));
    expect(abaixo.options.map((o) => o.priceCents)).toEqual([2250, 3590]);
    const acima = await provider.quote(quoteInput({ subtotalCents: 10_000 }), calcSettings({ freeAboveCents: 10_000 }));
    expect(acima.options.map((o) => [o.code, o.priceCents])).toEqual([["PAC", 0], ["SEDEX", 3590]]);
    expect(acima.options[0].description).toMatch(/grátis/i);
  });

  it("sem CEP de destino pede o CEP e não consulta a SuperFrete", async () => {
    const r = await provider.quote(quoteInput({ destinationCep: null }), calcSettings({ pickupEnabled: true }));
    expect(r.needsCep).toBe(true);
    expect(r.options.map((o) => o.code)).toEqual(["RETIRADA"]);
    expect(mock.calls).toHaveLength(0);
  });

  it("declarar valor manda o seguro; mini envios só vai se estiver marcado", async () => {
    await provider.quote(quoteInput({ subtotalCents: 15_050 }), calcSettings({ declareValue: true, services: { sedex: false, pac: false, mini: true } }));
    const { body } = mock.calls[0];
    expect(body.services).toBe("17");
    expect(body.options).toMatchObject({ insurance_value: 150.5, use_insurance_value: true });
  });

  it("cotações iguais são reaproveitadas (cache); CEP ou pacote diferente consulta de novo", async () => {
    const settings = calcSettings();
    await provider.quote(quoteInput(), settings);
    await provider.quote(quoteInput(), settings);
    expect(mock.calls).toHaveLength(1);
    await provider.quote(quoteInput({ destinationCep: "20040020" }), settings);
    expect(mock.calls).toHaveLength(2);
    await provider.quote(quoteInput({ items: [{ ...ITEM, quantity: 3 }] }), settings);
    expect(mock.calls).toHaveLength(3);
  });

  it("serviço fora do ar: usa o valor fixo de reserva e avisa", async () => {
    mock.mode = "http500";
    const r = await provider.quote(quoteInput(), calcSettings({ flatRateCents: 3000, estimate: "3 a 7 dias úteis" }));
    expect(r.source).toBe("fallback");
    expect(r.notice).toMatch(/valor padrão/i);
    expect(r.options.map((o) => [o.code, o.priceCents, o.estimate])).toEqual([["ENTREGA", 3000, "3 a 7 dias úteis"]]);
  });

  it("sem valor de reserva (0) a falha NÃO vira frete grátis: não há entrega e o cliente é orientado", async () => {
    mock.mode = "http500";
    const r = await provider.quote(quoteInput(), calcSettings({ flatRateCents: 0, pickupEnabled: true }));
    expect(r.source).toBe("none");
    expect(r.notice).toMatch(/fale com a loja/i);
    expect(r.options.map((o) => o.code)).toEqual(["RETIRADA"]);
  });

  it.each<[Mode]>([["badjson"], ["empty"], ["naoLista"]])("resposta estranha (%s) vira falha controlada, não preço", async (mode) => {
    mock.mode = mode;
    const r = await provider.quote(quoteInput(), calcSettings({ flatRateCents: 2500 }));
    expect(r.source).toBe("fallback");
    expect(r.options.map((o) => o.priceCents)).toEqual([2500]);
  });

  it("SuperFrete lenta demais (timeout) cai na reserva", async () => {
    mock.mode = "slow";
    const started = Date.now();
    const r = await provider.quote(quoteInput(), calcSettings({ flatRateCents: 2500 }));
    expect(Date.now() - started).toBeLessThan(1_800);
    expect(r.source).toBe("fallback");
  });

  it("token ausente no servidor: não chama ninguém e usa a reserva", async () => {
    const token = process.env.SUPERFRETE_TOKEN;
    delete process.env.SUPERFRETE_TOKEN;
    try {
      const r = await provider.quote(quoteInput(), calcSettings({ flatRateCents: 2500 }));
      expect(mock.calls).toHaveLength(0);
      expect(r.source).toBe("fallback");
    } finally {
      process.env.SUPERFRETE_TOKEN = token;
    }
  });

  it("token errado: a SuperFrete recusa (401) e a loja usa a reserva", async () => {
    process.env.SUPERFRETE_TOKEN = "token-errado";
    try {
      const r = await provider.quote(quoteInput(), calcSettings({ flatRateCents: 2500 }));
      expect(r.source).toBe("fallback");
    } finally {
      process.env.SUPERFRETE_TOKEN = "sf-test-token";
    }
  });

  it("sem CEP de origem configurado cai na reserva sem consultar", async () => {
    const r = await provider.quote(quoteInput(), calcSettings({ flatRateCents: 2500, origin: { ...defaultSettings().shipping.origin, cep: "" } }));
    expect(mock.calls).toHaveLength(0);
    expect(r.source).toBe("fallback");
  });

  it("pedido grande demais não é cotado e não cai na reserva (ela não cobriria)", async () => {
    const r = await provider.quote(quoteInput({ items: [{ ...ITEM, quantity: 99, heightCm: 30 }] }), calcSettings({ flatRateCents: 2500 }));
    expect(mock.calls).toHaveLength(0);
    expect(r.options).toEqual([]);
    expect(r.notice).toMatch(/grande demais/i);
  });

  it("com o frete em valor fixo nada é consultado (padrão da loja)", async () => {
    await saveSettings(testSettings());
    const quote = await getShippingQuote(quoteInput());
    expect(quote.source).toBe("flat");
    expect(quote.options.map((o) => [o.code, o.priceCents])).toEqual([["ENTREGA", 3000]]);
    expect(mock.calls).toHaveLength(0);
  });
});

/* ------------------------------ pedido ------------------------------ */

describe("pedido com frete calculado: o servidor recalcula e cobra o valor dele", () => {
  async function useCalculated(over: Partial<Shipping> = {}) {
    await saveSettings(calcSettings(over));
  }

  it("o pedido guarda o serviço escolhido e o frete da SuperFrete (mais o acréscimo)", async () => {
    await useCalculated({ handlingCents: 200 });
    const { cartId, user, address } = await cartWith();
    const order = await createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "SEDEX", note: null });
    expect(order.shippingMethodCode).toBe("SEDEX");
    expect(order.shippingMethodLabel).toBe("SEDEX");
    expect(order.shippingEstimate).toBe("1 a 2 dias úteis");
    expect(order.shippingCents).toBe(3790);
    expect(order.totalCents).toBe(10_000 + 3790);
    expect(mock.calls).toHaveLength(1); // cotou uma vez só, antes de travar o estoque
  });

  it("o valor que a pessoa viu na tela é conferido: se mudou, o pedido NÃO é criado e o estoque não mexe", async () => {
    await useCalculated();
    const { cartId, user, address, product } = await cartWith();
    const attempt = createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "PAC", expectedShippingCents: 100, note: null });
    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toThrow(/frete foi atualizado para R\$\s*22,50/);
    expect((await db.select({ n: count() }).from(orders))[0].n).toBe(0);
    expect((await db.select().from(products).where(eq(products.id, product.id)))[0].stock).toBe(5);

    const ok = await createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "PAC", expectedShippingCents: 2250, note: null });
    expect(ok.shippingCents).toBe(2250);
  });

  it("serviço que não foi cotado para este pedido é recusado", async () => {
    await useCalculated();
    const { cartId, user, address } = await cartWith();
    await expect(createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "MINI", note: null })).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "ENTREGA", note: null })).rejects.toThrow(/indisponível/i);
  });

  it("entrega sem endereço é recusada (precisa do CEP)", async () => {
    await useCalculated();
    const { cartId, user } = await cartWith();
    await expect(createOrderFromCart({ userId: user.id, cartId, addressId: null, shippingCode: "SEDEX", note: null })).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("SuperFrete fora do ar na hora do pedido: com reserva o pedido usa 'Entrega' pelo valor fixo", async () => {
    await useCalculated({ flatRateCents: 3000, estimate: "3 a 7 dias úteis" });
    mock.mode = "http500";
    const { cartId, user, address } = await cartWith();
    const order = await createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "ENTREGA", note: null });
    expect(order.shippingCents).toBe(3000);
    expect(order.shippingMethodCode).toBe("ENTREGA");
  });

  it("retirada em mãos não precisa de CEP nem consulta a SuperFrete", async () => {
    await useCalculated({ pickupEnabled: true });
    const { cartId, user } = await cartWith();
    const order = await createOrderFromCart({ userId: user.id, cartId, addressId: null, shippingCode: "RETIRADA", note: null });
    expect(order.shippingCents).toBe(0);
    expect(order.shippingAddress).toBeNull();
    expect(mock.calls).toHaveLength(0);
  });

  it("usa o peso e as medidas cadastrados no produto", async () => {
    await useCalculated();
    const product = await createTestProduct({ stock: 5, weightGrams: 400, lengthCm: 25, widthCm: 20, heightCm: 6 });
    const user = await createUser();
    const address = await createAddress(user.id);
    const cartId = await getOrCreateUserCart(user.id);
    await addToCart(cartId, product.id, 2);
    await createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "PAC", note: null });
    expect(mock.calls[0].body.package).toEqual({ height: 12, width: 20, length: 25, weight: 0.8 });
  });

  it("resolveShippingOption e getShippingOptions seguem as configurações salvas", async () => {
    await useCalculated();
    const options = await getShippingOptions(quoteInput());
    expect(options.map((o) => o.code)).toEqual(["PAC", "SEDEX"]);
    expect((await resolveShippingOption("SEDEX", quoteInput())).priceCents).toBe(3590);
  });
});

/* ------------------------------ rota /api/frete ------------------------------ */

describe("rota /api/frete (cotação por CEP no carrinho)", () => {
  const call = (cep: unknown, headers: Record<string, string> = { origin: "http://localhost:3000" }) =>
    freteRoute(new Request("http://localhost:3000/api/frete", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ cep }) }));

  async function loggedCart() {
    const { user } = await cartWith();
    browser.session = (await createSession(user.id, user.role)).token;
    return user;
  }

  it("devolve só as opções de entrega do carrinho de quem está logado", async () => {
    await saveSettings(calcSettings({ pickupEnabled: true }));
    await loggedCart();
    const response = await call("01310-100");
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.source).toBe("superfrete");
    expect(json.options.map((o: any) => [o.code, o.priceCents])).toEqual([["PAC", 2250], ["SEDEX", 3590]]);
  });

  it("funciona para visitante (carrinho do cookie), sem login", async () => {
    await saveSettings(calcSettings());
    const product = await createTestProduct({ stock: 3 });
    browser.cart = await createGuestCart();
    await addToCart(browser.cart, product.id, 1);
    const response = await call("01310100");
    expect(response.status).toBe(200);
    expect((await response.json()).options).toHaveLength(2);
  });

  it("recusa requisição de outro site, CEP inválido e carrinho vazio", async () => {
    await saveSettings(calcSettings());
    expect((await call("01310100", { origin: "https://outro-site.example" })).status).toBe(403);
    expect((await call("01310100", {})).status).toBe(403);
    await loggedCart();
    expect((await call("123")).status).toBe(400);
    expect((await call(12345678)).status).toBe(400);
    browser.session = null;
    expect((await call("01310100")).status).toBe(409);
  });

  it("limita consultas repetidas do mesmo carrinho", async () => {
    await saveSettings(calcSettings());
    await loggedCart();
    let last = 200;
    for (let i = 0; i < 21; i++) last = (await call("01310100")).status;
    expect(last).toBe(429);
  });

  it("com a SuperFrete fora do ar e sem reserva devolve a mensagem para o cliente (sem detalhes técnicos)", async () => {
    await saveSettings(calcSettings({ flatRateCents: 0 }));
    mock.mode = "http500";
    await loggedCart();
    const json = await (await call("01310100")).json();
    expect(json.options).toEqual([]);
    expect(json.notice).toMatch(/fale com a loja/i);
    expect(JSON.stringify(json)).not.toMatch(/boom|500|sf-test-token/);
  });
});

/* ------------------------------ painel ------------------------------ */

describe("painel: configurações do frete calculado", () => {
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };
  const base = { storeName: "RT Multicolecionismo", shippingDeliveryEnabled: "on", payPix: "on", shippingMode: "calculated" };
  const savedShipping = async () => (await db.select().from(settings))[0].value as { shipping: Shipping; shopAssistantEnabled: boolean };

  async function asAdmin() {
    const admin = await createAdmin();
    browser.session = (await createSession(admin.id, admin.role)).token;
  }

  it("frete calculado exige CEP de origem e pelo menos um serviço", async () => {
    await asAdmin();
    const r = await saveSettingsAction({}, form({ ...base }));
    expect(r.ok).not.toBe(true);
    expect(r.errors?.shippingOriginCep).toMatch(/CEP/);
    expect(r.errors?.shippingServiceSedex).toMatch(/serviço/);
  });

  it("salva o endereço de origem, os serviços e os ajustes exatamente como digitados (sem valor fixo, que é só reserva)", async () => {
    await asAdmin();
    const r = await saveSettingsAction(
      {},
      form({
        ...base,
        shippingOriginCep: "80010-000",
        shippingOriginStreet: "Rua Teste",
        shippingOriginNumber: "100",
        shippingOriginComplement: "Sala 2",
        shippingOriginNeighborhood: "Centro",
        shippingOriginCity: "Curitiba",
        shippingOriginState: "pr",
        shippingServiceSedex: "on",
        shippingServicePac: "on",
        shippingHandling: "2,50",
        shippingPostingDays: "2",
        shippingDeclareValue: "on",
        shippingItemWeight: "80",
        shippingItemLength: "17",
        shippingItemWidth: "12",
        shippingItemHeight: "4",
        shopAssistantEnabled: "on",
      }),
    );
    expect(r.ok).toBe(true);
    const saved = await savedShipping();
    expect(saved.shopAssistantEnabled).toBe(true);
    expect(saved.shipping).toMatchObject({
      mode: "calculated",
      origin: { cep: "80010000", street: "Rua Teste", number: "100", complement: "Sala 2", neighborhood: "Centro", city: "Curitiba", state: "PR" },
      services: { sedex: true, pac: true, mini: false },
      handlingCents: 250,
      declareValue: true,
      postingDays: 2,
      defaultItem: { weightGrams: 80, lengthCm: 17, widthCm: 12, heightCm: 4 },
      flatRateCents: 0,
    });
  });

  it("valores inválidos aparecem no campo certo", async () => {
    await asAdmin();
    const r = await saveSettingsAction(
      {},
      form({ ...base, shippingOriginCep: "123", shippingServicePac: "on", shippingOriginState: "XX", shippingItemWeight: "abc", shippingItemLength: "0", shippingHandling: "x" }),
    );
    expect(r.ok).not.toBe(true);
    expect(r.errors?.shippingOriginCep).toBeTruthy();
    expect(r.errors?.shippingOriginState).toMatch(/Estado/);
    expect(r.errors?.shippingItemWeight).toMatch(/só números/);
    expect(r.errors?.shippingDefaultItemLengthCm).toMatch(/Medida inválida/);
    expect(r.errors?.shippingHandling).toBeTruthy();
  });

  it("voltar para valor fixo mantém o endereço de origem guardado", async () => {
    await asAdmin();
    const calculated = { ...base, shippingOriginCep: "80010-000", shippingServicePac: "on" };
    expect((await saveSettingsAction({}, form(calculated))).ok).toBe(true);
    const fixed = await saveSettingsAction({}, form({ ...calculated, shippingMode: "fixed", shippingFlatRate: "20,00" }));
    expect(fixed.ok).toBe(true);
    expect((await savedShipping()).shipping).toMatchObject({ mode: "fixed", flatRateCents: 2000, origin: { cep: "80010000" } });
    // e no modo fixo o valor continua obrigatório
    const blank = await saveSettingsAction({}, form({ ...calculated, shippingMode: "fixed", shippingFlatRate: "" }));
    expect(blank.errors?.shippingFlatRate).toMatch(/valor do frete/i);
  });

  it("'Testar frete' consulta a SuperFrete com a origem salva e mostra o resultado", async () => {
    await asAdmin();
    await saveSettings(calcSettings());
    const r = await testShippingAction({}, form({ testCep: "01310-100" }));
    expect(r.ok).toBe(true);
    // O formatador de moeda usa espaço "inseparável" depois do R$: troca por espaço comum só para comparar.
    expect(r.lines?.map((l) => l.replace(/\u00a0/g, " "))).toEqual(["PAC: R$ 22,50 — 5 a 6 dias úteis", "SEDEX: R$ 35,90 — 1 a 2 dias úteis"]);
    expect(mock.calls[0].body.from.postal_code).toBe("80010000");
  });

  it("'Testar frete' mostra o erro real quando a SuperFrete recusa, e nunca usa o cache", async () => {
    await asAdmin();
    await saveSettings(calcSettings());
    process.env.SUPERFRETE_TOKEN = "token-errado";
    try {
      const r = await testShippingAction({}, form({ testCep: "01310100" }));
      expect(r.ok).not.toBe(true);
      expect(r.message).toMatch(/HTTP 401/);
      expect(r.message).toMatch(/Token inválido/);
      expect(r.message).not.toContain("token-errado");
    } finally {
      process.env.SUPERFRETE_TOKEN = "sf-test-token";
    }
    await testShippingAction({}, form({ testCep: "01310100" }));
    await testShippingAction({}, form({ testCep: "01310100" }));
    expect(mock.calls).toHaveLength(2); // sem cache: cada teste vai à SuperFrete
  });

  it("'Testar frete' valida o CEP, exige origem salva e só vale para administrador", async () => {
    await asAdmin();
    expect((await testShippingAction({}, form({ testCep: "12" }))).errors?.testCep).toBeTruthy();
    await saveSettings(testSettings());
    expect((await testShippingAction({}, form({ testCep: "01310100" }))).message).toMatch(/CEP de origem/);

    browser.session = null;
    const anonymous = await testShippingAction({}, form({ testCep: "01310100" }));
    expect(anonymous.ok).not.toBe(true);
    expect(mock.calls).toHaveLength(0);
    const customer = await createUser();
    browser.session = (await createSession(customer.id, customer.role)).token;
    expect((await testShippingAction({}, form({ testCep: "01310100" }))).ok).not.toBe(true);
    expect(mock.calls).toHaveLength(0);
  });
});

describe("frases da loja sobre entrega (vitrine e assistente) no frete pelo CEP", () => {
  it("não mostram o valor fixo de reserva nem 'entrega grátis': dizem que o valor sai pelo CEP", () => {
    const withReserve = calcSettings({ flatRateCents: 3000, estimate: "3 a 7 dias úteis", services: { sedex: true, pac: true, mini: false } });
    const lines = deliveryLines(withReserve).join(" ");
    expect(lines).toMatch(/calculados pelo seu CEP/);
    expect(lines).toMatch(/SEDEX e PAC/);
    expect(lines).not.toMatch(/R\$\s?30/);
    expect(lines).not.toMatch(/3 a 7 dias/);

    const noReserve = deliveryLines(calcSettings({ flatRateCents: 0 })).join(" ");
    expect(noReserve).not.toMatch(/Entrega grátis/i);
    expect(noReserve).toMatch(/calculados pelo seu CEP/);
  });

  it("citam o frete grátis a partir de um valor e só os serviços ligados", () => {
    const lines = deliveryLines(calcSettings({ freeAboveCents: 25000, services: { sedex: false, pac: true, mini: true } })).join(" ");
    expect(lines).toMatch(/\(PAC e Mini Envios\)/);
    expect(lines).not.toMatch(/SEDEX/);
    expect(lines.replace(/\u00a0/g, " ")).toMatch(/a partir de R\$ 250/);
  });

  it("o assistente não pode afirmar o valor de reserva como se fosse o frete (não vem dos dados)", () => {
    const s = calcSettings({ flatRateCents: 3000 });
    expect(answerIsGrounded("O frete é R$ 30,00.", [], deliveryLines(s))).toBe(false);
    expect(answerIsGrounded("O frete é calculado pelo seu CEP no carrinho.", [], deliveryLines(s))).toBe(true);
  });

  it("no valor fixo continua igual (valor e prazo configurados)", () => {
    const fixed = testSettings();
    expect(deliveryLines(fixed).join(" ")).toMatch(/Frete de R\$\s?30/);
    expect(deliveryLines(fixed).join(" ")).not.toMatch(/calculados pelo seu CEP/);
  });
});
