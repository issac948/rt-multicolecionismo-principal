/** Regras puras de promoção programada (sem banco). Datas nulas = sem limite daquele lado. */
export type PromoPhase = "nenhuma" | "agendada" | "ativa" | "encerrada";

export interface PromoWindow {
  promoPriceCents: number | null;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
}

export function promoPhase(p: PromoWindow, now: Date = new Date()): PromoPhase {
  if (p.promoPriceCents === null) return "nenhuma";
  if (p.saleStartsAt && p.saleStartsAt.getTime() > now.getTime()) return "agendada";
  if (p.saleEndsAt && p.saleEndsAt.getTime() <= now.getTime()) return "encerrada";
  return "ativa";
}

/** Preço promocional em vigor AGORA (o que vai para `sale_price_cents`). */
export function liveSalePriceCents(p: PromoWindow, now: Date = new Date()): number | null {
  return promoPhase(p, now) === "ativa" ? p.promoPriceCents : null;
}

export const PROMO_PHASE_LABEL: Record<PromoPhase, string> = {
  nenhuma: "",
  agendada: "Promoção agendada",
  ativa: "Promoção ativa",
  encerrada: "Promoção encerrada",
};

/** Dias mínimos em que o preço normal ("de") deveria ter sido praticado antes de uma promoção "de/por". */
export const MIN_DAYS_REGULAR_PRICE = 30;
