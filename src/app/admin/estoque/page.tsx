import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader, SectionPanel } from "@/components/admin/admin-ui";
import { StockAdjustForm } from "@/components/admin/stock-adjust-form";
import { Badge, buildHref, Pagination } from "@/components/ui";
import { STOCK_MOVEMENT_LABEL } from "@/lib/constants";
import { UUID_RE } from "@/lib/schemas";
import { formatDateTime } from "@/lib/text";
import { requireAdminPage } from "@/server/auth/current-user";
import { listLowStockProducts, listStockMovements } from "@/server/services/inventory";
import { listProductsForSelect } from "@/server/services/products";

export const metadata: Metadata = { title: "Estoque" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminStockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage("/admin/estoque");
  const query = await searchParams;

  const productParam = first(query.produto);
  const productId = productParam && UUID_RE.test(productParam) ? productParam : undefined;
  const page = Math.max(1, Number.parseInt(first(query.pagina) ?? "1", 10) || 1);

  const [productOptions, low, history] = await Promise.all([
    listProductsForSelect(),
    listLowStockProducts(20),
    listStockMovements({ productId, page }),
  ]);
  const filteredProduct = productId ? productOptions.find((p) => p.id === productId) : undefined;

  return (
    <>
      <AdminPageHeader
        title="Estoque"
        description="Toda mudança de quantidade fica registrada aqui: quem fez, quando e por quê. Vendas baixam o estoque sozinhas; cancelamentos devolvem."
      />

      <div className="space-y-6">
        <SectionPanel title="Registrar entrada, saída ou contagem" id="titulo-ajuste">
          {productOptions.length === 0 ? (
            <p className="text-ink-soft">
              Cadastre um produto primeiro. <Link href="/admin/produtos/novo">Novo produto</Link>
            </p>
          ) : (
            <StockAdjustForm products={productOptions} defaultProductId={productId} />
          )}
        </SectionPanel>

        {low.length > 0 && (
          <SectionPanel title="Estoque baixo ou zerado" id="titulo-baixo">
            <ul className="grid gap-2 sm:grid-cols-2">
              {low.map((product) => (
                <li key={product.id} className="flex items-center justify-between gap-3 rounded bg-paper px-3 py-2">
                  <Link href={buildHref("/admin/estoque", { produto: product.id })} className="min-w-0 text-ink">
                    {product.name}
                  </Link>
                  {product.stock === 0 ? <Badge tone="danger">Sem estoque</Badge> : <Badge tone="warning">{product.stock} un.</Badge>}
                </li>
              ))}
            </ul>
          </SectionPanel>
        )}

        <SectionPanel
          title={filteredProduct ? `Histórico: ${filteredProduct.name}` : "Histórico de movimentações"}
          id="titulo-historico"
          action={
            filteredProduct ? (
              <Link href="/admin/estoque" className="text-sm">
                Ver de todos os produtos
              </Link>
            ) : undefined
          }
        >
          {history.rows.length === 0 ? (
            <p className="text-ink-soft">Nenhuma movimentação registrada ainda.</p>
          ) : (
            <div className="table-wrap border border-line">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Quando</th>
                    <th scope="col">Produto</th>
                    <th scope="col">Tipo</th>
                    <th scope="col" className="text-right">
                      Mudança
                    </th>
                    <th scope="col" className="text-right">
                      Ficou
                    </th>
                    <th scope="col">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {history.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                      <td>
                        {row.productId ? (
                          <Link href={buildHref("/admin/estoque", { produto: row.productId })} className="text-ink">
                            {row.productName}
                          </Link>
                        ) : (
                          row.productName
                        )}
                      </td>
                      <td>{STOCK_MOVEMENT_LABEL[row.type]}</td>
                      <td className={`text-right font-bold tabular-nums ${row.quantityChange < 0 ? "text-enamel-deep" : "text-ok"}`}>
                        {row.quantityChange > 0 ? `+${row.quantityChange}` : row.quantityChange}
                      </td>
                      <td className="text-right tabular-nums">{row.stockAfter}</td>
                      <td className="text-sm text-ink-soft">
                        {row.reason ?? ""}
                        {row.userName ? ` · ${row.userName}` : ""}
                        {row.orderId ? (
                          <>
                            {" · "}
                            <Link href={`/admin/pedidos/${row.orderId}`}>pedido</Link>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={history.page} pages={history.pages} hrefFor={(p) => buildHref("/admin/estoque", { produto: productId, pagina: p > 1 ? p : undefined })} />
        </SectionPanel>
      </div>
    </>
  );
}
