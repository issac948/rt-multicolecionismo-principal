import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { ToggleProductActive } from "@/components/admin/product-row-actions";
import { Alert, Badge, buildHref, EmptyState, Pagination } from "@/components/ui";
import { effectivePriceCents, formatBRL, isOnSale } from "@/lib/money";
import { requireAdminPage } from "@/server/auth/current-user";
import { adminListProducts, type AdminProductStatus } from "@/server/services/products";
import { fileUrl } from "@/server/storage";

export const metadata: Metadata = { title: "Produtos" };

const STATUS_FILTERS: Array<{ value: AdminProductStatus; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Publicados" },
  { value: "inactive", label: "Rascunhos / ocultos" },
  { value: "low", label: "Estoque baixo" },
  { value: "out", label: "Sem estoque" },
];

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage("/admin/produtos");
  const query = await searchParams;

  const q = (first(query.q) ?? "").trim().slice(0, 80);
  const statusParam = first(query.status);
  const status = STATUS_FILTERS.some((f) => f.value === statusParam) ? (statusParam as AdminProductStatus) : "all";
  const page = Math.max(1, Number.parseInt(first(query.pagina) ?? "1", 10) || 1);

  const result = await adminListProducts({ q, status, page });
  const hrefFor = (p: number) => buildHref("/admin/produtos", { q, status: status === "all" ? undefined : status, pagina: p > 1 ? p : undefined });

  return (
    <>
      <AdminPageHeader
        title="Produtos"
        description={`${result.total} ${result.total === 1 ? "produto" : "produtos"} ${q || status !== "all" ? "neste filtro" : result.total === 1 ? "cadastrado" : "cadastrados"}.`}
        actions={
          <>
            <Link href="/admin/ia" className="btn btn-outline">
              Cadastrar com a IA
            </Link>
            <Link href="/admin/produtos/novo" className="btn btn-primary">
              <Plus size={18} aria-hidden /> Novo produto
            </Link>
          </>
        }
      />

      {first(query.excluido) && (
        <Alert tone="ok" className="mb-4">
          Produto excluído.
        </Alert>
      )}

      <form method="get" role="search" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="label">
            Buscar produto
          </label>
          <input id="q" name="q" type="search" className="input" defaultValue={q} placeholder="Nome, código ou palavra-chave" maxLength={80} />
        </div>
        <div>
          <label htmlFor="status" className="label">
            Situação
          </label>
          <select id="status" name="status" className="select" defaultValue={status}>
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-dark">
          <Search size={18} aria-hidden /> Filtrar
        </button>
        {(q || status !== "all") && (
          <Link href="/admin/produtos" className="btn btn-outline">
            Limpar
          </Link>
        )}
      </form>

      {result.items.length === 0 ? (
        <EmptyState
          title={q || status !== "all" ? "Nenhum produto encontrado" : "Você ainda não cadastrou produtos"}
          action={
            <Link href="/admin/produtos/novo" className="btn btn-primary">
              Cadastrar o primeiro produto
            </Link>
          }
        >
          {q || status !== "all" ? "Tente outro nome ou limpe os filtros." : "Cadastre um produto e ele aparece aqui."}
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Produto</th>
                <th scope="col">Categoria</th>
                <th scope="col" className="text-right">
                  Preço
                </th>
                <th scope="col" className="text-right">
                  Estoque
                </th>
                <th scope="col">Situação</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((product) => {
                const thumb = fileUrl(product.images[0]?.thumbKey);
                return (
                  <tr key={product.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-panel">
                          {thumb && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt="" className="h-full w-full object-cover" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <Link href={`/admin/produtos/${product.id}`} className="font-bold text-ink">
                            {product.name}
                          </Link>
                          {product.sku && <p className="text-xs text-ink-soft">Cód. {product.sku}</p>}
                          {product.active && product.images.length === 0 && <p className="text-xs font-semibold text-enamel-deep">Sem foto</p>}
                        </div>
                      </div>
                    </td>
                    <td>{product.category?.name ?? <span className="text-ink-soft">—</span>}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {formatBRL(effectivePriceCents(product))}
                      {isOnSale(product) && <span className="block text-xs text-ink-soft line-through">{formatBRL(product.priceCents)}</span>}
                    </td>
                    <td className="text-right tabular-nums">
                      {product.stock === 0 ? (
                        <Badge tone="danger">Sem estoque</Badge>
                      ) : product.stock <= product.lowStockThreshold ? (
                        <Badge tone="warning">{product.stock} (baixo)</Badge>
                      ) : (
                        product.stock
                      )}
                    </td>
                    <td>{product.active ? <Badge tone="success">Publicado</Badge> : <Badge tone="neutral">Rascunho</Badge>}</td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link href={`/admin/produtos/${product.id}`} className="btn btn-outline btn-sm">
                          Editar
                        </Link>
                        <ToggleProductActive productId={product.id} active={product.active} name={product.name} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={result.page} pages={result.pages} hrefFor={hrefFor} />
    </>
  );
}
