import { PRODUCT_CONDITION_LABEL, SUGGESTED_BRANDS, type ProductCondition } from "./constants";
import { stripAccents } from "./text";

/**
 * Ajudantes dos campos de colecionáveis (marca, escala, condição).
 * Sem acesso a banco ou servidor: podem ser usados no navegador e no servidor.
 */

const alnum = (value: string) => stripAccents(value).toLowerCase().replace(/[^a-z0-9]/g, "");

/** "hot wheels", "HOTWHEELS" e "Hot-Wheels" viram "Hot Wheels"; marcas desconhecidas só têm os espaços arrumados. */
export function normalizeBrand(input: string): string {
  const clean = input.replace(/\s+/g, " ").trim();
  const key = alnum(clean);
  const known = SUGGESTED_BRANDS.find((brand) => alnum(brand) === key);
  return known ?? clean;
}

/** "1/64", "1-64", "1x64" e "1 : 64" viram "1:64". Textos que não parecem escala são mantidos. */
export function normalizeScale(input: string): string {
  const clean = input.replace(/\s+/g, "");
  const match = clean.match(/^(\d{1,2})[:/xX-](\d{1,4})$/);
  return match ? `${Number(match[1])}:${Number(match[2])}` : input.replace(/\s+/g, " ").trim();
}

export function conditionLabel(condition: string | null | undefined): string | null {
  if (!condition) return null;
  return PRODUCT_CONDITION_LABEL[condition as ProductCondition] ?? null;
}

/** Linhas da "Ficha do colecionável": só entram os campos que foram preenchidos. */
export function collectibleSpecs(p: {
  brand: string | null;
  model: string | null;
  scale: string | null;
  series: string | null;
  releaseYear: number | null;
  condition: string | null;
  packagingState: string | null;
  conservationNotes: string | null;
}): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Marca", value: p.brand },
    { label: "Modelo", value: p.model },
    { label: "Escala", value: p.scale },
    { label: "Série", value: p.series },
    { label: "Ano", value: p.releaseYear === null ? null : String(p.releaseYear) },
    { label: "Condição", value: conditionLabel(p.condition) },
    { label: "Embalagem", value: p.packagingState },
    { label: "Conservação", value: p.conservationNotes },
  ];
  return rows.filter((row): row is { label: string; value: string } => Boolean(row.value));
}

export function hasCollectibleData(p: Parameters<typeof collectibleSpecs>[0]): boolean {
  return collectibleSpecs(p).length > 0;
}
