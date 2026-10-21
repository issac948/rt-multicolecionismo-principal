import { formatBRL } from "@/lib/money";

/** "R$ 1.500,00" -> "R$ 1.500" quando não há centavos (frases mais limpas). */
export function formBRLShort(cents: number): string {
  const full = formatBRL(cents);
  return cents % 100 === 0 ? full.replace(/,00$/, "") : full;
}

/** Imagem de OpenGraph/JSON-LD precisa de endereço absoluto. */
export function absoluteUrl(siteUrl: string, path: string | null | undefined): string | undefined {
  return path ? `${siteUrl}${path}` : undefined;
}

/** Serializa JSON-LD com segurança (evita "</script>" dentro de textos). */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
