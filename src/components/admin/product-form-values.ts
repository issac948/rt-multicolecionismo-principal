import { centsToInput } from "@/lib/money";
import type { ProductSuggestion } from "@/server/ai/product-assistant";

/**
 * ATENÇÃO: este arquivo é importado por componentes do navegador. Não importe aqui nada de
 * "@/server" em tempo de execução (só `import type`), senão o código de servidor entra no pacote do navegador.
 */

/** Valores iniciais do formulário de produto (tudo texto, como os campos do navegador). */
export type ProductFormValues = {
  id?: string;
  name: string;
  sku: string;
  shortDescription: string;
  description: string;
  categoryId: string;
  price: string;
  salePrice: string;
  saleStarts: string;
  saleEnds: string;
  promoText: string;
  stock: string;
  lowStockThreshold: string;
  active: boolean;
  featured: boolean;
  features: Array<{ label: string; value: string }>;
  tags: string;
  seoTitle: string;
  seoDescription: string;
  weightGrams: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  images: Array<{ id: string; url: string; thumbUrl: string }>;
  brand: string;
  model: string;
  scale: string;
  series: string;
  releaseYear: string;
  condition: string;
  packagingState: string;
  conservationNotes: string;
};

export const EMPTY_PRODUCT_VALUES: ProductFormValues = {
  name: "",
  sku: "",
  shortDescription: "",
  description: "",
  categoryId: "",
  price: "",
  salePrice: "",
  saleStarts: "",
  saleEnds: "",
  promoText: "",
  stock: "0",
  lowStockThreshold: "3",
  active: false,
  featured: false,
  features: [],
  tags: "",
  seoTitle: "",
  seoDescription: "",
  weightGrams: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  images: [],
  brand: "",
  model: "",
  scale: "",
  series: "",
  releaseYear: "",
  condition: "",
  packagingState: "",
  conservationNotes: "",
};

const numberOrEmpty = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

/** Sugestão da IA -> campos do formulário. Continua sendo só um rascunho na tela até o administrador salvar. */
export function suggestionToFormValues(suggestion: ProductSuggestion): ProductFormValues {
  return {
    ...EMPTY_PRODUCT_VALUES,
    name: suggestion.name,
    shortDescription: suggestion.shortDescription,
    description: suggestion.description,
    categoryId: suggestion.categoryId ?? "",
    price: centsToInput(suggestion.priceCents),
    salePrice: centsToInput(suggestion.salePriceCents),
    promoText: suggestion.promoText,
    stock: suggestion.stock === null ? "0" : String(suggestion.stock),
    features: suggestion.features,
    tags: suggestion.tags.join(", "),
    seoTitle: suggestion.seoTitle,
    seoDescription: suggestion.seoDescription,
    weightGrams: numberOrEmpty(suggestion.weightGrams),
    brand: suggestion.brand,
    model: suggestion.model,
    scale: suggestion.scale,
    series: suggestion.series,
    releaseYear: numberOrEmpty(suggestion.releaseYear),
    condition: suggestion.condition ?? "",
    packagingState: suggestion.packagingState,
    conservationNotes: suggestion.conservationNotes,
  };
}
