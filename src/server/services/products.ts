import { randomBytes } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  sql,
  type SQL,
} from "drizzle-orm";
import { escapeLike, normalizeForSearch, slugify } from "@/lib/text";
import type { ProductInput } from "@/lib/schemas";
import { conditionLabel, normalizeBrand, normalizeScale } from "@/lib/collectibles";
import { AWAITING_PAYMENT_STATUSES, PRODUCT_CONDITIONS, type ProductCondition } from "@/lib/constants";
import { db, type Tx } from "../db";
import {
  categories,
  orderItems,
  orders,
  productImages,
  products,
  stockMovements,
  type Category,
  type Product,
  type ProductImage,
} from "../db/schema";
import { BusinessRuleError, isUniqueViolation, NotFoundError, ValidationError } from "../errors";
import { deleteImageFiles } from "../storage/images";

export type ProductWithRelations = Product & { images: ProductImage[]; category: Category | null };

/** Preço efetivo em SQL: o promocional quando existe e é menor que o normal. */
const effectivePriceSql = sql<number>`(CASE WHEN ${products.salePriceCents} IS NOT NULL AND ${products.salePriceCents} < ${products.priceCents} THEN ${products.salePriceCents} ELSE ${products.priceCents} END)`;

const withRelations = {
  images: { orderBy: [asc(productImages.position)] },
  category: true as const,
};

export type ProductSort = "relevancia" | "recentes" | "menor-preco" | "maior-preco" | "nome";
export const PRODUCT_SORTS: ProductSort[] = ["relevancia", "recentes", "menor-preco", "maior-preco", "nome"];

export type ProductFilters = {
  q?: string;
  categoryId?: string;
  sort?: ProductSort;
  minPriceCents?: number;
  maxPriceCents?: number;
  onSale?: boolean;
  inStock?: boolean;
  featuredOnly?: boolean;
  /** Campos de colecionáveis (a marca é comparada sem diferenciar maiúsculas). */
  brand?: string;
  scale?: string;
  /** Série ou coleção (comparada sem diferenciar maiúsculas nem espaços nas pontas). */
  series?: string;
  condition?: ProductCondition;
  /**
   * Tipo do produto, definido pelo tipo da categoria dele (CARROS, COLECIONAVEL ou OUTROS). Sem categoria, vale o que está preenchido:
   * marca, escala, série ou condição = carros; nada disso = outros.
   */
  kind?: "carros" | "colecionavel" | "outros";
  page?: number;
  pageSize?: number;
};

export function buildSearchText(p: {
  name: string;
  shortDescription: string;
  description: string;
  tags: string[];
  sku: string | null;
  features: Array<{ label: string; value: string }>;
  brand?: string | null;
  model?: string | null;
  scale?: string | null;
  series?: string | null;
  releaseYear?: number | null;
  condition?: string | null;
  packagingState?: string | null;
}): string {
  return normalizeForSearch(
    [
      p.name,
      p.shortDescription,
      p.description,
      p.tags.join(" "),
      p.sku ?? "",
      p.features.map((f) => `${f.label} ${f.value}`).join(" "),
      p.brand ?? "",
      p.model ?? "",
      p.scale ?? "",
      p.series ?? "",
      p.releaseYear ?? "",
      conditionLabel(p.condition) ?? "",
      p.packagingState ?? "",
    ].join(" "),
  );
}

/** Tipo do produto = tipo da categoria; sem categoria, deduzido dos campos de colecionador. */
// Atenção: no `db.query` do Drizzle as colunas de OUTRA tabela são reescritas com o apelido da tabela principal,
// por isso a subconsulta usa nomes literais ("categories AS cat") em vez de `${categories.id}`.
const productKindSql = sql`COALESCE((SELECT cat.kind FROM categories AS cat WHERE cat.id = ${products.categoryId}), CASE WHEN (${products.brand} IS NOT NULL OR ${products.scale} IS NOT NULL OR ${products.condition} IS NOT NULL OR ${products.series} IS NOT NULL) THEN 'CARROS' ELSE 'OUTROS' END)`;

/** Produtos da categoria e de suas subcategorias (ver o aviso sobre o apelido de tabela acima). */
const categoryScopeSql = (id: string) =>
  sql`(${products.categoryId} = ${id} OR ${products.categoryId} IN (SELECT cat.id FROM categories AS cat WHERE cat.parent_id = ${id}))`;

/* ------------------------------ Loja pública ------------------------------ */

function publicConditions(f: ProductFilters): SQL[] {
  const conditions: SQL[] = [eq(products.active, true)];
  if (f.categoryId) conditions.push(categoryScopeSql(f.categoryId));
  if (f.onSale) conditions.push(sql`${products.salePriceCents} IS NOT NULL AND ${products.salePriceCents} < ${products.priceCents}`);
  if (f.inStock) conditions.push(gte(products.stock, 1));
  if (f.featuredOnly) conditions.push(eq(products.featured, true));
  if (f.minPriceCents !== undefined) conditions.push(sql`${effectivePriceSql} >= ${f.minPriceCents}`);
  if (f.maxPriceCents !== undefined) conditions.push(sql`${effectivePriceSql} <= ${f.maxPriceCents}`);
  if (f.brand) conditions.push(sql`lower(${products.brand}) = ${f.brand.trim().toLowerCase()}`);
  if (f.scale) conditions.push(eq(products.scale, f.scale));
  if (f.series) conditions.push(sql`lower(btrim(${products.series})) = ${f.series.trim().toLowerCase()}`);
  if (f.condition && PRODUCT_CONDITIONS.includes(f.condition)) conditions.push(eq(products.condition, f.condition));
  if (f.kind) conditions.push(sql`${productKindSql} = ${f.kind === "carros" ? "CARROS" : f.kind === "colecionavel" ? "COLECIONAVEL" : "OUTROS"}`);

  if (f.q) {
    // Cada palavra digitada precisa aparecer no texto do produto (sem acentos, sem maiúsculas).
    const tokens = normalizeForSearch(f.q).split(" ").filter(Boolean).slice(0, 6);
    for (const token of tokens) conditions.push(ilike(products.searchText, `%${escapeLike(token)}%`));
  }
  return conditions;
}

function orderByFor(sort: ProductSort | undefined) {
  switch (sort) {
    case "menor-preco":
      return [asc(effectivePriceSql), asc(products.name)];
    case "maior-preco":
      return [desc(effectivePriceSql), asc(products.name)];
    case "nome":
      return [asc(products.name)];
    case "recentes":
      return [desc(products.createdAt)];
    default:
      return [desc(products.featured), desc(products.createdAt)];
  }
}

export async function listPublicProducts(filters: ProductFilters = {}) {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(48, Math.max(1, filters.pageSize ?? 12));
  const where = and(...publicConditions(filters));

  const [items, [{ total }]] = await Promise.all([
    db.query.products.findMany({
      where,
      orderBy: orderByFor(filters.sort),
      limit: pageSize,
      offset: (page - 1) * pageSize,
      with: withRelations,
    }),
    db.select({ total: count() }).from(products).where(where),
  ]);

  return { items: items as ProductWithRelations[], total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getPublicProductBySlug(slug: string): Promise<ProductWithRelations | null> {
  const product = await db.query.products.findFirst({
    where: and(eq(products.slug, slug), eq(products.active, true)),
    with: withRelations,
  });
  return (product as ProductWithRelations | undefined) ?? null;
}

export async function listRelatedProducts(product: { id: string; categoryId: string | null }, limit = 4) {
  if (!product.categoryId) return [];
  const items = await db.query.products.findMany({
    where: and(eq(products.active, true), eq(products.categoryId, product.categoryId), ne(products.id, product.id)),
    orderBy: [desc(products.featured), desc(products.createdAt)],
    limit,
    with: withRelations,
  });
  return items as ProductWithRelations[];
}

export type CatalogFacets = {
  brands: Array<{ value: string; count: number }>;
  scales: Array<{ value: string; count: number }>;
  /** Séries/coleções que existem nos produtos publicados (o mesmo nome escrito com maiúsculas diferentes conta como um só). */
  series: Array<{ value: string; count: number }>;
  conditions: Array<{ value: ProductCondition; count: number }>;
  /** Quantos produtos publicados há de cada tipo (o filtro "Tipo de produto" só aparece se houver mais de um tipo). */
  kinds: { carros: number; colecionavel: number; outros: number };
};

/** Opções de filtro que existem de verdade nos produtos publicados (opcionalmente dentro de uma categoria). */
export async function listCatalogFacets(options: { categoryId?: string } = {}): Promise<CatalogFacets> {
  const where = and(eq(products.active, true), options.categoryId ? categoryScopeSql(options.categoryId) : undefined);
  const [brands, scales, series, conditions, kindRows] = await Promise.all([
    db
      .select({ value: sql<string>`min(${products.brand})`, count: count() })
      .from(products)
      .where(and(where, sql`${products.brand} IS NOT NULL`))
      .groupBy(sql`lower(${products.brand})`)
      .orderBy(sql`lower(min(${products.brand}))`),
    db
      .select({ value: sql<string>`${products.scale}`, count: count() })
      .from(products)
      .where(and(where, sql`${products.scale} IS NOT NULL`))
      .groupBy(products.scale)
      .orderBy(asc(products.scale)),
    db
      .select({ value: sql<string>`min(btrim(${products.series}))`, count: count() })
      .from(products)
      .where(and(where, sql`${products.series} IS NOT NULL AND btrim(${products.series}) <> ''`))
      .groupBy(sql`lower(btrim(${products.series}))`)
      .orderBy(sql`lower(min(btrim(${products.series})))`),
    db
      .select({ value: sql<string>`${products.condition}`, count: count() })
      .from(products)
      .where(and(where, sql`${products.condition} IS NOT NULL`))
      .groupBy(products.condition),
    db.select({ kind: sql<string>`${productKindSql}`, count: count() }).from(products).where(where).groupBy(productKindSql),
  ]);
  const kinds = { carros: 0, colecionavel: 0, outros: 0 };
  for (const row of kindRows) {
    if (row.kind === "CARROS") kinds.carros = row.count;
    else if (row.kind === "COLECIONAVEL") kinds.colecionavel = row.count;
    else kinds.outros += row.count;
  }
  return {
    kinds,
    brands,
    scales,
    series,
    conditions: conditions.filter((c): c is { value: ProductCondition; count: number } => PRODUCT_CONDITIONS.includes(c.value as ProductCondition)),
  };
}

export async function listProductSlugsForSitemap(): Promise<Array<{ slug: string; updatedAt: Date }>> {
  return db
    .select({ slug: products.slug, updatedAt: products.updatedAt })
    .from(products)
    .where(eq(products.active, true))
    .orderBy(desc(products.updatedAt));
}

/* ----------------------------- Painel (admin) ----------------------------- */

export type AdminProductStatus = "all" | "active" | "inactive" | "low" | "out" | "nophoto";
export type AdminProductSort = "recentes" | "nome" | "estoque";

export async function adminListProducts(
  options: { q?: string; status?: AdminProductStatus; categoryId?: string; sort?: AdminProductSort; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const pageSize = options.pageSize ?? 20;
  const conditions: SQL[] = [];

  if (options.status === "active") conditions.push(eq(products.active, true));
  if (options.status === "inactive") conditions.push(eq(products.active, false));
  if (options.status === "low") conditions.push(and(gte(products.stock, 1), lte(products.stock, products.lowStockThreshold)) as SQL);
  if (options.status === "out") conditions.push(eq(products.stock, 0));
  if (options.status === "nophoto") conditions.push(sql`not exists (select 1 from product_images pi where pi.product_id = "products"."id")`);
  if (options.categoryId) conditions.push(eq(products.categoryId, options.categoryId));
  if (options.q) {
    for (const token of normalizeForSearch(options.q).split(" ").filter(Boolean).slice(0, 6)) {
      conditions.push(ilike(products.searchText, `%${escapeLike(token)}%`));
    }
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db.query.products.findMany({
      where,
      orderBy: options.sort === "nome" ? [asc(products.name)] : options.sort === "estoque" ? [asc(products.stock), asc(products.name)] : [desc(products.createdAt)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      with: withRelations,
    }),
    db.select({ total: count() }).from(products).where(where),
  ]);

  return { items: items as ProductWithRelations[], total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getProductById(id: string): Promise<ProductWithRelations | null> {
  const product = await db.query.products.findFirst({ where: eq(products.id, id), with: withRelations });
  return (product as ProductWithRelations | undefined) ?? null;
}

export async function listProductsForSelect() {
  return db
    .select({ id: products.id, name: products.name, stock: products.stock, active: products.active, sku: products.sku })
    .from(products)
    .orderBy(asc(products.name));
}

/* ------------------------------ Escrita ------------------------------ */

async function assertCategoryExists(categoryId: string | null): Promise<void> {
  if (!categoryId) return;
  const [category] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (!category) throw new ValidationError({ categoryId: "Categoria não encontrada." });
}

async function uniqueProductSlug(tx: Tx, name: string, attempt: number): Promise<string> {
  const base = slugify(name, 70);
  // Em novas tentativas (corrida entre dois cadastros), acrescenta um sufixo aleatório.
  if (attempt > 0) return `${base}-${randomBytes(3).toString("hex")}`;
  for (let i = 1; i < 500; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const [existing] = await tx.select({ id: products.id }).from(products).where(eq(products.slug, candidate)).limit(1);
    if (!existing) return candidate;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

/**
 * Liga as fotos enviadas ao produto, define a ordem e remove as que saíram da lista.
 * Só aceita fotos já anexadas a este produto ou "soltas" (recém-enviadas):
 * não dá para roubar a foto de outro produto passando o id dela.
 */
async function syncImages(tx: Tx, productId: string, imageIds: string[]): Promise<ProductImage[]> {
  const wanted = [...new Set(imageIds)];
  const current = await tx.select().from(productImages).where(eq(productImages.productId, productId));
  const currentIds = new Set(current.map((i) => i.id));

  const toAttach = wanted.filter((id) => !currentIds.has(id));
  if (toAttach.length > 0) {
    const attached = await tx
      .update(productImages)
      .set({ productId })
      .where(and(inArray(productImages.id, toAttach), isNull(productImages.productId)))
      .returning({ id: productImages.id });
    if (attached.length !== toAttach.length) {
      throw new ValidationError({ imageIds: "Uma das fotos enviadas não foi encontrada. Envie a foto novamente." });
    }
  }

  for (const [position, id] of wanted.entries()) {
    await tx
      .update(productImages)
      .set({ position })
      .where(and(eq(productImages.id, id), eq(productImages.productId, productId)));
  }

  const removed = current.filter((i) => !wanted.includes(i.id));
  if (removed.length > 0) {
    await tx.delete(productImages).where(
      inArray(
        productImages.id,
        removed.map((i) => i.id),
      ),
    );
  }
  return removed;
}

/** Converte os dados validados nas colunas da tabela (também usado pela importação de planilha). */
export function toRow(input: ProductInput) {
  return {
    name: input.name,
    sku: input.sku,
    shortDescription: input.shortDescription,
    description: input.description,
    priceCents: input.priceCents,
    salePriceCents: input.salePriceCents,
    lowStockThreshold: input.lowStockThreshold,
    active: input.active,
    featured: input.featured,
    categoryId: input.categoryId,
    features: input.features,
    tags: input.tags,
    promoText: input.promoText,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    weightGrams: input.weightGrams,
    lengthCm: input.lengthCm,
    widthCm: input.widthCm,
    heightCm: input.heightCm,
    // Normaliza também aqui (e não só no formulário): "hot wheels" e "Hot Wheels" têm que cair na mesma marca nos filtros.
    brand: input.brand ? normalizeBrand(input.brand) : null,
    model: input.model,
    scale: input.scale ? normalizeScale(input.scale) : null,
    series: input.series,
    releaseYear: input.releaseYear,
    condition: input.condition,
    packagingState: input.packagingState,
    conservationNotes: input.conservationNotes,
    searchText: buildSearchText({
      ...input,
      brand: input.brand ? normalizeBrand(input.brand) : null,
      scale: input.scale ? normalizeScale(input.scale) : null,
    }),
  };
}

export async function createProduct(input: ProductInput, actorId: string | null): Promise<Product> {
  await assertCategoryExists(input.categoryId);

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const slug = await uniqueProductSlug(tx, input.name, attempt);
        const [product] = await tx
          .insert(products)
          .values({ ...toRow(input), slug, stock: input.stock })
          .returning();

        await syncImages(tx, product.id, input.imageIds);

        if (input.stock > 0) {
          await tx.insert(stockMovements).values({
            productId: product.id,
            productName: product.name,
            type: "CADASTRO",
            quantityChange: input.stock,
            stockAfter: input.stock,
            reason: "Estoque inicial",
            userId: actorId,
          });
        }
        return product;
      });
    } catch (error) {
      if (isUniqueViolation(error, "products_sku_unique")) {
        throw new ValidationError({ sku: "Já existe um produto com este SKU." });
      }
      if (isUniqueViolation(error, "products_slug_unique") && attempt < 3) continue;
      throw error;
    }
  }
  throw new Error("Não foi possível gerar um endereço (slug) único para o produto.");
}

/**
 * Atualiza os dados do produto. O ESTOQUE não é alterado aqui: ele só muda por vendas
 * ou por ajustes registrados em `adjustStock`, para nunca existir quantidade sem histórico.
 * O slug (endereço na loja) também não muda ao renomear, para não quebrar links e SEO.
 */
export async function updateProduct(id: string, input: ProductInput): Promise<Product> {
  await assertCategoryExists(input.categoryId);

  try {
    const { updated, removed } = await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: products.id }).from(products).where(eq(products.id, id)).for("update");
      if (!existing) throw new NotFoundError("Produto não encontrado.");

      const [row] = await tx.update(products).set(toRow(input)).where(eq(products.id, id)).returning();
      const removedImages = await syncImages(tx, id, input.imageIds);
      return { updated: row, removed: removedImages };
    });
    await deleteImageFiles(removed);
    return updated;
  } catch (error) {
    if (isUniqueViolation(error, "products_sku_unique")) {
      throw new ValidationError({ sku: "Já existe um produto com este SKU." });
    }
    throw error;
  }
}

export async function setProductActive(id: string, active: boolean): Promise<void> {
  const updated = await db.update(products).set({ active }).where(eq(products.id, id)).returning({ id: products.id });
  if (updated.length === 0) throw new NotFoundError("Produto não encontrado.");
}

/** Exclui o produto. Pedidos antigos continuam com nome/preço guardados (histórico preservado). */
export async function deleteProduct(id: string): Promise<void> {
  const images = await db.transaction(async (tx) => {
    const [pending] = await tx
      .select({ orderId: orderItems.orderId })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orderItems.productId, id), inArray(orders.status, [...AWAITING_PAYMENT_STATUSES])))
      .limit(1);
    if (pending) {
      throw new BusinessRuleError(
        "Há pedidos aguardando pagamento com este produto. Desative o produto em vez de excluir, ou espere esses pedidos serem pagos ou expirarem.",
      );
    }

    const imgs = await tx.select().from(productImages).where(eq(productImages.productId, id));
    const deleted = await tx.delete(products).where(eq(products.id, id)).returning({ id: products.id });
    if (deleted.length === 0) throw new NotFoundError("Produto não encontrado.");
    return imgs;
  });
  await deleteImageFiles(images);
}

export async function countProducts() {
  const [row] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where ${products.active} = true)::int`,
      outOfStock: sql<number>`count(*) filter (where ${products.stock} = 0)::int`,
    })
    .from(products);
  return row;
}

/** Produtos publicados sem nenhuma foto (aviso no painel). */
export async function countActiveWithoutImages(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(products)
    .where(
      and(
        eq(products.active, true),
        sql`NOT EXISTS (SELECT 1 FROM ${productImages} WHERE ${productImages.productId} = ${products.id})`,
      ),
    );
  return row.n;
}

