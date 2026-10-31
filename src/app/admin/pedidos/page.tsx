import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { buildHref, EmptyState, OrderStatusBadge, Pagination, PaymentStatusBadge } from "@/components/ui";
import { ORDER_STATUS_LABEL, ORDER_STATUSES, type OrderStatus } from "@/lib/constants";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/text";
import { requireAdminPage } from "@/server/auth/current-user";
import { adminListOrders } from "@/server/services/orders";

export const metadata: Metadata = { title: "Pedidos" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage("/admin/pedidos");
  const query = await searchParams;

  const q = (first(query.q) ?? "").trim().slice(0, 80);
  const statusParam = first(query.status);
  const status = (ORDER_STATUSES as readonly string[]).includes(statusParam ?? "") ? (statusParam as OrderStatus) : undefined;
  const attention = first(query.atencao) === "1";
  const page = Math.max(1, Number.parseInt(first(query.pagina) ?? "1", 10) || 1);

  const result = await adminListOrders({ q, status, attention, page });
  const hrefFor = (p: number) => buildHref("/admin/pedidos", { q, status, atencao: attention ? "1" : undefined, pagina: p > 1 ? p : undefined });
  const filtered = Boolean(q || status || attention);

  return (
    <>
      <AdminPageHeader
        title="Pedidos"
        description={`${result.total} ${result.total === 1 ? "pedido" : "pedidos"}${filtered ? " neste filtro" : ""}.${attention ? " Mostrando só os que têm aviso para você." : ""}`}
      />

      <form method="get" role="search" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="label">
            Buscar
          </label>
          <input id="q" name="q" type="search" className="input" defaultValue={q} placeholder="Número do pedido, nome ou e-mail" maxLength={80} />
        </div>
        <div>
          <label htmlFor="status" className="label">
            Status
          </label>
          <select id="status" name="status" className="select" defaultValue={status ?? ""}>
            <option value="">Todos</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="checkbox" name="atencao" value="1" defaultChecked={attention} />
          Só com aviso
        </label>
        <button type="submit" className="btn btn-dark">
          <Search size={18} aria-hidden /> Filtrar
        </button>
        {filtered && (
          <Link href="/admin/pedidos" className="btn btn-outline">
            Limpar
          </Link>
        )}
      </form>

      {result.rows.length === 0 ? (
        <EmptyState title={filtered ? "Nenhum pedido encontrado" : "Ainda não há pedidos"}>
          {filtered ? "Tente outro número, nome ou status." : "Quando um cliente comprar, o pedido aparece aqui."}
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table table-cards">
            <thead>
              <tr>
                <th scope="col">Pedido</th>
                <th scope="col">Cliente</th>
                <th scope="col">Data</th>
                <th scope="col">Status</th>
                <th scope="col">Pagamento</th>
                <th scope="col">Entrega</th>
                <th scope="col" className="text-right">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((order) => (
                <tr key={order.id}>
                  <td data-primary>
                    <Link href={`/admin/pedidos/${order.id}`} className="font-bold">
                      #{order.number}
                    </Link>
                    {order.attentionNote && (
                      <span className="ml-2 badge badge-warning" title={order.attentionNote}>
                        Aviso
                      </span>
                    )}
                  </td>
                  <td data-label="Cliente">
                    {order.customerName}
                    <span className="block text-xs text-ink-soft">{order.customerEmail}</span>
                  </td>
                  <td data-label="Data" className="whitespace-nowrap">{formatDateTime(order.createdAt)}</td>
                  <td data-label="Status">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td data-label="Pagamento">
                    <PaymentStatusBadge status={order.paymentStatus} />
                  </td>
                  <td data-label="Entrega">{order.shippingMethodLabel}</td>
                  <td data-label="Total" className="whitespace-nowrap text-right tabular-nums">{formatBRL(order.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={result.page} pages={result.pages} hrefFor={hrefFor} />
    </>
  );
}
