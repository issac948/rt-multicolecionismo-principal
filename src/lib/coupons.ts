/**
 * Regras PURAS de cupom (sem banco): normalizar o código, calcular o desconto, conferir as regras e
 * distribuir o desconto pelos itens (os provedores de pagamento exigem itens que somem exatamente o total).
 */

export type CouponKind = "PERCENT" | "FIXED";

export const COUPON_KIND_LABEL: Record<CouponKind, string> = { PERCENT: "Percentual (%)", FIXED: "Valor fixo (R$)" };

/** O desconto nunca passa de 90% do subtotal: o pedido sempre mantém um valor a pagar e cada item um preço maior que zero. */
export const MAX_DISCOUNT_PERCENT = 90;

/** Teto para "limite de usos" (cabe com folga no inteiro do banco e evita erro de digitação). */
export const MAX_COUPON_USES = 1_000_000;

const CODE_RE = /^[A-Z0-9_-]{3,32}$/;

/** " black 10 " → "BLACK10". Devolve null se não for um código válido (letras, números, "-" e "_"; 3 a 32 caracteres). */
export function normalizeCouponCode(raw: string | null | undefined): string | null {
  const code = String(raw ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

export type CouponRuleData = {
  kind: CouponKind;
  value: number;
  minSubtotalCents: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  maxPerUser: number | null;
  active: boolean;
};

export type CouponContext = {
  now: Date;
  subtotalCents: number;
  /** Usos que ainda seguram o cupom (pedidos não cancelados/expirados). */
  redemptionsTotal: number;
  /** Usos desta pessoa; null quando ainda não se sabe quem é (visitante). */
  redemptionsByUser: number | null;
};

/** Desconto em centavos para este subtotal (nunca negativo, nunca mais que 90% do subtotal). */
export function couponDiscountCents(coupon: Pick<CouponRuleData, "kind" | "value">, subtotalCents: number): number {
  if (subtotalCents <= 0) return 0;
  const raw = coupon.kind === "PERCENT" ? Math.floor((subtotalCents * coupon.value) / 100) : coupon.value;
  const cap = Math.floor((subtotalCents * MAX_DISCOUNT_PERCENT) / 100);
  return Math.max(0, Math.min(raw, cap));
}

export type CouponCheck = { ok: true; discountCents: number } | { ok: false; reason: string };

export function checkCouponRules(coupon: CouponRuleData, ctx: CouponContext, formatMoney: (cents: number) => string): CouponCheck {
  // Cupom desligado responde igual a código que não existe: quem tenta adivinhar códigos não descobre quais existem.
  if (!coupon.active) return { ok: false, reason: "Cupom não encontrado." };
  if (coupon.startsAt && ctx.now < coupon.startsAt) return { ok: false, reason: "Este cupom ainda não começou." };
  if (coupon.endsAt && ctx.now >= coupon.endsAt) return { ok: false, reason: "Este cupom já expirou." };
  if (ctx.subtotalCents < coupon.minSubtotalCents) {
    return { ok: false, reason: `Este cupom vale para compras a partir de ${formatMoney(coupon.minSubtotalCents)} em produtos.` };
  }
  if (coupon.maxRedemptions !== null && ctx.redemptionsTotal >= coupon.maxRedemptions) {
    return { ok: false, reason: "Este cupom atingiu o limite de usos." };
  }
  if (coupon.maxPerUser !== null && ctx.redemptionsByUser !== null && ctx.redemptionsByUser >= coupon.maxPerUser) {
    return { ok: false, reason: "Você já usou este cupom o máximo de vezes permitido." };
  }
  const discountCents = couponDiscountCents(coupon, ctx.subtotalCents);
  if (discountCents <= 0) return { ok: false, reason: "Este cupom não gera desconto neste carrinho." };
  return { ok: true, discountCents };
}

export type DiscountableLine = { title: string; quantity: number; unitPriceCents: number };

/**
 * Distribui o desconto pelos itens, proporcionalmente ao valor de cada um, sem sobrar nem faltar centavo:
 * a soma das linhas devolvidas é EXATAMENTE a soma original menos o desconto. Uma linha pode virar duas
 * (parte das unidades com 1 centavo a mais) quando o valor da linha não divide igualmente pela quantidade.
 */
export function applyDiscountToLines(lines: DiscountableLine[], discountCents: number): DiscountableLine[] {
  if (discountCents <= 0) return lines;
  const totals = lines.map((l) => l.unitPriceCents * l.quantity);
  const subtotal = totals.reduce((a, b) => a + b, 0);
  if (discountCents >= subtotal) throw new Error("Desconto maior ou igual ao subtotal.");

  // Cada linha precisa continuar com pelo menos 1 centavo por unidade.
  const room = totals.map((t, i) => t - lines[i].quantity);
  const shares = totals.map((t, i) => Math.min(Math.floor((t * discountCents) / subtotal), room[i]));
  let rest = discountCents - shares.reduce((a, b) => a + b, 0);
  const order = totals.map((_, i) => i).sort((a, b) => totals[b] - totals[a] || a - b);
  while (rest > 0) {
    let moved = false;
    for (const i of order) {
      if (rest > 0 && shares[i] < room[i]) {
        shares[i] += 1;
        rest -= 1;
        moved = true;
      }
    }
    if (!moved) throw new Error("Não foi possível distribuir o desconto.");
  }

  const out: DiscountableLine[] = [];
  lines.forEach((line, i) => {
    const net = totals[i] - shares[i];
    const base = Math.floor(net / line.quantity);
    const extra = net - base * line.quantity; // unidades que custam 1 centavo a mais
    if (line.quantity - extra > 0) out.push({ title: line.title, quantity: line.quantity - extra, unitPriceCents: base });
    if (extra > 0) out.push({ title: line.title, quantity: extra, unitPriceCents: base + 1 });
  });
  return out;
}
