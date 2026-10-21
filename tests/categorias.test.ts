import { beforeEach, describe, expect, it } from "vitest";
import { buildCategoryTree, publicCategoryTree, toCategoryOptions, SUGGESTED_CATEGORIES } from "@/lib/categories";
import { parseCatalogParams, toProductFilters } from "@/server/catalog-params";
import { BusinessRuleError, ValidationError } from "@/server/errors";
import { categories } from "@/server/db/schema";
import { createCategory, deleteCategory, ensureSuggestedCategories, getCategoryContext, listCategories, listCategoriesWithCounts, updateCategory } from "@/server/services/categories";
import { listCatalogFacets, listPublicProducts } from "@/server/services/products";
import { createTestProduct, db, resetDb } from "./helpers";

const cat = (name: string, kind: "CARROS" | "COLECIONAVEL" | "OUTROS" = "OUTROS", parentId: string | null = null) =>
  createCategory({ name, description: null, position: 0, active: true, kind, parentId });

beforeEach(resetDb);

describe("categorias e subcategorias", () => {
  it("a subcategoria herda o tipo da mãe, mesmo que outro tipo seja enviado", async () => {
    const mae = await cat("Miniaturas de carros", "CARROS");
    const filha = await cat("Hot Wheels", "OUTROS", mae.id);
    expect(filha.parentId).toBe(mae.id);
    expect(filha.kind).toBe("CARROS");
    expect(filha.isCollectible).toBe(true);
  });

  it("só existe um nível: subcategoria de subcategoria, de si mesma ou com mãe inexistente é recusada", async () => {
    const mae = await cat("Mãe", "CARROS");
    const filha = await cat("Filha", "CARROS", mae.id);
    await expect(cat("Neta", "CARROS", filha.id)).rejects.toBeInstanceOf(ValidationError);
    await expect(updateCategory(mae.id, { name: "Mãe", description: null, position: 0, active: true, kind: "CARROS", parentId: mae.id })).rejects.toBeInstanceOf(ValidationError);
    await expect(cat("Órfã", "CARROS", "11111111-1111-4111-8111-111111111111")).rejects.toBeInstanceOf(ValidationError);
    // Categoria que já tem filhas não pode virar filha de outra.
    const outra = await cat("Outra", "CARROS");
    await expect(updateCategory(mae.id, { name: "Mãe", description: null, position: 0, active: true, kind: "CARROS", parentId: outra.id })).rejects.toBeInstanceOf(ValidationError);
  });

  it("mudar o tipo da mãe muda o das filhas; excluir mãe com filhas é recusado e produtos não se perdem", async () => {
    const mae = await cat("Bonecos", "CARROS");
    const filha = await cat("Figuras", "CARROS", mae.id);
    await updateCategory(mae.id, { name: "Bonecos", description: null, position: 0, active: true, kind: "COLECIONAVEL", parentId: null });
    expect((await listCategories()).find((c) => c.id === filha.id)?.kind).toBe("COLECIONAVEL");
    await expect(deleteCategory(mae.id)).rejects.toBeInstanceOf(BusinessRuleError);
    await deleteCategory(filha.id);
    await deleteCategory(mae.id);
    expect(await listCategories()).toHaveLength(0);
  });

  it("a categoria-mãe lista também os produtos das subcategorias; a filha só os dela; facetas acompanham", async () => {
    const mae = await cat("Miniaturas de carros", "CARROS");
    const hw = await cat("Hot Wheels", "CARROS", mae.id);
    const mgt = await cat("Mini GT", "CARROS", mae.id);
    await createTestProduct({ name: "Carro HW", categoryId: hw.id, brand: "Hot Wheels", scale: "1:64" });
    await createTestProduct({ name: "Carro MGT", categoryId: mgt.id, brand: "Mini GT", scale: "1:64" });
    await createTestProduct({ name: "Sem categoria" });

    expect((await listPublicProducts({ categoryId: mae.id })).items.map((p) => p.name).sort()).toEqual(["Carro HW", "Carro MGT"]);
    expect((await listPublicProducts({ categoryId: hw.id })).items.map((p) => p.name)).toEqual(["Carro HW"]);
    const facets = await listCatalogFacets({ categoryId: mae.id });
    expect(facets.brands.map((b) => b.value).sort()).toEqual(["Hot Wheels", "Mini GT"]);
    expect((await listCatalogFacets({ categoryId: hw.id })).brands).toHaveLength(1);
  });

  it("o tipo do produto vem do tipo da categoria; sem categoria, dos campos de colecionador", async () => {
    const carros = await cat("Carros", "CARROS");
    const bonecos = await cat("Bonecos", "COLECIONAVEL");
    const acess = await cat("Acessórios", "OUTROS");
    await createTestProduct({ name: "Um carro", categoryId: carros.id });
    await createTestProduct({ name: "Um boneco", categoryId: bonecos.id, brand: "Fabricante X", condition: "LACRADO" });
    await createTestProduct({ name: "Expositor Hot Wheels", categoryId: acess.id, brand: "Hot Wheels" });
    await createTestProduct({ name: "Solto com marca", brand: "Matchbox" });
    await createTestProduct({ name: "Solto sem nada" });

    const names = async (kind: "carros" | "colecionavel" | "outros") => (await listPublicProducts({ kind })).items.map((p) => p.name).sort();
    expect(await names("carros")).toEqual(["Solto com marca", "Um carro"]);
    expect(await names("colecionavel")).toEqual(["Um boneco"]);
    expect(await names("outros")).toEqual(["Expositor Hot Wheels", "Solto sem nada"]);

    const facets = await listCatalogFacets();
    expect(facets.kinds).toEqual({ carros: 2, colecionavel: 1, outros: 2 });
  });

  it("a vitrine só mostra categorias ativas com produto publicado (sem páginas vazias)", async () => {
    const mae = await cat("Miniaturas", "CARROS");
    const cheia = await cat("Com produto", "CARROS", mae.id);
    await cat("Vazia", "CARROS", mae.id);
    await cat("Raiz vazia", "OUTROS");
    await createTestProduct({ name: "P", categoryId: cheia.id });
    const tree = publicCategoryTree(await listCategoriesWithCounts({ onlyActive: true }));
    expect(tree.map((n) => n.name)).toEqual(["Miniaturas"]);
    expect(tree[0].children.map((c) => c.name)).toEqual(["Com produto"]);
    expect(tree[0].totalCount).toBe(1);
    // No painel aparecem todas.
    expect(buildCategoryTree(await listCategoriesWithCounts())).toHaveLength(2);
  });

  it("página da categoria: mãe, filhas com produto e categoria inativa inexistente", async () => {
    const mae = await cat("Miniaturas", "CARROS");
    const filha = await cat("Hot Wheels", "CARROS", mae.id);
    await createTestProduct({ name: "P", categoryId: filha.id });
    const ctxFilha = await getCategoryContext(filha.slug);
    expect(ctxFilha?.parent?.id).toBe(mae.id);
    const ctxMae = await getCategoryContext(mae.slug);
    expect(ctxMae?.children.map((c) => c.id)).toEqual([filha.id]);
    await updateCategory(mae.id, { name: "Miniaturas", description: null, position: 0, active: false, kind: "CARROS", parentId: null });
    expect(await getCategoryContext(mae.slug)).toBeNull();
  });

  it("estrutura sugerida: cria tudo, é idempotente e nunca altera categorias existentes", async () => {
    const minha = await cat("Miniaturas de carros", "OUTROS"); // o dono já tinha uma com esse nome (tipo diferente)
    const first = await ensureSuggestedCategories();
    const total = SUGGESTED_CATEGORIES.reduce((n, c) => n + 1 + c.children.length, 0);
    expect(first.created).toBe(total - 1);
    expect((await ensureSuggestedCategories()).created).toBe(0);
    const all = await listCategories();
    expect(all.find((c) => c.id === minha.id)?.kind).toBe("OUTROS");
    expect(all.filter((c) => c.name === "Hot Wheels")).toHaveLength(1);
    expect(all.find((c) => c.name === "Hot Wheels")?.parentId).toBe(minha.id);
  });

  it("as opções do cadastro mostram 'Mãe › Filha' com o tipo, e os endereços antigos de filtro continuam valendo", async () => {
    const mae = await cat("Bonecos e colecionáveis", "COLECIONAVEL");
    const filha = await cat("Figuras de ação", "COLECIONAVEL", mae.id);
    const options = toCategoryOptions(await db.select().from(categories));
    expect(options.find((o) => o.id === filha.id)).toEqual({ id: filha.id, name: "Bonecos e colecionáveis › Figuras de ação", kind: "COLECIONAVEL" });

    expect(parseCatalogParams({ tipo: "colecionaveis" }).kind).toBe("miniaturas");
    expect(parseCatalogParams({ tipo: "bonecos" }).kind).toBe("bonecos");
    expect(parseCatalogParams({ tipo: "qualquer" }).kind).toBe("");
    expect(toProductFilters(parseCatalogParams({ tipo: "miniaturas" })).kind).toBe("carros");
    expect(toProductFilters(parseCatalogParams({ tipo: "bonecos" })).kind).toBe("colecionavel");
  });
});
