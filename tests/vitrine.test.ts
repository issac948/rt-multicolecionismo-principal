import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { hasContactInfo } from "@/components/shop/contact-info";
import { deliveryLines } from "@/components/shop/delivery-info";
import { splitCarShowcases } from "@/lib/home-sections";
import { parseCatalogParams, toProductFilters } from "@/server/catalog-params";
import { categories, products, settings } from "@/server/db/schema";
import { createCategory } from "@/server/services/categories";
import { listCatalogFacets, listPublicProducts } from "@/server/services/products";
import { formatPhone, whatsappLink } from "@/lib/text";
import { defaultSettings, getSettings, saveSettings } from "@/server/services/settings";
import { createTestProduct, db, resetDb, testSettings } from "./helpers";

beforeEach(resetDb);

describe("padrões da loja: nada de frete ou prazo inventado", () => {
  it("sem configuração do dono, a loja não mostra nem cobra entrega", () => {
    const d = defaultSettings();
    expect(d.shipping.deliveryEnabled).toBe(false);
    expect(d.shipping.flatRateCents).toBe(0);
    expect(d.shipping.estimate).toBe("");
    expect(deliveryLines(d)).toEqual([]);
  });

  it("sem contato cadastrado a loja não promete \"formas de contato\"; com WhatsApp ou e-mail passa a mostrar", () => {
    const d = { ...defaultSettings(), whatsapp: "", phone: "", whatsappGroupUrl: "" };
    expect(hasContactInfo(d)).toBe(false);
    expect(hasContactInfo({ ...d, whatsapp: "41900000000" })).toBe(true);
    expect(hasContactInfo({ ...d, email: "loja@exemplo.com" })).toBe(true);
    expect(hasContactInfo({ ...d, whatsapp: "abc" })).toBe(false);
  });

  it("textos padrão falam de miniaturas de carros e colecionáveis (nada de carrinhos genéricos)", () => {
    const d = defaultSettings();
    const text = `${d.tagline} ${d.description}`.toLowerCase();
    expect(text).toContain("miniaturas de carros");
    expect(text).toContain("colecionáveis");
    expect(text).not.toMatch(/infantil|bebê|bebe|supermercado|industrial|brinquedo/);
  });
});

describe("migração 0003: limpeza segura dos dados antigos de demonstração", () => {
  const sqlFile = path.resolve(process.cwd(), "drizzle/0003_limpeza_demo_antigo_e_padroes.sql");
  async function runMigration() {
    for (const statement of readFileSync(sqlFile, "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) await db.execute(sql.raw(statement));
    }
  }
  const storeRow = async () => (await db.select().from(settings).where(eq(settings.key, "store")))[0].value as Record<string, any>;

  it("oculta SÓ os produtos antigos identificados com certeza; nada é apagado", async () => {
    const legacyCat = await createCategory({ name: "Carrinhos de bebê", description: null, position: 1, active: true, kind: "OUTROS", parentId: null });
    const usedCat = await createCategory({ name: "Carrinhos de feira", description: null, position: 2, active: true, kind: "OUTROS", parentId: null });
    const legacy = await createTestProduct({ name: "Carrinho de Bebê Dobrável", shortDescription: "Produto de demonstração. Carrinho de bebê.", categoryId: legacyCat.id });
    // Mesmo nome, mas é um produto de verdade (descrição diferente): fica como está, e a categoria dele também.
    const real = await createTestProduct({ name: "Carrinho de Feira com Rodinhas", shortDescription: "Meu produto de verdade", categoryId: usedCat.id });
    const demoNew = await createTestProduct({ name: "Cupê Esportivo Vermelho (demo)", sku: "DEMO-001" });
    const other = await createTestProduct({ name: "Hot Wheels Camaro", brand: "Hot Wheels" });

    await runMigration();

    const active = async (id: string) => (await db.select({ a: products.active }).from(products).where(eq(products.id, id)))[0].a;
    expect(await active(legacy.id)).toBe(false);
    expect(await active(real.id)).toBe(true);
    expect(await active(demoNew.id)).toBe(true);
    expect(await active(other.id)).toBe(true);

    const catActive = async (id: string) => (await db.select({ a: categories.active }).from(categories).where(eq(categories.id, id)))[0].a;
    expect(await catActive(legacyCat.id)).toBe(false); // ficou sem produto publicado
    expect(await catActive(usedCat.id)).toBe(true); // ainda tem produto real publicado

    expect((await listPublicProducts()).total).toBe(3); // nada foi apagado, só ocultado
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(products);
    expect(n).toBe(4);

    await runMigration(); // rodar de novo não muda nada
    expect((await listPublicProducts()).total).toBe(3);
  });

  it("textos e frete: troca só o que ainda é exemplo do sistema e preserva o que o dono digitou", async () => {
    const pristine = testSettings({ deliveryEnabled: true, flatRateCents: 3000, estimate: "3 a 7 dias úteis", freeAboveCents: null });
    await saveSettings({
      ...pristine,
      tagline: "Miniaturas colecionáveis e muito mais",
      description: "Miniaturas colecionáveis, lacradas e soltas, e também outros produtos selecionados. Loja de Curitiba.",
    });
    await runMigration();
    let row = await storeRow();
    expect(row.tagline).toBe("Miniaturas de carros e colecionáveis");
    expect(row.description).toContain("bonecos");
    expect(row.shipping.deliveryEnabled).toBe(false);
    expect(row.shipping.flatRateCents).toBe(0);
    expect(row.shipping.estimate).toBe("");

    // O dono já personalizou: nada muda (frete diferente do padrão, frase e descrição próprias).
    await saveSettings({
      ...testSettings({ deliveryEnabled: true, flatRateCents: 4500, estimate: "5 dias úteis" }),
      tagline: "Minha frase",
      description: "Minha descrição.",
    });
    await runMigration();
    row = await storeRow();
    expect(row.tagline).toBe("Minha frase");
    expect(row.description).toBe("Minha descrição.");
    expect(row.shipping).toMatchObject({ deliveryEnabled: true, flatRateCents: 4500, estimate: "5 dias úteis" });

    // Frete grátis acima de um valor também conta como configuração do dono.
    await saveSettings(testSettings({ deliveryEnabled: true, flatRateCents: 3000, estimate: "3 a 7 dias úteis", freeAboveCents: 20000 }));
    await runMigration();
    expect((await storeRow()).shipping).toMatchObject({ deliveryEnabled: true, flatRateCents: 3000, freeAboveCents: 20000 });
  });
});

describe("vitrine: série, categoria na URL e vitrines sem repetição", () => {
  it("lê e saneia os novos parâmetros da URL", () => {
    expect(parseCatalogParams({ serie: "  Treasure   Hunt 2024 ", categoria: "hot-wheels" })).toMatchObject({ series: "Treasure Hunt 2024", category: "hot-wheels" });
    expect(parseCatalogParams({ categoria: "../../etc/passwd" }).category).toBe("");
    expect(parseCatalogParams({ categoria: "Hot Wheels" }).category).toBe("");
    expect(parseCatalogParams({}).series).toBe("");
    expect(toProductFilters(parseCatalogParams({ serie: "Mainline" })).series).toBe("Mainline");
  });

  it("filtra por série sem diferenciar maiúsculas/espaços e as opções do filtro juntam grafias iguais", async () => {
    await createTestProduct({ name: "A", brand: "Hot Wheels", series: "Treasure Hunt 2024" });
    await createTestProduct({ name: "B", brand: "Hot Wheels", series: " treasure hunt 2024 " });
    await createTestProduct({ name: "C", brand: "Mini GT", series: "Série 100" });
    await createTestProduct({ name: "D", brand: "Mini GT", series: "   " });
    await createTestProduct({ name: "E (rascunho)", series: "Série 100", active: false });

    const th = await listPublicProducts({ series: "treasure hunt 2024" });
    expect(th.items.map((p) => p.name).sort()).toEqual(["A", "B"]);
    expect((await listPublicProducts({ series: "Série 100" })).items.map((p) => p.name)).toEqual(["C"]); // rascunho nunca aparece

    const facets = await listCatalogFacets();
    expect(facets.series).toHaveLength(2);
    expect(facets.series.map((s) => s.count).sort()).toEqual([1, 2]);
    expect(facets.series.some((s) => s.value.trim() === "")).toBe(false);
  });

  it("'em destaque' só traz produtos marcados e publicados, na categoria de carros", async () => {
    const cars = await createCategory({ name: "Miniaturas de carros", description: null, position: 1, active: true, kind: "CARROS", parentId: null });
    const figs = await createCategory({ name: "Bonecos e colecionáveis", description: null, position: 2, active: true, kind: "COLECIONAVEL", parentId: null });
    await createTestProduct({ name: "Carro em destaque", featured: true, categoryId: cars.id });
    await createTestProduct({ name: "Carro comum", categoryId: cars.id });
    await createTestProduct({ name: "Carro em destaque oculto", featured: true, active: false, categoryId: cars.id });
    await createTestProduct({ name: "Boneco em destaque", featured: true, categoryId: figs.id });

    const result = await listPublicProducts({ kind: "carros", featuredOnly: true });
    expect(result.items.map((p) => p.name)).toEqual(["Carro em destaque"]);
  });

  it("Destaques, Novidades e Miniaturas nunca repetem o mesmo produto", () => {
    const p = (id: string) => ({ id });
    const featured = [p("a"), p("b")];
    const recent = [p("a"), p("c"), p("d"), p("e"), p("f"), p("g")];
    const pool = [p("a"), p("c"), p("h"), p("i"), p("d"), p("j")];
    const out = splitCarShowcases({ featured, recent, pool }, { novidades: 3, miniaturas: 3 });
    expect(out.destaques.map((x) => x.id)).toEqual(["a", "b"]);
    expect(out.novidades.map((x) => x.id)).toEqual(["c", "d", "e"]);
    expect(out.miniaturas.map((x) => x.id)).toEqual(["h", "i", "j"]);
    const all = [...out.destaques, ...out.novidades, ...out.miniaturas].map((x) => x.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it("catálogo pequeno: tudo cabe em Destaques/Novidades e a seção de miniaturas fica sem repetir nada", () => {
    const p = (id: string) => ({ id });
    const out = splitCarShowcases({ featured: [p("a")], recent: [p("a"), p("b"), p("c")], pool: [p("a"), p("b"), p("c")] });
    expect(out.novidades.map((x) => x.id)).toEqual(["b", "c"]);
    expect(out.miniaturas).toEqual([]);
  });
});

describe("contatos do dono (migração 0004 e padrões)", () => {
  const sqlFile = path.resolve(process.cwd(), "drizzle/0004_contatos_do_dono.sql");
  async function runMigration() {
    for (const statement of readFileSync(sqlFile, "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) await db.execute(sql.raw(statement));
    }
  }

  it("instalação nova já vem com o WhatsApp, o telefone e o grupo do dono, formatados e com link correto", () => {
    const d = defaultSettings();
    expect(formatPhone(d.whatsapp)).toBe("(41) 9141-9031");
    expect(whatsappLink(d.whatsapp)).toBe("https://wa.me/554191419031");
    expect(d.phone).toBe(d.whatsapp);
    expect(d.whatsappGroupUrl).toBe("https://chat.whatsapp.com/GbvNJdKd8Tc88muhZKjgFE");
  });

  it("apagar o número no painel continua valendo (o padrão não volta sozinho)", async () => {
    await saveSettings({ ...defaultSettings(), whatsapp: "", phone: "", whatsappGroupUrl: "" });
    const s = await getSettings();
    expect([s.whatsapp, s.phone, s.whatsappGroupUrl]).toEqual(["", "", ""]);
  });

  it("a migração só preenche contatos em branco; o que o dono digitou é preservado", async () => {
    await db.update(settings).set({ value: sql`jsonb_set(jsonb_set(jsonb_set(value, '{whatsapp}', '""'), '{phone}', '"11988887777"'), '{whatsappGroupUrl}', '""')` }).where(eq(settings.key, "store"));
    await runMigration();
    const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "store"));
    const v = row.value as Record<string, string>;
    expect(v.whatsapp).toBe("4191419031");
    expect(v.phone).toBe("11988887777");
    expect(v.whatsappGroupUrl).toBe("https://chat.whatsapp.com/GbvNJdKd8Tc88muhZKjgFE");
  });
});
