import { toBrLocalInput } from "@/lib/datetime-br";
import { centsToInput } from "@/lib/money";
import type { ProductWithRelations } from "@/server/services/products";
import { fileUrl } from "@/server/storage";
import type { ProductFormValues } from "./product-form-values";

const numberOrEmpty = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

/** Só para páginas de servidor: usa o armazenamento para montar o endereço das fotos. */
export function productToFormValues(product: ProductWithRelations): ProductFormValues {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku ?? "",
    shortDescription: product.shortDescription,
    description: product.description,
    categoryId: product.categoryId ?? "",
    price: centsToInput(product.priceCents),
    salePrice: centsToInput(product.promoPriceCents ?? product.salePriceCents),
    saleStarts: toBrLocalInput(product.saleStartsAt),
    saleEnds: toBrLocalInput(product.saleEndsAt),
    promoText: product.promoText ?? "",
    stock: String(product.stock),
    lowStockThreshold: String(product.lowStockThreshold),
    active: product.active,
    featured: product.featured,
    features: product.features.map((f) => ({ label: f.label, value: f.value })),
    tags: product.tags.join(", "),
    seoTitle: product.seoTitle ?? "",
    seoDescription: product.seoDescription ?? "",
    weightGrams: numberOrEmpty(product.weightGrams),
    lengthCm: numberOrEmpty(product.lengthCm),
    widthCm: numberOrEmpty(product.widthCm),
    heightCm: numberOrEmpty(product.heightCm),
    brand: product.brand ?? "",
    model: product.model ?? "",
    scale: product.scale ?? "",
    series: product.series ?? "",
    releaseYear: numberOrEmpty(product.releaseYear),
    condition: product.condition ?? "",
    packagingState: product.packagingState ?? "",
    conservationNotes: product.conservationNotes ?? "",
    images: product.images.map((image) => ({
      id: image.id,
      url: fileUrl(image.storageKey) as string,
      thumbUrl: fileUrl(image.thumbKey) as string,
    })),
  };
}
