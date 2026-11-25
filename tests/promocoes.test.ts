import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { formatBr, parseBrLocal, toBrLocalInput } from "@/lib/datetime-br";
import { parseProductForm } from "@/lib/forms";
import { liveSalePriceCents, promoPhase } from "@/lib/promotions";
import { priceHistory, products } from "@/server/db/schema";
import { addToCart, getOrCreateUserCart } from "@/server/services/cart";
import { publicHousekeeping, resetHousekeepingGate } from "@/server/services/housekeeping";
import { createOrderFromCart } from "@/server/services/orders";
import { applyScheduledPromotions, getPriceHistorySummary } from "@/server/services/promotions";
import { createAddress, createTestProduct, createUser, db, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  resetHousekeepingGate();
});

const HOUR = 3_600_000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR);
const row = async (id: string) => (await db.select().from(products).where(eq(products.id, id)))[0];
const history = async (id: string) => db.select().from(priceHistory).where(eq(priceHistory.productId, id)).orderBy(priceHistory.createdAt);

describe("datas em horÃ¡rio de BrasÃ­lia", () => {
  it("converte para UTC e volta", () => {
    expect(parseBrLocal("2026-11-27T00:00")?.toISOString()).toBe("2026-11-27T03:00:00.000Z");
    expect(toBrLocalInput(new Date("2026-11-27T03:00:00.000Z"))).toBe("2026-11-27T00:00");
    expect(formatBr(new Date("2026-11-30T02:59:00.000Z"))).toBe("29/11/2026 23:59");
  });
  it("vazio Ã© null; lixo e datas que nÃ£o existem sÃ£o invÃ¡lidos", () => {
    expect(parseBrLocal("")).toBeNull();
    expect(parseBrLocal(undefined)).toBeNull();
    expect(parseBrLocal("27/11/2026")).toBeUndefined();
    expect(parseBrLocal("2026-02-31T10:00")).toBeUndefined();
    expect(toBrLocalInput(null)).toBe("");
  });
});

describe("fase da promoÃ§Ã£o (regra pura)", () => {
  const base = { promoPriceCents: 5000 };
  it("agendada, ativa, encerrada, sem janela e sem promoÃ§Ã£o", () => {
    const now = new Date("2026-11-27T12:00:00Z");
    const d = (s: string) => new Date(s);
    expect(promoPhase({ ...base, saleStartsAt: d("2026-11-28T00:00:00Z"), saleEndsAt: null }, now)).toBe("agendada");
    expect(promoPhase({ ...base, saleStartsAt: d("2026-11-27T00:00:00Z"), saleEndsAt: d("2026-11-28T00:00:00Z") }, now)).toBe("ativa");
    expect(promoPhase({ ...base, saleStartsAt: null, saleEndsAt: d("2026-11-27T12:00:00Z") }, now)).toBe("encerrada");
    expect(promoPhase({ ...base, saleStartsAt: null, saleEndsAt: null }, now)).toBe("ativa");
    expect(promoPhase({ promoPriceCents: null, saleStartsAt: null, saleEndsAt: null }, now)).toBe("nenhuma");
    expect(liveSalePriceCents({ ...base, saleStartsAt: d("2026-11-28T00:00:00Z"), saleEndsAt: null }, now)).toBeNull();
    expect(liveSalePriceCents({ ...base, saleStartsAt: null, saleEndsAt: null }, now)).toBe(5000);
  });
});

describe("promoÃ§Ã£o programada no banco", () => {
  it("promoÃ§Ã£o futura fica guardada mas a loja continua no preÃ§o normal", async () => {
    const p = await createTestProduct({ priceCents: 10000, salePriceCents: 7000, saleStartsAt: inHours(48), saleEndsAt: inHours(72) });
    const r = await row(p.id);
    expect(r.promoPriceCents).toBe(7000);
    expect(r.salePriceCents).toBeNull();
  });

  it("sem datas, a promoÃ§Ã£o vale na hora (como sempre foi)", async () => {
    const p = await createTestProduct({ priceCents: 10000, salePriceCents: 7000 });
    expect((await row(p.id)).salePriceCents).toBe(7000);
  });

  it("liga quando a janela abre e desliga quando fecha, registrando no histÃ³rico", async () => {
    const p = await createTestProduct({ priceCents: 10000, salePriceCents: 7000, saleStartsAt: inHours(24), saleEndsAt: inHours(48) });
    expect(await applyScheduledPromotions()).toEqual({ started: 0, ended: 0 });

    await db.update(products).set({ saleStartsAt: inHours(-1) }).where(eq(products.id, p.id));
    expect(await applyScheduledPromotions()).toEqual({ started: 1, ended: 0 });
    expect((await row(p.id)).salePriceCents).toBe(7000);
    expect(await applyScheduledPromotions()).toEqual({ started: 0, ended: 0 }); // idempotente

    await db.update(products).set({ saleStartsAt: inHours(-3), saleEndsAt: inHours(-1) }).where(eq(products.id, p.id));
    expect(await applyScheduledPromotions()).toEqual({ started: 0, ended: 1 });
    expect((await row(p.id)).salePriceCents).toBeNull();
    expect((await row(p.id)).promoPriceCents).toBe(7000); // configuraÃ§Ã£o fica para o painel mostrar "encerrada"

    expect((await history(p.id)).map((h) => [h.priceCents, h.salePriceCents])).toEqual([
      [10000, null], // cadastro (promoÃ§Ã£o ainda futura)
      [10000, 7000], // promoÃ§Ã£o comeÃ§ou
      [10000, null], // promoÃ§Ã£o terminou
    ]);
  });

  it("promoÃ§Ã£o com inÃ­cio no passado e dados antigos (sem passar pelo painel) tambÃ©m Ã© aplicada", async () => {
    const p = await createTestProduct({ priceCents: 10000 });
    await db.execute(sql`UPDATE products SET promo_price_cents = 6000, sale_starts_at = now() - interval '1 hour' WHERE id = ${p.id}`);
    await publicHousekeeping({ force: true });
    expect((await row(p.id)).salePriceCents).toBe(6000);
  });

  it("o banco recusa promoÃ§Ã£o maior que o preÃ§o e fim antes do inÃ­cio", async () => {
    const p = await createTestProduct({ priceCents: 10000 });
    await expect(db.execute(sql`UPDATE products SET promo_price_cents = 10000 WHERE id = ${p.id}`)).rejects.toThrow();
    await expect(db.execute(sql`UPDATE products SET sale_starts_at = now(), sale_ends_at = now() - interval '1 day' WHERE id = ${p.id}`)).rejects.toThrow();
  });
});

describe("preÃ§o cobrado no pedido", () => {
  async function buy(productId: string) {
    const user = await createUser();
    const address = await createAddress(user.id);
    const cartId = await getOrCreateUserCart(user.id);
    await addToCart(cartId, productId, 1);
    return createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "ENTREGA", note: null });
  }

  it("usa o preÃ§o promocional no segundo em que a promoÃ§Ã£o abre, sem esperar o intervalo de 30 s", async () => {
    const p = await createTestProduct({ priceCents: 10000, stock: 5, active: true });
    await publicHousekeeping({ force: true }); // marca o intervalo
    await db.execute(sql`UPDATE products SET promo_price_cents = 6000, sale_starts_at = now() - interval '1 second' WHERE id = ${p.id}`);
    const order = await buy(p.id);
    expect(order.subtotalCents).toBe(6000);
  });

  it("depois do fim da promoÃ§Ã£o volta ao preÃ§o normal", async () => {
    const p = await createTestProduct({ priceCents: 10000, salePriceCents: 6000, stock: 5, active: true });
    await db.update(products).set({ saleEndsAt: inHours(-1), saleStartsAt: inHours(-5) }).where(eq(products.id, p.id));
    const order = await buy(p.id);
    expect(order.subtotalCents).toBe(10000);
  });
});

describe("histÃ³rico de preÃ§os", () => {
  it("grava no cadastro e em cada mudanÃ§a de preÃ§o, mas nÃ£o em outras ediÃ§Ãµes", async () => {
    const p = await createTestProduct({ priceCents: 10000 });
    await db.update(products).set({ name: "Outro nome" }).where(eq(products.id, p.id));
    expect(await history(p.id)).toHaveLength(1);
    await db.update(products).set({ priceCents: 12000 }).where(eq(products.id, p.id));
    expect((await history(p.id)).map((h) => h.priceCents)).toEqual([10000, 12000]);
  });

  it("avisa quando o preÃ§o normal estÃ¡ registrado hÃ¡ menos de 30 dias e para de avisar depois", async () => {
    const p = await createTestProduct({ priceCents: 10000 });
    let s = await getPriceHistorySummary(p.id);
    expect(s.regularPriceSettled).toBe(false);
    expect(s.days).toBe(0);

    const referenceNow = new Date();
    const fortyFiveDaysAgo = new Date(referenceNow.getTime() - 45 * 86_400_000);
    await db.execute(sql`UPDATE price_history SET created_at = ${fortyFiveDaysAgo} WHERE product_id = ${p.id}`);
    s = await getPriceHistorySummary(p.id, referenceNow);
    expect(s.regularPriceSettled).toBe(true);
    expect(s.days).toBe(45);

    await db.update(products).set({ priceCents: 15000 }).where(eq(products.id, p.id)); // preÃ§o "de" novo: relÃ³gio zera
    s = await getPriceHistorySummary(p.id);
    expect(s.regularPriceSettled).toBe(false);
    expect(s.days).toBe(0);
  });

  it("promoÃ§Ã£o nÃ£o zera o relÃ³gio do preÃ§o normal", async () => {
    const p = await createTestProduct({ priceCents: 10000 });
    await db.execute(sql`UPDATE price_history SET created_at = now() - interval '60 days' WHERE product_id = ${p.id}`);
    await db.update(products).set({ salePriceCents: 8000, promoPriceCents: 8000 }).where(eq(products.id, p.id));
    expect((await getPriceHistorySummary(p.id)).regularPriceSettled).toBe(true);
  });
});

describe("formulÃ¡rio do produto", () => {
  const form = (extra: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ name: "Miniatura X", price: "100,00", stock: "1", salePrice: "70,00", ...extra })) fd.set(k, v);
    return parseProductForm(fd);
  };
  it("lÃª as datas em horÃ¡rio de BrasÃ­lia", () => {
    const r = form({ saleStarts: "2026-11-27T00:00", saleEnds: "2026-11-30T23:59" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.saleStartsAt?.toISOString()).toBe("2026-11-27T03:00:00.000Z");
      expect(r.data.saleEndsAt?.toISOString()).toBe("2026-12-01T02:59:00.000Z");
    }
  });
  it("recusa data invÃ¡lida, fim antes do inÃ­cio e datas sem preÃ§o promocional", () => {
    expect(form({ saleStarts: "ontem" }).ok).toBe(false);
    const r = form({ saleStarts: "2026-11-30T00:00", saleEnds: "2026-11-27T00:00" });
    expect(r.ok).toBe(false);
    const r2 = form({ salePrice: "", saleStarts: "2026-11-27T00:00" });
    expect(r2.ok).toBe(false);
  });
});

