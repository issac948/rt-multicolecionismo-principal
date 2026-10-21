import { normalizeBrand, normalizeScale } from "@/lib/collectibles";
import { PRODUCT_CONDITIONS, type ProductCondition } from "@/lib/constants";
import { parseMoneyToCents } from "@/lib/money";
import { PRODUCT_SORTS, type ProductFilters, type ProductSort } from "./services/products";

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

export type CatalogParams = {
  q: string;
  sort: ProductSort;
  page: number;
  min: string;
  max: string;
  onSale: boolean;
  inStock: boolean;
  brand: string;
  scale: string;
  /** Série ou coleção (texto livre cadastrado nos produtos). */
  series: string;
  /** Endereço (slug) da categoria escolhida em /produtos e /buscar; vazio = todas. */
  category: string;
  condition: ProductCondition | "";
  /** "miniaturas" (carros), "bonecos" (bonecos e outros colecionáveis) ou "outros" (vazio = tudo). */
  kind: "miniaturas" | "bonecos" | "outros" | "";
};

function parseKind(value: string | undefined): CatalogParams["kind"] {
  // "colecionaveis" é o endereço antigo das miniaturas: continua funcionando.
  if (value === "miniaturas" || value === "colecionaveis") return "miniaturas";
  return value === "bonecos" || value === "outros" ? value : "";
}

/** Lê e SANEIA a query string da vitrine (qualquer valor estranho cai no padrão). */
export function parseCatalogParams(raw: RawParams): CatalogParams {
  const sort = first(raw.ordem);
  const page = Number(first(raw.pagina));
  return {
    q: (first(raw.q) ?? "").trim().slice(0, 80),
    sort: PRODUCT_SORTS.includes(sort as ProductSort) ? (sort as ProductSort) : "relevancia",
    page: Number.isInteger(page) && page >= 1 && page <= 500 ? page : 1,
    min: (first(raw.min) ?? "").trim().slice(0, 12),
    max: (first(raw.max) ?? "").trim().slice(0, 12),
    onSale: first(raw.promocao) === "1",
    inStock: first(raw.estoque) === "1",
    brand: normalizeBrand((first(raw.marca) ?? "").slice(0, 60)),
    scale: normalizeScale((first(raw.escala) ?? "").slice(0, 12)),
    series: (first(raw.serie) ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
    category: /^[a-z0-9-]{1,80}$/.test(first(raw.categoria) ?? "") ? (first(raw.categoria) as string) : "",
    condition: PRODUCT_CONDITIONS.includes(first(raw.condicao) as ProductCondition) ? (first(raw.condicao) as ProductCondition) : "",
    kind: parseKind(first(raw.tipo)),
  };
}

export function toProductFilters(params: CatalogParams, extra: Partial<ProductFilters> = {}): ProductFilters {
  const min = params.min ? parseMoneyToCents(params.min) : null;
  const max = params.max ? parseMoneyToCents(params.max) : null;
  return {
    q: params.q || undefined,
    sort: params.sort,
    page: params.page,
    minPriceCents: min ?? undefined,
    maxPriceCents: max ?? undefined,
    onSale: params.onSale || undefined,
    inStock: params.inStock || undefined,
    brand: params.brand || undefined,
    scale: params.scale || undefined,
    series: params.series || undefined,
    condition: params.condition || undefined,
    kind: params.kind === "miniaturas" ? "carros" : params.kind === "bonecos" ? "colecionavel" : params.kind === "outros" ? "outros" : undefined,
    pageSize: 12,
    ...extra,
  };
}
