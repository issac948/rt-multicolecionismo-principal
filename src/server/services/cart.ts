import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { MAX_CART_LINE_QUANTITY } from "@/lib/constants";
import { effectivePriceCents } from "@/lib/money";
import { db } from "../db";
import { cartItems, carts, productImages, products } from "../db/schema";
import { BusinessRuleError, NotFoundError } from "../errors";

export type CartLine = {
  itemId: string;
  productId: string;
  slug: string;
  name: string;
  thumbKey: string | null;
  unitPriceCents: number;
  originalPriceCents: number;
  quantity: number;
  stock: number;
  lineTotalCents: number;
  /** Peso e medidas do produto (usados no cálculo do frete); null = não cadastrado. */
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  /** Mensagem quando a linha não pode ser comprada como está (sem estoque, desativado...). */
  issue: string | null;
};

export type CartView = {
  cartId: string | null;
  lines: CartLine[];
  subtotalCents: number;
  itemCount: number;
  hasIssues: boolean;
};

const EMPTY_CART: CartView = { cartId: null, lines: [], subtotalCents: 0, itemCount: 0, hasIssues: false };

/* ------------------------------ Resolução ------------------------------ */

export async function getOrCreateUserCart(userId: string): Promise<string> {
  const [existing] = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, userId)).limit(1);
  if (existing) return existing.id;
  // onConflictDoNothing: duas abas criando o carrinho ao mesmo tempo não geram erro.
  await db.insert(carts).values({ userId }).onConflictDoNothing();
  const [created] = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, userId)).limit(1);
  return created.id;
}

export async function getUserCartId(userId: string): Promise<string | null> {
  const [row] = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, userId)).limit(1);
  return row?.id ?? null;
}

/** Só aceita como "carrinho de visitante" um carrinho que não pertence a nenhuma conta. */
export async function isGuestCart(cartId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: carts.id })
    .from(carts)
    .where(and(eq(carts.id, cartId), isNull(carts.userId)))
    .limit(1);
  return Boolean(row);
}

export async function createGuestCart(): Promise<string> {
  const [row] = await db.insert(carts).values({}).returning({ id: carts.id });
  return row.id;
}

/* ------------------------------ Leitura ------------------------------ */

export async function getCartView(cartId: string | null): Promise<CartView> {
  if (!cartId) return EMPTY_CART;

  const rows = await db
    .select({
      itemId: cartItems.id,
      quantity: cartItems.quantity,
      productId: products.id,
      slug: products.slug,
      name: products.name,
      priceCents: products.priceCents,
      salePriceCents: products.salePriceCents,
      stock: products.stock,
      active: products.active,
      weightGrams: products.weightGrams,
      lengthCm: products.lengthCm,
      widthCm: products.widthCm,
      heightCm: products.heightCm,
      thumbKey: sql<string | null>`(
        SELECT ${productImages.thumbKey} FROM ${productImages}
        WHERE ${productImages.productId} = ${products.id}
        ORDER BY ${productImages.position} ASC LIMIT 1
      )`,
    })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(cartItems.createdAt), asc(cartItems.id));

  const lines: CartLine[] = rows.map((r) => {
    const unit = effectivePriceCents({ priceCents: r.priceCents, salePriceCents: r.salePriceCents });
    let issue: string | null = null;
    if (!r.active) issue = "Este produto não está mais disponível.";
    else if (r.stock <= 0) issue = "Produto sem estoque.";
    else if (r.quantity > r.stock) issue = `Só temos ${r.stock} unidade(s) em estoque.`;

    return {
      itemId: r.itemId,
      productId: r.productId,
      slug: r.slug,
      name: r.name,
      thumbKey: r.thumbKey,
      unitPriceCents: unit,
      originalPriceCents: r.priceCents,
      quantity: r.quantity,
      stock: r.stock,
      lineTotalCents: unit * r.quantity,
      weightGrams: r.weightGrams,
      lengthCm: r.lengthCm,
      widthCm: r.widthCm,
      heightCm: r.heightCm,
      issue,
    };
  });

  return {
    cartId,
    lines,
    subtotalCents: lines.reduce((sum, l) => sum + l.lineTotalCents, 0),
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    hasIssues: lines.some((l) => l.issue !== null),
  };
}

export async function getCartItemCount(cartId: string | null): Promise<number> {
  if (!cartId) return 0;
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${cartItems.quantity}), 0)::int` })
    .from(cartItems)
    .where(eq(cartItems.cartId, cartId));
  return row.n;
}

/* ------------------------------ Escrita ------------------------------ */

function stockMessage(available: number, inCart: number): string {
  if (available <= 0) return "Este produto está sem estoque no momento.";
  if (inCart > 0) return `Você já tem ${inCart} no carrinho e só temos ${available} em estoque.`;
  return `Só temos ${available} unidade(s) em estoque.`;
}

/** Adiciona ao carrinho respeitando o estoque. Lança erro com mensagem clara se não puder. */
export async function addToCart(cartId: string, productId: string, quantity: number): Promise<{ quantity: number }> {
  if (!Number.isInteger(quantity) || quantity < 1) throw new BusinessRuleError("Quantidade inválida.");

  return db.transaction(async (tx) => {
    const [product] = await tx
      .select({ id: products.id, stock: products.stock, active: products.active })
      .from(products)
      .where(eq(products.id, productId));
    if (!product || !product.active) throw new NotFoundError("Este produto não está disponível.");

    const [existing] = await tx
      .select({ id: cartItems.id, quantity: cartItems.quantity })
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId)));

    const inCart = existing?.quantity ?? 0;
    const next = inCart + quantity;
    if (next > product.stock) throw new BusinessRuleError(stockMessage(product.stock, inCart));
    if (next > MAX_CART_LINE_QUANTITY) {
      throw new BusinessRuleError(`Você pode comprar no máximo ${MAX_CART_LINE_QUANTITY} unidades de cada produto por pedido.`);
    }

    if (existing) {
      await tx.update(cartItems).set({ quantity: next }).where(eq(cartItems.id, existing.id));
    } else {
      await tx.insert(cartItems).values({ cartId, productId, quantity: next });
    }
    await tx.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
    return { quantity: next };
  });
}

/** Define a quantidade de um item do carrinho. Quantidade 0 remove o item. */
export async function setCartItemQuantity(cartId: string, itemId: string, quantity: number): Promise<void> {
  if (!Number.isInteger(quantity) || quantity < 0) throw new BusinessRuleError("Quantidade inválida.");

  await db.transaction(async (tx) => {
    const [item] = await tx
      .select({ id: cartItems.id, productId: cartItems.productId })
      .from(cartItems)
      .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)));
    if (!item) throw new NotFoundError("Item não encontrado no carrinho.");

    if (quantity === 0) {
      await tx.delete(cartItems).where(eq(cartItems.id, item.id));
      return;
    }

    const [product] = await tx
      .select({ stock: products.stock, active: products.active })
      .from(products)
      .where(eq(products.id, item.productId));
    if (!product || !product.active) throw new BusinessRuleError("Este produto não está mais disponível.");
    if (quantity > product.stock) throw new BusinessRuleError(stockMessage(product.stock, 0));
    if (quantity > MAX_CART_LINE_QUANTITY) {
      throw new BusinessRuleError(`Você pode comprar no máximo ${MAX_CART_LINE_QUANTITY} unidades de cada produto por pedido.`);
    }
    await tx.update(cartItems).set({ quantity }).where(eq(cartItems.id, item.id));
  });
}

export async function removeCartItem(cartId: string, itemId: string): Promise<void> {
  await db.delete(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)));
}

export async function clearCart(cartId: string): Promise<void> {
  await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
}

/**
 * Corrige o carrinho para algo comprável: remove produtos indisponíveis e reduz as
 * quantidades que passam do estoque. Devolve o que foi ajustado, para avisar o cliente.
 */
export async function normalizeCart(cartId: string): Promise<string[]> {
  const view = await getCartView(cartId);
  const messages: string[] = [];

  for (const line of view.lines) {
    if (!line.issue) continue;
    if (line.stock <= 0 || line.issue === "Este produto não está mais disponível.") {
      await db.delete(cartItems).where(eq(cartItems.id, line.itemId));
      messages.push(`"${line.name}" foi removido do carrinho (indisponível).`);
    } else if (line.quantity > line.stock) {
      await db.update(cartItems).set({ quantity: line.stock }).where(eq(cartItems.id, line.itemId));
      messages.push(`A quantidade de "${line.name}" foi reduzida para ${line.stock} (estoque disponível).`);
    }
  }
  return messages;
}

/**
 * Ao entrar na conta, junta o carrinho de visitante ao carrinho da conta.
 * Quantidades somadas respeitam o estoque e o limite por produto.
 */
export async function mergeGuestCartIntoUser(guestCartId: string, userId: string): Promise<void> {
  if (!(await isGuestCart(guestCartId))) return;
  const userCartId = await getOrCreateUserCart(userId);

  await db.transaction(async (tx) => {
    const guestItems = await tx.select().from(cartItems).where(eq(cartItems.cartId, guestCartId));
    if (guestItems.length > 0) {
      const productRows = await tx
        .select({ id: products.id, stock: products.stock, active: products.active })
        .from(products)
        .where(
          inArray(
            products.id,
            guestItems.map((i) => i.productId),
          ),
        );
      const productMap = new Map(productRows.map((p) => [p.id, p]));
      const userItems = await tx.select().from(cartItems).where(eq(cartItems.cartId, userCartId));
      const userMap = new Map(userItems.map((i) => [i.productId, i]));

      for (const item of guestItems) {
        const product = productMap.get(item.productId);
        if (!product || !product.active || product.stock <= 0) continue;
        const existing = userMap.get(item.productId);
        const target = Math.min(
          (existing?.quantity ?? 0) + item.quantity,
          product.stock,
          MAX_CART_LINE_QUANTITY,
        );
        if (existing) {
          await tx.update(cartItems).set({ quantity: target }).where(eq(cartItems.id, existing.id));
        } else {
          await tx.insert(cartItems).values({ cartId: userCartId, productId: item.productId, quantity: target });
        }
      }
    }
    await tx.delete(carts).where(and(eq(carts.id, guestCartId), isNull(carts.userId)));
  });
}
