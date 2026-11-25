import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { checkCouponRules, MAX_COUPON_USES, normalizeCouponCode, type CouponKind } from "@/lib/coupons";
import { formatBRL } from "@/lib/money";
import { db, type Tx } from "../db";
import { couponRedemptions, coupons, type Coupon } from "../db/schema";
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "../errors";

type Executor = Pick<Tx, "select" | "insert" | "update" | "delete">;

export type AppliedCoupon = { coupon: Coupon; discountCents: number };

/**
 * Confere o cupom para este cliente e subtotal. Com `lock`, trava a linha do cupom até o fim da transação:
 * dois pedidos simultâneos do mesmo cupom são conferidos um de cada vez, então o limite de usos nunca é ultrapassado.
 * Lança ValidationError (campo `couponCode`) com a mensagem para o cliente.
 */
export async function evaluateCoupon(
  executor: Executor,
  input: { code: string; userId: string | null; subtotalCents: number; lock?: boolean; now?: Date },
): Promise<AppliedCoupon> {
  const code = normalizeCouponCode(input.code);
  if (!code) throw new ValidationError({ couponCode: "Código de cupom inválido." });

  const query = executor.select().from(coupons).where(eq(coupons.code, code));
  const [coupon] = await (input.lock ? query.for("update") : query);
  if (!coupon) throw new ValidationError({ couponCode: "Cupom não encontrado." });

  const [{ total }] = await executor
    .select({ total: count() })
    .from(couponRedemptions)
    .where(and(eq(couponRedemptions.couponId, coupon.id), isNull(couponRedemptions.releasedAt)));
  let byUser: number | null = null;
  if (input.userId) {
    const [row] = await executor
      .select({ n: count() })
      .from(couponRedemptions)
      .where(and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.userId, input.userId), isNull(couponRedemptions.releasedAt)));
    byUser = row.n;
  }

  const check = checkCouponRules(
    {
      kind: coupon.kind,
      value: coupon.value,
      minSubtotalCents: coupon.minSubtotalCents,
      startsAt: coupon.startsAt,
      endsAt: coupon.endsAt,
      maxRedemptions: coupon.maxRedemptions,
      maxPerUser: coupon.maxPerUser,
      active: coupon.active,
    },
    { now: input.now ?? new Date(), subtotalCents: input.subtotalCents, redemptionsTotal: total, redemptionsByUser: byUser },
    formatBRL,
  );
  if (!check.ok) throw new ValidationError({ couponCode: check.reason });
  return { coupon, discountCents: check.discountCents };
}

/** Registra o uso do cupom pelo pedido (dentro da transação do pedido, depois de `evaluateCoupon` com lock). */
export async function recordRedemption(tx: Executor, input: { couponId: string; orderId: string; userId: string; discountCents: number }): Promise<void> {
  await tx.insert(couponRedemptions).values(input);
}

/** Pedido cancelado/expirado/reembolsado: o uso volta para o cupom (idempotente). */
export async function releaseCouponForOrder(tx: Executor, orderId: string): Promise<void> {
  await tx
    .update(couponRedemptions)
    .set({ releasedAt: new Date() })
    .where(and(eq(couponRedemptions.orderId, orderId), isNull(couponRedemptions.releasedAt)));
}

/** Pagamento aprovado depois de o pedido ter sido cancelado e o estoque reservado de novo: o cupom volta a valer para este pedido. */
export async function reacquireCouponForOrder(tx: Executor, orderId: string): Promise<void> {
  await tx.update(couponRedemptions).set({ releasedAt: null }).where(eq(couponRedemptions.orderId, orderId));
}

/* ------------------------------------------------------------------ */
/* Painel                                                              */
/* ------------------------------------------------------------------ */

export type CouponInput = {
  code: string;
  description: string | null;
  kind: CouponKind;
  value: number;
  minSubtotalCents: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  maxPerUser: number | null;
};

export async function createCoupon(input: CouponInput): Promise<Coupon> {
  const code = normalizeCouponCode(input.code);
  if (!code) throw new ValidationError({ code: "Use de 3 a 32 letras, números, \"-\" ou \"_\" (sem espaços ou acentos)." });
  const tooMany = `Use no máximo ${MAX_COUPON_USES.toLocaleString("pt-BR")}.`;
  if (input.maxRedemptions !== null && input.maxRedemptions > MAX_COUPON_USES) throw new ValidationError({ maxRedemptions: tooMany });
  if (input.maxPerUser !== null && input.maxPerUser > MAX_COUPON_USES) throw new ValidationError({ maxPerUser: tooMany });
  try {
    const [row] = await db
      .insert(coupons)
      .values({ ...input, code })
      .returning();
    return row;
  } catch (error) {
    const pg = error as { code?: string; cause?: { code?: string } };
    if ((pg.code ?? pg.cause?.code) === "23505") throw new ConflictError("Já existe um cupom com este código.");
    throw error;
  }
}

export type CouponListRow = Coupon & { used: number };

export async function listCoupons(): Promise<CouponListRow[]> {
  const rows = await db
    .select({
      coupon: coupons,
      used: sql<number>`count(${couponRedemptions.id}) filter (where ${couponRedemptions.releasedAt} is null)`.mapWith(Number),
    })
    .from(coupons)
    .leftJoin(couponRedemptions, eq(couponRedemptions.couponId, coupons.id))
    .groupBy(coupons.id)
    .orderBy(desc(coupons.createdAt));
  return rows.map((r) => ({ ...r.coupon, used: r.used }));
}

export async function setCouponActive(id: string, active: boolean): Promise<void> {
  const rows = await db.update(coupons).set({ active }).where(eq(coupons.id, id)).returning({ id: coupons.id });
  if (rows.length === 0) throw new NotFoundError("Cupom não encontrado.");
}

/** Só cupons que nunca foram usados podem ser excluídos; os demais ficam no histórico (desative-os). */
export async function deleteCoupon(id: string): Promise<void> {
  const [{ n }] = await db.select({ n: count() }).from(couponRedemptions).where(eq(couponRedemptions.couponId, id));
  if (n > 0) throw new BusinessRuleError("Este cupom já foi usado em pedidos e fica no histórico. Desative-o em vez de excluir.");
  try {
    const rows = await db.delete(coupons).where(eq(coupons.id, id)).returning({ id: coupons.id });
    if (rows.length === 0) throw new NotFoundError("Cupom não encontrado.");
  } catch (error) {
    // Um pedido usou o cupom entre a conferência e a exclusão: o banco recusa (chave estrangeira) e nada se perde.
    const pg = error as { code?: string; cause?: { code?: string } };
    if ((pg.code ?? pg.cause?.code) === "23503") {
      throw new BusinessRuleError("Este cupom acabou de ser usado em um pedido e fica no histórico. Desative-o em vez de excluir.");
    }
    throw error;
  }
}
