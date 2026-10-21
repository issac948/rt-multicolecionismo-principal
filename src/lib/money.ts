import { MAX_PRICE_CENTS } from "./constants";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 89990 -> "R$ 899,90" */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/** 89990 -> "899,90" (para preencher campos de formulário) */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  const abs = Math.abs(cents);
  const reais = Math.trunc(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${reais},${rest}`;
}

/**
 * Converte o que a pessoa digitou em centavos, sem usar ponto flutuante.
 * Aceita: "899", "899,90", "1.299,90", "R$ 1299,90", "1299.90".
 * Devolve null se não for um valor válido.
 */
export function parseMoneyToCents(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  let s = String(input).replace(/R\$|\s/g, "");
  if (!s) return null;

  if (s.includes(",")) {
    // Formato brasileiro: ponto separa milhar, vírgula separa centavos.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, ""); // "1.299.000"
  } else if (/^\d{1,3}\.\d{3}$/.test(s)) {
    s = s.replace(".", ""); // "1.299" = mil duzentos e noventa e nove reais
  }

  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;

  const [whole, fraction = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents > MAX_PRICE_CENTS) return null;
  return cents;
}

type Priced = { priceCents: number; salePriceCents: number | null };

/** Preço que o cliente realmente paga: o promocional, quando válido, senão o normal. */
export function effectivePriceCents(p: Priced): number {
  return p.salePriceCents !== null && p.salePriceCents < p.priceCents ? p.salePriceCents : p.priceCents;
}

export function isOnSale(p: Priced): boolean {
  return p.salePriceCents !== null && p.salePriceCents < p.priceCents;
}

export function discountPercent(p: Priced): number {
  if (!isOnSale(p)) return 0;
  return Math.round(((p.priceCents - (p.salePriceCents as number)) / p.priceCents) * 100);
}
