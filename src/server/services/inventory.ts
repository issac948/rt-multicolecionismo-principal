import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db, type Tx } from "../db";
import { orderItems, orders, products, stockMovements, users } from "../db/schema";
import { BusinessRuleError, InsufficientStockError, NotFoundError } from "../errors";
import { reacquireCouponForOrder, releaseCouponForOrder } from "./coupons";

export type StockLine = { productId: string; quantity: number };

/**
 * Sempre processamos os produtos em ordem fixa (por id). Dois pedidos simultâneos
 * com os mesmos produtos travam as linhas na mesma ordem, o que evita deadlock.
 */
function sortedLines(lines: StockLine[]): StockLine[] {
  const merged = new Map<string, number>();
  for (const line of lines) merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity);
  return [...merged.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
}

/**
 * Baixa o estoque dos itens de um pedido DENTRO da transação do pedido.
 *
 * A baixa é um único UPDATE condicional ("estoque >= quantidade"). O PostgreSQL trava a
 * linha durante o UPDATE e reavalia a condição depois da trava, então duas compras
 * simultâneas do último item nunca conseguem as duas: a segunda não atualiza nenhuma
 * linha e recebe InsufficientStockError. Se qualquer item falhar, a transação inteira
 * é desfeita e nenhum estoque é perdido.
 */
export async function reserveStock(tx: Tx, lines: StockLine[], orderId: string): Promise<void> {
  for (const line of sortedLines(lines)) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new BusinessRuleError("Quantidade inválida.");
    }

    const [row] = await tx
      .update(products)
      .set({ stock: sql`${products.stock} - ${line.quantity}` })
      .where(and(eq(products.id, line.productId), eq(products.active, true), gte(products.stock, line.quantity)))
      .returning({ stock: products.stock, name: products.name });

    if (!row) {
      const [product] = await tx
        .select({ name: products.name, stock: products.stock, active: products.active })
        .from(products)
        .where(eq(products.id, line.productId));
      throw new InsufficientStockError(
        line.productId,
        product?.name ?? "Produto indisponível",
        product?.active ? product.stock : 0,
      );
    }

    await tx.insert(stockMovements).values({
      productId: line.productId,
      productName: row.name,
      type: "VENDA",
      quantityChange: -line.quantity,
      stockAfter: row.stock,
      orderId,
      reason: "Venda",
    });
  }
}

/**
 * Devolve ao estoque os itens de um pedido cancelado/expirado/reembolsado.
 * Idempotente: usa `orders.stock_released_at` (sob trava da linha do pedido) para
 * garantir que o estoque volta UMA única vez, mesmo com webhooks repetidos.
 * Devolve true se devolveu agora, false se já tinha sido devolvido.
 */
export async function restoreStockForOrder(
  tx: Tx,
  orderId: string,
  reason: string,
  actorId: string | null = null,
): Promise<boolean> {
  const [order] = await tx
    .select({ releasedAt: orders.stockReleasedAt })
    .from(orders)
    .where(eq(orders.id, orderId))
    .for("update");
  if (!order) throw new NotFoundError("Pedido não encontrado.");
  if (order.releasedAt) return false;

  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const lines = sortedLines(
    items.filter((i): i is typeof i & { productId: string } => i.productId !== null).map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
    })),
  );

  for (const line of lines) {
    const [row] = await tx
      .update(products)
      .set({ stock: sql`${products.stock} + ${line.quantity}` })
      .where(eq(products.id, line.productId))
      .returning({ stock: products.stock, name: products.name });
    if (!row) continue; // produto foi excluído: não há onde devolver

    await tx.insert(stockMovements).values({
      productId: line.productId,
      productName: row.name,
      type: "RESTAURACAO",
      quantityChange: line.quantity,
      stockAfter: row.stock,
      orderId,
      userId: actorId,
      reason,
    });
  }

  await tx.update(orders).set({ stockReleasedAt: new Date() }).where(eq(orders.id, orderId));
  // O cupom usado por este pedido volta a ficar disponível (limite de usos).
  await releaseCouponForOrder(tx, orderId);
  return true;
}

/**
 * Pagamento aprovado depois de o pedido ter sido cancelado/expirado (estoque já devolvido):
 * tenta reservar o estoque de novo. Usa um savepoint, então se faltar estoque nada é alterado.
 */
export async function tryReacquireStockForOrder(tx: Tx, orderId: string): Promise<boolean> {
  try {
    await tx.transaction(async (savepoint) => {
      const items = await savepoint.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      if (items.some((i) => i.productId === null)) {
        throw new BusinessRuleError("Um dos produtos do pedido foi excluído da loja.");
      }
      await reserveStock(
        savepoint,
        items.map((i) => ({ productId: i.productId as string, quantity: i.quantity })),
        orderId,
      );
      await savepoint.update(orders).set({ stockReleasedAt: null }).where(eq(orders.id, orderId));
      await reacquireCouponForOrder(savepoint, orderId);
    });
    return true;
  } catch (error) {
    if (error instanceof InsufficientStockError || error instanceof BusinessRuleError) return false;
    throw error;
  }
}

/* ---------------------- Ajustes manuais (painel) ---------------------- */

export type StockAdjustMode = "ENTRADA" | "SAIDA" | "DEFINIR";

export async function adjustStock(input: {
  productId: string;
  mode: StockAdjustMode;
  quantity: number;
  reason: string | null;
  actorId: string | null;
}): Promise<{ before: number; after: number; changed: boolean; productName: string }> {
  return db.transaction(async (tx) => {
    const [product] = await tx
      .select({ id: products.id, name: products.name, stock: products.stock })
      .from(products)
      .where(eq(products.id, input.productId))
      .for("update");
    if (!product) throw new NotFoundError("Produto não encontrado.");

    const next =
      input.mode === "ENTRADA"
        ? product.stock + input.quantity
        : input.mode === "SAIDA"
          ? product.stock - input.quantity
          : input.quantity;

    if (next < 0) {
      throw new BusinessRuleError(
        `Não é possível retirar ${input.quantity} unidade(s): só há ${product.stock} em estoque.`,
      );
    }
    if (next > 1_000_000) throw new BusinessRuleError("Estoque acima do limite permitido.");

    const change = next - product.stock;
    if (change === 0) return { before: product.stock, after: next, changed: false, productName: product.name };

    await tx.update(products).set({ stock: next }).where(eq(products.id, product.id));
    await tx.insert(stockMovements).values({
      productId: product.id,
      productName: product.name,
      type: input.mode === "ENTRADA" ? "ENTRADA" : "AJUSTE",
      quantityChange: change,
      stockAfter: next,
      reason: input.reason,
      userId: input.actorId,
    });
    return { before: product.stock, after: next, changed: true, productName: product.name };
  });
}

/* ------------------------------ Consultas ------------------------------ */

/** Produtos publicados com estoque no limite de alerta (ou zerado). */
export async function listLowStockProducts(limit = 10) {
  return db
    .select({
      id: products.id,
      name: products.name,
      stock: products.stock,
      lowStockThreshold: products.lowStockThreshold,
    })
    .from(products)
    .where(and(eq(products.active, true), lte(products.stock, products.lowStockThreshold)))
    .orderBy(asc(products.stock), asc(products.name))
    .limit(limit);
}

export async function listStockMovements(options: { productId?: string; page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = options.pageSize ?? 25;
  const where = options.productId ? eq(stockMovements.productId, options.productId) : undefined;

  const rows = await db
    .select({
      id: stockMovements.id,
      createdAt: stockMovements.createdAt,
      productId: stockMovements.productId,
      productName: stockMovements.productName,
      type: stockMovements.type,
      quantityChange: stockMovements.quantityChange,
      stockAfter: stockMovements.stockAfter,
      reason: stockMovements.reason,
      orderId: stockMovements.orderId,
      userName: users.name,
    })
    .from(stockMovements)
    .leftJoin(users, eq(users.id, stockMovements.userId))
    .where(where)
    .orderBy(desc(stockMovements.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(stockMovements)
    .where(where);

  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
