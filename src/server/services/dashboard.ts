import { and, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { AWAITING_PAYMENT_STATUSES, PAID_ORDER_STATUSES } from "@/lib/constants";
import { db } from "../db";
import { orderItems, orders, users } from "../db/schema";
import { listLowStockProducts } from "./inventory";
import { countActiveWithoutImages, countProducts } from "./products";

const TZ = "America/Sao_Paulo";
const paid = [...PAID_ORDER_STATUSES];
const awaiting = [...AWAITING_PAYMENT_STATUSES];

/** Dia (no fuso de São Paulo) em que o pedido foi pago. */
const paidDay = sql`((${orders.paidAt} AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::date`;
const todaySp = sql`((now() AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::date`;

export type DailySales = { day: string; revenueCents: number; orders: number };

/**
 * Números do painel. "Faturamento" e "vendas" contam somente pedidos PAGOS
 * (pago, em separação, enviado ou entregue). Cancelados e reembolsados ficam de fora.
 */
export async function getDashboardStats() {
  const [totals] = await db
    .select({
      revenueCents: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int`,
      orders: count(),
      today: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${paidDay} = ${todaySp}), 0)::int`,
      todayOrders: sql<number>`count(*) filter (where ${paidDay} = ${todaySp})::int`,
      last7: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${paidDay} > ${todaySp} - 7), 0)::int`,
      last30: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${paidDay} > ${todaySp} - 30), 0)::int`,
      last30Orders: sql<number>`count(*) filter (where ${paidDay} > ${todaySp} - 30)::int`,
    })
    .from(orders)
    .where(and(inArray(orders.status, paid), isNotNull(orders.paidAt)));

  const [pending] = await db.select({ n: count() }).from(orders).where(inArray(orders.status, awaiting));
  const [toShip] = await db.select({ n: count() }).from(orders).where(inArray(orders.status, ["PAGO", "PROCESSANDO"]));
  const [attention] = await db.select({ n: count() }).from(orders).where(isNotNull(orders.attentionNote));
  const [customers] = await db.select({ n: count() }).from(users).where(eq(users.role, "CLIENTE"));

  const daily = (await db.execute(sql`
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
           coalesce(sum(o.total_cents), 0)::int AS "revenueCents",
           count(o.id)::int AS orders
    FROM generate_series(${todaySp} - 13, ${todaySp}, interval '1 day') AS d(day)
    LEFT JOIN orders o
      ON ((o.paid_at AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::date = d.day::date
     AND o.status IN (${sql.join(paid.map((s) => sql`${s}`), sql`, `)})
    GROUP BY d.day
    ORDER BY d.day
  `)).rows as DailySales[];

  const topProducts = await db
    .select({
      name: orderItems.name,
      quantity: sql<number>`sum(${orderItems.quantity})::int`,
      revenueCents: sql<number>`sum(${orderItems.totalCents})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(inArray(orders.status, paid), sql`${paidDay} > ${todaySp} - 30`))
    .groupBy(orderItems.name)
    .orderBy(desc(sql`sum(${orderItems.quantity})`))
    .limit(5);

  const recentOrders = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(8);

  return {
    revenueCents: totals.revenueCents,
    paidOrders: totals.orders,
    averageTicketCents: totals.orders > 0 ? Math.round(totals.revenueCents / totals.orders) : 0,
    todayCents: totals.today,
    todayOrders: totals.todayOrders,
    last7Cents: totals.last7,
    last30Cents: totals.last30,
    last30Orders: totals.last30Orders,
    pendingOrders: pending.n,
    ordersToShip: toShip.n,
    ordersNeedingAttention: attention.n,
    customers: customers.n,
    products: await countProducts(),
    activeWithoutImages: await countActiveWithoutImages(),
    lowStock: await listLowStockProducts(8),
    daily,
    topProducts,
    recentOrders,
  };
}

export type DashboardStats = Awaited<ReturnType<typeof getDashboardStats>>;
