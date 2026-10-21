import { toCategoryOptions } from "@/lib/categories";
import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { ProductForm } from "@/components/admin/product-form";
import { EMPTY_PRODUCT_VALUES } from "@/components/admin/product-form-values";
import { requireAdminPage } from "@/server/auth/current-user";
import { listCategories } from "@/server/services/categories";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  await requireAdminPage("/admin/produtos/novo");
  const categories = await listCategories();

  return (
    <>
      <AdminPageHeader
        title="Novo produto"
        back={{ href: "/admin/produtos", label: "Produtos" }}
        description="Preencha os dados e escolha entre publicar na loja ou salvar como rascunho (fica só aqui no painel)."
      />
      <ProductForm initial={EMPTY_PRODUCT_VALUES} categories={toCategoryOptions(categories)} mode="create" />
    </>
  );
}
