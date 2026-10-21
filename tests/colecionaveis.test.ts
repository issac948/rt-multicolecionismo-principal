import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { normalizeBrand, normalizeScale, collectibleSpecs } from "@/lib/collectibles";
import { parseProductForm } from "@/lib/forms";
import { productInputSchema } from "@/lib/schemas";
import { authenticate } from "@/server/services/users";
import { createSession, getUserByToken } from "@/server/auth/session";
import { categories, passwordResetTokens, products } from "@/server/db/schema";
import { createCategory } from "@/server/services/categories";
import { countDemoProducts, removeDemoProducts } from "@/server/services/demo";
import { consumePasswordReset, createPasswordResetLink, isResetTokenValid } from "@/server/services/password-reset";
import { listCatalogFacets, listPublicProducts } from "@/server/services/products";
import { addToCart, getOrCreateUserCart } from "@/server/services/cart";
import { createOrderFromCart } from "@/server/services/orders";
import { saveSettings } from "@/server/services/settings";
import { BusinessRuleError } from "@/server/errors";
import { createAdmin, createTestProduct, createUser, db, resetDb, TEST_PASSWORD, testSettings } from "./helpers";

beforeEach(async () => {
  await resetDb();
});

describe("campos de colecionável: normalização e validação", () => {
  it("normaliza marca e escala digitadas de formas diferentes", () => {
    expect(normalizeBrand("hot wheels")).toBe("Hot Wheels");
    expect(normalizeBrand("  HOTWHEELS ")).toBe("Hot Wheels");
    expect(normalizeBrand("mini-gt")).toBe("Mini GT");
    expect(normalizeBrand("Marca  Nova")).toBe("Marca Nova");
    expect(normalizeScale("1/64")).toBe("1:64");
    expect(normalizeScale("1 : 43")).toBe("1:43");
    expect(normalizeScale("1x18")).toBe("1:18");
    expect(normalizeScale("grande")).toBe("grande");
  });

  it("produto comum (sem nenhum campo de colecionável) continua válido", () => {
    const parsed = productInputSchema.parse({ name: "Expositor de parede", priceCents: 6990 });
    expect(parsed.brand).toBeNull();
    expect(parsed.scale).toBeNull();
    expect(parsed.condition).toBeNull();
    expect(parsed.releaseYear).toBeNull();
    expect(collectibleSpecs(parsed)).toEqual([]);
  });

  it("rejeita condição desconhecida e ano fora do intervalo", () => {
    expect(productInputSchema.safeParse({ name: "Carrinho", priceCents: 100, condition: "NOVO" }).success).toBe(false);
    expect(productInputSchema.safeParse({ name: "Carrinho", priceCents: 100, releaseYear: 1700 }).success).toBe(false);
    expect(productInputSchema.safeParse({ name: "Carrinho", priceCents: 100, releaseYear: 2023, condition: "SOLTO" }).success).toBe(true);
  });

  it("o formulário do painel converte os campos e trata vazio como 'não informado'", () => {
    const fd = new FormData();
    fd.set("name", "Miniatura de teste");
    fd.set("price", "19,90");
    fd.set("stock", "2");
    fd.set("brand", "hot wheels");
    fd.set("scale", "1/64");
    fd.set("releaseYear", "2022");
    fd.set("condition", "LACRADO");
    const parsed = parseProductForm(fd);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data).toMatchObject({ brand: "Hot Wheels", scale: "1:64", releaseYear: 2022, condition: "LACRADO", model: null });
    }
    fd.set("condition", "");
    fd.set("releaseYear", "");
    const again = parseProductForm(fd);
    expect(again.ok && again.data.condition === null && again.data.releaseYear === null).toBe(true);
  });
});

describe("catálogo: salvar, buscar e filtrar colecionáveis", () => {
  async function seedCatalog() {
    const cat = await createCategory({ name: "Miniaturas 1:64", description: null, position: 1, active: true, kind: "CARROS", parentId: null });
    const hw = await createTestProduct({ name: "Cupê Vermelho", brand: "hot wheels", scale: "1/64", series: "Série Teste", releaseYear: 2023, condition: "LACRADO", categoryId: cat.id, featured: true });
    const gt = await createTestProduct({ name: "Hatch Azul", brand: "Mini GT", scale: "1:64", condition: "SOLTO", conservationNotes: "sem riscos" });
    const big = await createTestProduct({ name: "Esportivo Grande", brand: "Maisto", scale: "1:18", condition: "LACRADO" });
    const other = await createTestProduct({ name: "Expositor de Parede" });
    const hidden = await createTestProduct({ name: "Rascunho Oculto", brand: "Hot Wheels", active: false });
    return { cat, hw, gt, big, other, hidden };
  }

  it("grava os campos normalizados e deixa os opcionais nulos nos outros produtos", async () => {
    const { hw, other } = await seedCatalog();
    const [row] = await db.select().from(products).where(eq(products.id, hw.id));
    expect(row).toMatchObject({ brand: "Hot Wheels", scale: "1:64", series: "Série Teste", releaseYear: 2023, condition: "LACRADO" });
    const [plain] = await db.select().from(products).where(eq(products.id, other.id));
    expect(plain).toMatchObject({ brand: null, scale: null, condition: null, releaseYear: null });
  });

  it("a busca encontra por marca, série, ano e condição (sem acento e sem diferenciar maiúsculas)", async () => {
    await seedCatalog();
    const names = async (q: string) => (await listPublicProducts({ q })).items.map((p) => p.name).sort();
    expect(await names("hot wheels")).toEqual(["Cupê Vermelho"]);
    expect(await names("SERIE teste")).toEqual(["Cupê Vermelho"]);
    expect(await names("2023")).toEqual(["Cupê Vermelho"]);
    expect(await names("lacrado")).toEqual(["Cupê Vermelho", "Esportivo Grande"]);
    expect(await names("1:64")).toEqual(["Cupê Vermelho", "Hatch Azul"]);
  });

  it("filtra por marca, escala, condição e tipo; produto oculto nunca aparece", async () => {
    await seedCatalog();
    const names = async (f: Parameters<typeof listPublicProducts>[0]) => (await listPublicProducts(f)).items.map((p) => p.name).sort();
    expect(await names({ brand: "HOT WHEELS" })).toEqual(["Cupê Vermelho"]);
    expect(await names({ scale: "1:64" })).toEqual(["Cupê Vermelho", "Hatch Azul"]);
    expect(await names({ condition: "SOLTO" })).toEqual(["Hatch Azul"]);
    expect(await names({ kind: "carros" })).toEqual(["Cupê Vermelho", "Esportivo Grande", "Hatch Azul"]);
    expect(await names({ kind: "outros" })).toEqual(["Expositor de Parede"]);
    expect(await names({ brand: "Hot Wheels", condition: "SOLTO" })).toEqual([]);
  });

  it("produto numa categoria de carros conta como miniatura mesmo sem campos preenchidos", async () => {
    const cat = await createCategory({ name: "Colecionáveis", description: null, position: 1, active: true, kind: "CARROS", parentId: null });
    await createTestProduct({ name: "Sem campos, mas na categoria", categoryId: cat.id });
    await createTestProduct({ name: "Fora" });
    expect((await listPublicProducts({ kind: "carros" })).items.map((p) => p.name)).toEqual(["Sem campos, mas na categoria"]);
    expect((await listPublicProducts({ kind: "outros" })).items.map((p) => p.name)).toEqual(["Fora"]);
    const [c] = await db.select().from(categories).where(eq(categories.id, cat.id));
    expect(c.isCollectible).toBe(true);
  });

  it("as opções de filtro (facetas) só trazem o que existe em produtos publicados", async () => {
    await seedCatalog();
    const facets = await listCatalogFacets();
    expect(facets.brands.map((b) => b.value)).toEqual(["Hot Wheels", "Maisto", "Mini GT"]);
    expect(facets.scales).toEqual([
      { value: "1:18", count: 1 },
      { value: "1:64", count: 2 },
    ]);
    expect(facets.conditions.map((c) => c.value).sort()).toEqual(["LACRADO", "SOLTO"]);
  });
});

describe("recuperação de senha por link gerado pelo administrador", () => {
  it("gera link para cliente, a senha muda, o link só vale uma vez e as sessões antigas caem", async () => {
    const admin = await createAdmin();
    const customer = await createUser({ email: "cliente@teste.dev" });
    const session = await createSession(customer.id, "CLIENTE", "vitest");
    expect(await getUserByToken(session.token)).not.toBeNull();

    const { token } = await createPasswordResetLink(customer.id, admin.id);
    expect(await isResetTokenValid(token)).toBe(true);

    await consumePasswordReset(token, "nova-senha-segura-1");
    expect(await authenticate("cliente@teste.dev", "nova-senha-segura-1")).not.toBeNull();
    expect(await authenticate("cliente@teste.dev", TEST_PASSWORD)).toBeNull();
    expect(await getUserByToken(session.token)).toBeNull();

    expect(await isResetTokenValid(token)).toBe(false);
    await expect(consumePasswordReset(token, "outra-senha-qualquer-2")).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("guarda só o hash do token; link novo invalida o anterior; link expirado e token inválido são recusados", async () => {
    const admin = await createAdmin();
    const customer = await createUser();
    const first = await createPasswordResetLink(customer.id, admin.id);
    const rows = await db.select().from(passwordResetTokens);
    expect(rows.every((r) => r.tokenHash !== first.token && !r.tokenHash.includes(first.token))).toBe(true);

    const second = await createPasswordResetLink(customer.id, admin.id);
    expect(await isResetTokenValid(first.token)).toBe(false);
    expect(await isResetTokenValid(second.token)).toBe(true);

    await db.update(passwordResetTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await isResetTokenValid(second.token)).toBe(false);
    await expect(consumePasswordReset(second.token, "nova-senha-segura-1")).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(consumePasswordReset("lixo", "nova-senha-segura-1")).rejects.toBeInstanceOf(BusinessRuleError);
    expect(await isResetTokenValid("x".repeat(43))).toBe(false);
  });

  it("não gera link para administrador nem para conta desativada", async () => {
    const admin = await createAdmin();
    const inactive = await createUser({ active: false });
    await expect(createPasswordResetLink(admin.id, admin.id)).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(createPasswordResetLink(inactive.id, admin.id)).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("duas pessoas usando o mesmo link ao mesmo tempo: só uma troca a senha", async () => {
    const admin = await createAdmin();
    const customer = await createUser();
    const { token } = await createPasswordResetLink(customer.id, admin.id);
    const results = await Promise.allSettled([consumePasswordReset(token, "senha-numero-um-1"), consumePasswordReset(token, "senha-numero-dois-2")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("remoção dos produtos de demonstração", () => {
  it("remove só os de demonstração; os reais e os que estão em pedidos são preservados", async () => {
    await saveSettings(testSettings({ pickupEnabled: true }));
    const oldCat = await createCategory({ name: "Carrinhos de feira", description: null, position: 1, active: true, kind: "OUTROS", parentId: null });
    const legacy = await createTestProduct({ name: "Carrinho de Feira com Rodinhas", shortDescription: "Produto de demonstração. Carrinho de feira.", categoryId: oldCat.id });
    const newDemo = await createTestProduct({ name: "Cupê (demo)", sku: "DEMO-001" });
    const demoSold = await createTestProduct({ name: "Picape (demo)", sku: "DEMO-002", stock: 5 });
    const real = await createTestProduct({ name: "Carrinho de Feira com Rodinhas", sku: "REAL-1", shortDescription: "Meu produto de verdade" });
    const realOther = await createTestProduct({ name: "Hot Wheels Camaro" });

    const buyer = await createUser();
    const cartId = await getOrCreateUserCart(buyer.id);
    await addToCart(cartId, demoSold.id, 1);
    await createOrderFromCart({ userId: buyer.id, cartId, addressId: null, shippingCode: "RETIRADA", note: null });

    expect(await countDemoProducts()).toEqual({ total: 3, published: 3 });
    const result = await removeDemoProducts();
    expect(result).toEqual({ deleted: 2, hidden: 1, categoriesDeleted: 1 });

    const left = await db.select({ id: products.id, active: products.active }).from(products);
    const byId = new Map(left.map((p) => [p.id, p.active]));
    expect(byId.has(legacy.id)).toBe(false);
    expect(byId.has(newDemo.id)).toBe(false);
    expect(byId.get(demoSold.id)).toBe(false);
    expect(byId.get(real.id)).toBe(true);
    expect(byId.get(realOther.id)).toBe(true);
    expect(await db.select().from(categories).where(eq(categories.id, oldCat.id))).toHaveLength(0);

    expect(await countDemoProducts()).toEqual({ total: 1, published: 0 });
    expect(await removeDemoProducts()).toEqual({ deleted: 0, hidden: 1, categoriesDeleted: 0 });
  });
});

