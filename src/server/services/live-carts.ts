import { and, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { cartItems, carts } from "../db/schema";

/** Carrinho mexido nos últimos N minutos conta como "ativo agora". */
export const ACTIVE_CART_MINUTES = 30;
/** Carrinho com itens parado há mais que isso (até 7 dias) conta como abandonado. */
export const ABANDONED_WINDOW_DAYS = 7;

/**
 * Quantos OUTROS carrinhos ativos têm este produto agora (prova social real; sem nomes e sem dados pessoais).
 * Zero = não mostrar nada na loja.
 */
export async function getProductCartInterest(productId: string, excludeCartId: string | null = null): Promise<number> {
  const conditions = [
    eq(cartItems.productId, productId),
    gt(carts.updatedAt, sql`now() - make_interval(mins => ${ACTIVE_CART_MINUTES})`),
  ];
  if (excludeCartId) conditions.push(ne(carts.id, excludeCartId));
  const [row] = await db
    .select({ n: sql<number>`count(DISTINCT ${carts.id})::int` })
    .from(cartItems)
    .innerJoin(carts, eq(carts.id, cartItems.cartId))
    .where(and(...conditions));
  return row?.n ?? 0;
}

export interface LiveCart {
  id: string;
  customerName: string | null;
  customerEmail: string | null;
  updatedAt: Date;
  units: number;
  totalCents: number;
  items: Array<{ name: string; quantity: number }>;
}
export interface LiveCartsReport {
  active: LiveCart[];
  abandoned: LiveCart[];
  ranking: Array<{ productId: string; name: string; slug: string; carts: number; units: number }>;
  funnel: { cartsWithItems: number; ordersCreated: number; ordersPaid: number; days: number };
}

type CartRow = { id: string; updated_at: Date; name: string | null; email: string | null; units: number; total_cents: string | number; items: Array<{ name: string; quantity: number }> };

/** Painel do dono: carrinhos ativos e abandonados (com cliente, só no admin), ranking e funil. */
export async function getLiveCartsReport(): Promise<LiveCartsReport> {
  const effective = sql`(CASE WHEN p.sale_price_cents IS NOT NULL AND p.sale_price_cents < p.price_cents THEN p.sale_price_cents ELSE p.price_cents END)`;
  const cartRows = await db.execute(sql`
    SELECT c.id, c.updated_at, u.name, u.email,
      sum(ci.quantity)::int AS units,
      sum(ci.quantity * ${effective})::bigint AS total_cents,
      json_agg(json_build_object('name', p.name, 'quantity', ci.quantity) ORDER BY ci.created_at) AS items
    FROM carts c
    JOIN cart_items ci ON ci.cart_id = c.id
    JOIN products p ON p.id = ci.product_id
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.updated_at > now() - make_interval(days => ${ABANDONED_WINDOW_DAYS})
      AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = c.user_id AND o.created_at >= c.updated_at)
    GROUP BY c.id, u.name, u.email
    ORDER BY c.updated_at DESC
    LIMIT 200`);
  const activeSince = Date.now() - ACTIVE_CART_MINUTES * 60_000;
  const all: LiveCart[] = (cartRows.rows as CartRow[]).map((r) => ({
    id: r.id,
    customerName: r.name,
    customerEmail: r.email,
    updatedAt: new Date(r.updated_at),
    units: r.units,
    totalCents: Number(r.total_cents),
    items: r.items,
  }));

  const ranking = await db.execute(sql`
    SELECT p.id AS "productId", p.name, p.slug, count(DISTINCT c.id)::int AS carts, sum(ci.quantity)::int AS units
    FROM cart_items ci
    JOIN carts c ON c.id = ci.cart_id
    JOIN products p ON p.id = ci.product_id
    WHERE c.updated_at > now() - make_interval(mins => ${ACTIVE_CART_MINUTES})
    GROUP BY p.id, p.name, p.slug
    ORDER BY carts DESC, units DESC, p.name
    LIMIT 10`);

  const funnel = await db.execute(sql`
    SELECT
      (SELECT count(DISTINCT c.id) FROM carts c JOIN cart_items ci ON ci.cart_id = c.id
        WHERE c.updated_at > now() - make_interval(days => ${ABANDONED_WINDOW_DAYS}))::int AS carts_with_items,
      (SELECT count(*) FROM orders WHERE created_at > now() - make_interval(days => ${ABANDONED_WINDOW_DAYS}))::int AS orders_created,
      (SELECT count(*) FROM orders WHERE payment_status = 'APROVADO' AND created_at > now() - make_interval(days => ${ABANDONED_WINDOW_DAYS}))::int AS orders_paid`);
  const f = (funnel.rows[0] ?? {}) as { carts_with_items?: number; orders_created?: number; orders_paid?: number };

  return {
    active: all.filter((c) => c.updatedAt.getTime() >= activeSince),
    abandoned: all.filter((c) => c.updatedAt.getTime() < activeSince),
    ranking: ranking.rows as LiveCartsReport["ranking"],
    funnel: { cartsWithItems: f.carts_with_items ?? 0, ordersCreated: f.orders_created ?? 0, ordersPaid: f.orders_paid ?? 0, days: ABANDONED_WINDOW_DAYS },
  };
}
