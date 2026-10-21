/** Remove acentos: "Cupê Clássico" -> "Cupe Classico" */
export function stripAccents(input: string): string {
  return input.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** "Cupê Esportivo Vermelho!" -> "cupe-esportivo-vermelho" */
export function slugify(input: string, maxLength = 80): string {
  const slug = stripAccents(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || "item";
}

/** Forma normalizada usada na busca: minúscula, sem acentos, espaços simples. */
export function normalizeForSearch(input: string): string {
  return stripAccents(input).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Escapa %, _ e \ para usar o texto dentro de um LIKE/ILIKE. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function onlyDigits(input: string | null | undefined): string {
  return (input ?? "").replace(/\D/g, "");
}

/** Une classes CSS ignorando valores vazios. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function formatCep(cep: string): string {
  const d = onlyDigits(cep);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep;
}

export function formatPhone(phone: string | null | undefined): string {
  const d = onlyDigits(phone);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone ?? "";
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return dateFmt.format(new Date(date));
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return dateTimeFmt.format(new Date(date));
}

/** Link do WhatsApp (wa.me). Aceita número com ou sem DDI; assume Brasil (55). */
export function whatsappLink(number: string | null | undefined, text?: string): string | null {
  let digits = onlyDigits(number);
  if (!digits) return null;
  if (digits.length <= 11) digits = `55${digits}`;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  prepaid_card: "Cartão pré-pago",
  bank_transfer: "Pix",
  pix: "Pix",
  ticket: "Boleto",
  account_money: "Saldo Mercado Pago",
  paypal: "PayPal",
};

/** Nome amigável da forma de pagamento (o provedor devolve códigos como "credit_card" ou "paypal"). */
export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  return PAYMENT_METHOD_LABELS[method] ?? method;
}
