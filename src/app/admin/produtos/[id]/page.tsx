import { toCategoryOptions } from "@/lib/categories";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { ProductForm } from "@/components/admin/product-form";
import { productToFormValues } from "@/components/admin/product-form-server";
import { DeleteProductButton } from "@/components/admin/product-row-actions";
import { Alert, Badge } from "@/components/ui";
import { UUID_RE } from "@/lib/schemas";
import { requireAdminPage } from "@/server/auth/current-user";
import { listCategories } from "@/server/services/categories";
import { formatBr } from "@/lib/datetime-br";
import { MIN_DAYS_REGULAR_PRICE, PROMO_PHASE_LABEL, promoPhase } from "@/lib/promotions";
import { getPriceHistorySummary } from "@/server/services/promotions";
import { getProductById } from "@/server/services/products";

export const metadata: Metadata = { title: "Editar produto" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EditProductPage({ params, searchParams }: Props) {
  const { id } = await params;
  await requireAdminPage(`/admin/produtos/${id}`);
  if (!UUID_RE.test(id)) notFound();

  const [product, categories, query] = await Promise.all([getProductById(id), listCategories(), searchParams]);
  if (!product) notFound();
  const phase = promoPhase(product);
  const history = phase === "nenhuma" ? null : await getPriceHistorySummary(product.id);
  const historyWarn = history !== null && !history.regularPriceSettled;

  const created = query.criado;

  return (
    <>
      <AdminPageHeader
        title={product.name}
        back={{ href: "/admin/produtos", label: "Produtos" }}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {product.active ? <Badge tone="success">Publicado</Badge> : <Badge tone="neutral">Rascunho</Badge>}
            {product.active && (
              <Link href={`/produtos/${product.slug}`} target="_blank" className="inline-flex items-center gap-1">
                Ver na loja <ExternalLink size={14} aria-hidden />
              </Link>
            )}
          </span>
        }
      />

      {created && (
        <Alert tone="ok" className="mb-4">
          {created === "publicado" ? "Produto criado e publicado na loja." : "Produto criado como rascunho. Ele ainda não aparece na loja."}
        </Alert>
      )}

      {phase !== "nenhuma" && (
        <Alert tone={historyWarn ? "warn" : "info"} className="mb-4">
          <strong>{PROMO_PHASE_LABEL[phase]}</strong>
          {product.saleStartsAt ? ` · começa ${formatBr(product.saleStartsAt)}` : ""}
          {product.saleEndsAt ? ` · termina ${formatBr(product.saleEndsAt)}` : ""} (horário de Brasília).
          {historyWarn && history && (
            <>
              {" "}
              Atenção: o preço normal (“de”) está registrado há {history.days} dia(s)
              {history.historyStartedAt ? ` (o histórico de preços começou em ${formatBr(history.historyStartedAt).slice(0, 10)})` : ""}. Promoção “de/por” só
              é honesta se o preço “de” já foi praticado antes; confira antes de divulgar (mínimo sugerido: {MIN_DAYS_REGULAR_PRICE} dias).
            </>
          )}
        </Alert>
      )}

      {/* A chave é só o id: se mudasse a cada salvamento, o formulário seria recriado e a mensagem "Produto salvo" sumiria na hora. */}
      <ProductForm
        key={product.id}
        initial={productToFormValues(product)}
        categories={toCategoryOptions(categories)}
        mode="edit"
      />

      <section className="panel mt-6" aria-labelledby="titulo-excluir">
        <h2 id="titulo-excluir" className="text-2xl">
          Excluir produto
        </h2>
        <p className="mb-4 mt-2 max-w-[65ch] text-ink-soft">
          Exclui o produto e as fotos. Pedidos antigos continuam mostrando o nome e o preço da época. Se só quer tirar da loja por um tempo, desmarque
          “Visível na loja” acima.
        </p>
        <DeleteProductButton productId={product.id} name={product.name} />
      </section>
    </>
  );
}
