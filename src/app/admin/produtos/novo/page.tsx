import { toCategoryOptions } from "@/lib/categories";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { ProductForm } from "@/components/admin/product-form";
import { productToFormValues } from "@/components/admin/product-form-server";
import { EMPTY_PRODUCT_VALUES, type ProductFormValues } from "@/components/admin/product-form-values";
import { Alert } from "@/components/ui";
import { UUID_RE } from "@/lib/schemas";
import { requireAdminPage } from "@/server/auth/current-user";
import { listCategories } from "@/server/services/categories";
import { getProductById } from "@/server/services/products";

export const metadata: Metadata = { title: "Novo produto" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Copia do produto só o que costuma se repetir numa leva de cadastros; nome, código, preço, fotos e estoque ficam em branco. */
function carryOver(source: ProductFormValues): ProductFormValues {
  return {
    ...EMPTY_PRODUCT_VALUES,
    categoryId: source.categoryId,
    brand: source.brand,
    scale: source.scale,
    series: source.series,
    releaseYear: source.releaseYear,
    condition: source.condition,
    packagingState: source.packagingState,
    lowStockThreshold: source.lowStockThreshold,
    weightGrams: source.weightGrams,
    lengthCm: source.lengthCm,
    widthCm: source.widthCm,
    heightCm: source.heightCm,
  };
}

export default async function NewProductPage({ searchParams }: Props) {
  await requireAdminPage("/admin/produtos/novo");
  const query = await searchParams;
  const baseId = first(query.base);
  const copyId = first(query.copiar);
  const [categories, base, copy] = await Promise.all([
    listCategories(),
    baseId && UUID_RE.test(baseId) ? getProductById(baseId) : null,
    copyId && UUID_RE.test(copyId) ? getProductById(copyId) : null,
  ]);

  let initial = EMPTY_PRODUCT_VALUES;
  let notice: React.ReactNode = null;
  if (base) {
    initial = carryOver(productToFormValues(base));
    notice = (
      <Alert tone="ok" className="mb-4">
        <strong>&quot;{base.name}&quot;</strong> foi salvo como rascunho (<Link href={`/admin/produtos/${base.id}`}>abrir</Link>). O formulário abaixo já veio com a mesma categoria, marca e escala; preencha nome, preço e estoque do próximo.
      </Alert>
    );
  } else if (copy) {
    // Duplicar: leva a maior parte dos dados, mas nunca o código (SKU), as fotos nem o estoque, e sempre como rascunho.
    initial = { ...productToFormValues(copy), id: undefined, sku: "", images: [], stock: "0", active: false };
    notice = (
      <Alert tone="info" className="mb-4">
        Cópia de <strong>&quot;{copy.name}&quot;</strong>. Troque o nome e o preço se precisar, coloque as fotos e o estoque. O código (SKU) não é copiado, para não repetir.
      </Alert>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Novo produto"
        back={{ href: "/admin/produtos", label: "Produtos" }}
        description="Preencha os dados e escolha entre publicar na loja ou salvar como rascunho (fica só aqui no painel)."
      />
      {notice}
      <ProductForm key={base?.id ?? copy?.id ?? "novo"} initial={initial} categories={toCategoryOptions(categories)} mode="create" />
    </>
  );
}
