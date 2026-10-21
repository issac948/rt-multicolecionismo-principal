import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { categories, orderItems, products } from "../db/schema";
import { BusinessRuleError } from "../errors";
import { deleteProduct } from "./products";

/**
 * Produtos de DEMONSTRAÇÃO, identificados de forma exata para nunca tocar em produto real:
 *  - os novos: SKU começa com "DEMO-" (criados por `npm run db:seed`);
 *  - os antigos (carrinhos de feira, bebê, carga...): nome idêntico a um dos nove do seed antigo E descrição curta
 *    começando com "Produto de demonstração".
 */
const LEGACY_DEMO_NAMES = [
  "Carrinho Infantil Vermelho",
  "Carrinho Infantil Azul",
  "Carrinho de Bebê Dobrável",
  "Carrinho de Bebê Passeio Leve",
  "Carrinho de Carga Reforçado",
  "Carrinho Plataforma Dobrável",
  "Carrinho de Feira com Rodinhas",
  "Carrinho de Feira Dobrável Compacto",
  "Carrinho Utilitário (rascunho)",
];
const LEGACY_DEMO_CATEGORIES = ["Carrinhos infantis", "Carrinhos de bebê", "Carrinhos de carga", "Carrinhos de feira"];

const isDemoSql = sql`(${products.sku} LIKE 'DEMO-%' OR (${products.name} IN (${sql.join(LEGACY_DEMO_NAMES.map((n) => sql`${n}`), sql`, `)}) AND ${products.shortDescription} LIKE 'Produto de demonstração%'))`;

export async function countDemoProducts(): Promise<{ total: number; published: number }> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      published: sql<number>`count(*) filter (where ${products.active} = true)::int`,
    })
    .from(products)
    .where(isDemoSql);
  return row;
}

/**
 * Remove os produtos de demonstração. Os que já aparecem em algum pedido NÃO são apagados (o histórico
 * dos pedidos fica intacto): só são ocultados da loja. As categorias antigas de demonstração que ficarem vazias são apagadas.
 */
export async function removeDemoProducts(): Promise<{ deleted: number; hidden: number; categoriesDeleted: number }> {
  const demo = await db.select({ id: products.id }).from(products).where(isDemoSql);
  let deleted = 0;
  let hidden = 0;

  for (const { id } of demo) {
    const [used] = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.productId, id)).limit(1);
    if (used) {
      await db.update(products).set({ active: false }).where(eq(products.id, id));
      hidden++;
      continue;
    }
    try {
      await deleteProduct(id);
      deleted++;
    } catch (error) {
      if (!(error instanceof BusinessRuleError)) throw error;
      await db.update(products).set({ active: false }).where(eq(products.id, id));
      hidden++;
    }
  }

  const empty = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        inArray(categories.name, LEGACY_DEMO_CATEGORIES),
        sql`NOT EXISTS (SELECT 1 FROM products p WHERE p.category_id = categories.id)`,
      ),
    );
  if (empty.length > 0) {
    await db.delete(categories).where(inArray(categories.id, empty.map((c) => c.id)));
  }
  return { deleted, hidden, categoriesDeleted: empty.length };
}

