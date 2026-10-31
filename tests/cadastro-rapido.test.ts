import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

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
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));

import { saveProductAction } from "@/server/actions/admin";
import { createSession } from "@/server/auth/session";
import { categories, productImages, products } from "@/server/db/schema";
import { adminListProducts } from "@/server/services/products";
import { createAdmin, createTestProduct, db, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  browser.token = (await createSession((await createAdmin()).id, "ADMIN")).token;
});

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
async function redirectOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    return String((error as { digest?: string }).digest);
  }
  return "";
}

describe("salvar rascunho e cadastrar outro", () => {
  it("salva como RASCUNHO (nunca publica) e leva para um formulário novo baseado no produto salvo", async () => {
    const where = await redirectOf(() => saveProductAction({}, form({ name: "Fusca Azul", price: "49,90", stock: "2", brand: "hot wheels", scale: "1/64", intent: "draft-another" })));
    const [row] = await db.select().from(products);
    expect(row).toMatchObject({ name: "Fusca Azul", active: false, brand: "Hot Wheels", scale: "1:64", stock: 2 });
    expect(where).toContain(`/admin/produtos/novo?base=${row.id}`);
  });

  it("os outros botões continuam levando ao produto salvo (publicar / rascunho)", async () => {
    expect(await redirectOf(() => saveProductAction({}, form({ name: "Carro Um", price: "10,00", stock: "1", intent: "publish" })))).toContain("?criado=publicado");
    expect(await redirectOf(() => saveProductAction({}, form({ name: "Carro Dois", price: "10,00", stock: "1", intent: "draft" })))).toContain("?criado=rascunho");
  });

  it("com erro de preenchimento não salva nada e não redireciona", async () => {
    const result = await saveProductAction({}, form({ name: "Carro", price: "", stock: "1", intent: "draft-another" }));
    expect(result.errors).toBeTruthy();
    expect(await db.select().from(products)).toHaveLength(0);
  });
});

describe("lista do painel para muitos produtos", () => {
  it("filtra por categoria, por 'sem foto' e ordena por nome ou estoque", async () => {
    const [cat] = await db.insert(categories).values({ name: "Hot Wheels", slug: "hot-wheels", kind: "CARROS" }).returning();
    const a = await createTestProduct({ name: "Zebra Car", stock: 9, categoryId: cat.id });
    const b = await createTestProduct({ name: "Alfa Car", stock: 1 });
    const c = await createTestProduct({ name: "Meio Car", stock: 5, categoryId: cat.id });
    await db.insert(productImages).values({ productId: a.id, storageKey: "products/a.webp", thumbKey: "products/a-thumb.webp", width: 10, height: 10, position: 0 });

    expect((await adminListProducts({ categoryId: cat.id })).items.map((p) => p.name).sort()).toEqual(["Meio Car", "Zebra Car"]);
    expect((await adminListProducts({ status: "nophoto" })).items.map((p) => p.name).sort()).toEqual(["Alfa Car", "Meio Car"]);
    expect((await adminListProducts({ status: "nophoto", categoryId: cat.id })).items.map((p) => p.id)).toEqual([c.id]);
    expect((await adminListProducts({ sort: "nome" })).items.map((p) => p.name)).toEqual(["Alfa Car", "Meio Car", "Zebra Car"]);
    expect((await adminListProducts({ sort: "estoque" })).items.map((p) => p.id)).toEqual([b.id, c.id, a.id]);
    expect((await adminListProducts({ q: "zebra" })).total).toBe(1);
  });

  it("pagina centenas de produtos sem carregar todos de uma vez", async () => {
    const rows = Array.from({ length: 230 }, (_, i) => ({ name: `Produto ${String(i).padStart(3, "0")}`, slug: `produto-${i}`, priceCents: 1000 + i, stock: 1, searchText: `produto ${i}` }));
    await db.insert(products).values(rows);
    const page1 = await adminListProducts({ sort: "nome", pageSize: 20 });
    expect(page1).toMatchObject({ total: 230, pages: 12 });
    expect(page1.items).toHaveLength(20);
    const last = await adminListProducts({ sort: "nome", pageSize: 20, page: 12 });
    expect(last.items).toHaveLength(10);
    expect(last.items[9].name).toBe("Produto 229");
    expect(await db.select().from(products).where(eq(products.name, "Produto 000"))).toHaveLength(1);
  });
});
