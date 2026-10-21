import { and, asc, eq, sql } from "drizzle-orm";
import { SUGGESTED_CATEGORIES } from "@/lib/categories";
import { slugify } from "@/lib/text";
import type { CategoryInput } from "@/lib/schemas";
import { db, type DbOrTx } from "../db";
import { categories, products, type Category } from "../db/schema";
import { BusinessRuleError, isUniqueViolation, NotFoundError, ValidationError } from "../errors";

export async function listCategories(options: { onlyActive?: boolean } = {}): Promise<Category[]> {
  return db
    .select()
    .from(categories)
    .where(options.onlyActive ? eq(categories.active, true) : undefined)
    .orderBy(asc(categories.position), asc(categories.name));
}

/** Categorias com a quantidade de produtos PUBLICADOS em cada uma (para menus e a home). */
export async function listCategoriesWithCounts(options: { onlyActive?: boolean } = {}) {
  const rows = await db
    .select({
      category: categories,
      productCount: sql<number>`count(${products.id}) filter (where ${products.active} = true)::int`,
    })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .where(options.onlyActive ? eq(categories.active, true) : undefined)
    .groupBy(categories.id)
    .orderBy(asc(categories.position), asc(categories.name));
  return rows.map((r) => ({ ...r.category, productCount: r.productCount }));
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const [category] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  return category ?? null;
}

export async function getCategoryById(id: string): Promise<Category | null> {
  const [category] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return category ?? null;
}

async function uniqueCategorySlug(executor: DbOrTx, name: string, excludeId?: string): Promise<string> {
  const base = slugify(name, 60);
  for (let i = 1; i < 200; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const [existing] = await executor
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, candidate))
      .limit(1);
    if (!existing || existing.id === excludeId) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/**
 * Valida a categoria-mãe (só um nível de subcategorias) e define o tipo: a subcategoria sempre herda o tipo da mãe.
 * `selfId` é a categoria que está sendo editada (se for o caso).
 */
async function resolveKindAndParent(input: CategoryInput, selfId?: string): Promise<{ kind: CategoryInput["kind"]; parentId: string | null }> {
  if (!input.parentId) return { kind: input.kind, parentId: null };
  if (input.parentId === selfId) throw new ValidationError({ parentId: "Uma categoria não pode ser subcategoria dela mesma." });
  const parent = await getCategoryById(input.parentId);
  if (!parent) throw new ValidationError({ parentId: "Categoria-mãe não encontrada." });
  if (parent.parentId) throw new ValidationError({ parentId: "Escolha uma categoria principal como mãe (só há um nível de subcategorias)." });
  if (selfId) {
    const [child] = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, selfId)).limit(1);
    if (child) throw new ValidationError({ parentId: "Esta categoria tem subcategorias, então não pode virar subcategoria de outra." });
  }
  return { kind: parent.kind as CategoryInput["kind"], parentId: parent.id };
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  const { kind, parentId } = await resolveKindAndParent(input);
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = await uniqueCategorySlug(db, input.name);
    try {
      const [category] = await db
        .insert(categories)
        .values({
          name: input.name,
          slug,
          description: input.description,
          position: input.position,
          active: input.active,
          kind,
          parentId,
          isCollectible: kind !== "OUTROS",
        })
        .returning();
      return category;
    } catch (error) {
      // Duas criações simultâneas escolheram o mesmo slug: tenta de novo.
      if (!isUniqueViolation(error) || attempt === 2) throw error;
    }
  }
  throw new Error("Não foi possível gerar um endereço único para a categoria.");
}

/** O slug (endereço da categoria na loja) não muda ao renomear, para não quebrar links. */
export async function updateCategory(id: string, input: CategoryInput): Promise<Category> {
  const { kind, parentId } = await resolveKindAndParent(input, id);
  return db.transaction(async (tx) => {
    const [category] = await tx
      .update(categories)
      .set({
        name: input.name,
        description: input.description,
        position: input.position,
        active: input.active,
        kind,
        parentId,
        isCollectible: kind !== "OUTROS",
      })
      .where(eq(categories.id, id))
      .returning();
    if (!category) throw new NotFoundError("Categoria não encontrada.");
    // As subcategorias acompanham o tipo da categoria-mãe.
    await tx.update(categories).set({ kind, isCollectible: kind !== "OUTROS" }).where(eq(categories.parentId, id));
    return category;
  });
}

/** Os produtos da categoria excluída ficam sem categoria (não são apagados). Categoria com subcategorias não pode ser excluída. */
export async function deleteCategory(id: string): Promise<void> {
  const [child] = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, id)).limit(1);
  if (child) throw new BusinessRuleError("Esta categoria tem subcategorias. Exclua ou mova as subcategorias primeiro.");
  const removed = await db.delete(categories).where(eq(categories.id, id)).returning({ id: categories.id });
  if (removed.length === 0) throw new NotFoundError("Categoria não encontrada.");
}

/** Ids da categoria e de suas subcategorias (para listar na categoria-mãe os produtos das filhas). */
export async function categoryAndChildrenIds(id: string): Promise<string[]> {
  const rows = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, id));
  return [id, ...rows.map((r) => r.id)];
}

/**
 * Cria a estrutura sugerida (Miniaturas de carros > Hot Wheels, Mini GT, Matchbox...; Bonecos e colecionáveis...).
 * Idempotente: pelo NOME, só cria o que ainda não existe e nunca altera ou apaga categorias existentes.
 */
export async function ensureSuggestedCategories(): Promise<{ created: number }> {
  let created = 0;
  let position = 0;
  const findByName = async (name: string, parentId: string | null) => {
    const [row] = await db
      .select()
      .from(categories)
      .where(and(sql`lower(${categories.name}) = ${name.toLowerCase()}`, parentId ? eq(categories.parentId, parentId) : sql`${categories.parentId} IS NULL`))
      .limit(1);
    return row;
  };
  for (const root of SUGGESTED_CATEGORIES) {
    position += 10;
    let parent = await findByName(root.name, null);
    if (!parent) {
      parent = await createCategory({ name: root.name, description: root.description, position, active: true, kind: root.kind, parentId: null });
      created++;
    }
    let childPosition = 0;
    for (const child of root.children) {
      childPosition += 1;
      if (await findByName(child.name, parent.id)) continue;
      await createCategory({ name: child.name, description: child.description, position: position + childPosition, active: true, kind: root.kind, parentId: parent.id });
      created++;
    }
  }
  return { created };
}

/** A categoria com a categoria-mãe (se houver) e as subcategorias que têm produto publicado, para a página da categoria. */
export async function getCategoryContext(slug: string) {
  const category = await getCategoryBySlug(slug);
  if (!category || !category.active) return null;
  const all = await listCategoriesWithCounts({ onlyActive: true });
  const parent = category.parentId ? (all.find((c) => c.id === category.parentId) ?? null) : null;
  const children = all.filter((c) => c.parentId === category.id && c.productCount > 0);
  return { category, parent, children };
}
