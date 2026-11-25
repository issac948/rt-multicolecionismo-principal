import { sql } from "drizzle-orm";
import { MIN_DAYS_REGULAR_PRICE } from "@/lib/promotions";
import { db } from "../db";

/**
 * Faz `sale_price_cents` (o que a loja lê) acompanhar o relógio: liga a promoção quando a janela abre e desliga quando fecha.
 * Os gatilhos do banco gravam cada mudança no histórico de preços. Nunca lança.
 */
export async function applyScheduledPromotions(): Promise<{ started: number; ended: number }> {
  try {
    const started = await db.execute(sql`
      UPDATE products SET sale_price_cents = promo_price_cents
      WHERE promo_price_cents IS NOT NULL
        AND (sale_starts_at IS NULL OR sale_starts_at <= now())
        AND (sale_ends_at IS NULL OR sale_ends_at > now())
        AND sale_price_cents IS DISTINCT FROM promo_price_cents`);
    const ended = await db.execute(sql`
      UPDATE products SET sale_price_cents = NULL
      WHERE sale_price_cents IS NOT NULL
        AND (promo_price_cents IS NULL
             OR (sale_ends_at IS NOT NULL AND sale_ends_at <= now())
             OR (sale_starts_at IS NOT NULL AND sale_starts_at > now()))`);
    return { started: started.rowCount ?? 0, ended: ended.rowCount ?? 0 };
  } catch (error) {
    console.error("[promoções] não consegui aplicar as promoções programadas:", error instanceof Error ? error.message : error);
    return { started: 0, ended: 0 };
  }
}

export interface PriceHistorySummary {
  /** Desde quando o preço normal atual está registrado (ou o começo do histórico). */
  regularSince: Date | null;
  days: number;
  /** Primeira linha do histórico do produto (o histórico só existe a partir daí). */
  historyStartedAt: Date | null;
  /** Falso quando o preço "de" está registrado há menos de MIN_DAYS_REGULAR_PRICE dias. */
  regularPriceSettled: boolean;
}

/** Quanto tempo o preço normal ("de") atual está no histórico. Serve de alerta ao cadastrar promoção: não bloqueia. */
export async function getPriceHistorySummary(productId: string, now: Date = new Date()): Promise<PriceHistorySummary> {
  const res = await db.execute(sql`
    WITH cur AS (SELECT price_cents FROM products WHERE id = ${productId}),
    last_change AS (
      SELECT max(h.created_at) AS at FROM price_history h, cur
      WHERE h.product_id = ${productId} AND h.price_cents IS DISTINCT FROM cur.price_cents)
    SELECT
      (SELECT min(created_at) FROM price_history WHERE product_id = ${productId}) AS started,
      (SELECT min(h.created_at) FROM price_history h, last_change lc
        WHERE h.product_id = ${productId} AND (lc.at IS NULL OR h.created_at > lc.at)) AS since`);
  const row = (res.rows[0] ?? {}) as { started?: Date | null; since?: Date | null };
  const since = row.since ? new Date(row.since) : null;
  const days = since ? Math.floor((now.getTime() - since.getTime()) / 86_400_000) : 0;
  return {
    regularSince: since,
    days,
    historyStartedAt: row.started ? new Date(row.started) : null,
    regularPriceSettled: since !== null && days >= MIN_DAYS_REGULAR_PRICE,
  };
}
