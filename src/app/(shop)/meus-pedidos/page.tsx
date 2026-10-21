import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, OrderStatusBadge } from "@/components/ui";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/text";
import { requireUser } from "@/server/auth/current-user";
import { listOrdersForUser } from "@/server/services/orders";

export const metadata: Metadata = { title: "Meus pedidos", robots: { index: false, follow: false } };

export default async function MyOrdersPage() {
  const user = await requireUser("/meus-pedidos");
  const orders = await listOrdersForUser(user.id);

  return (
    <div className="container-page py-10">
      <h1>Meus pedidos</h1>

      <div className="mt-6">
        {orders.length === 0 ? (
          <EmptyState
            title="Você ainda não fez nenhum pedido"
            action={
              <Link href="/produtos" className="btn btn-primary">
                Ver os produtos
              </Link>
            }
          >
            Quando você comprar, o acompanhamento aparece aqui.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {orders.map((order) => {
              const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
              return (
                <li key={order.id}>
                  <Link
                    href={`/pedido/${order.id}`}
                    className="panel flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-ink no-underline hover:bg-panel"
                  >
                    <span>
                      <span className="block text-xl font-extrabold [font-stretch:76%]">Pedido #{order.number}</span>
                      <span className="block text-sm text-ink-soft">
                        {formatDateTime(order.createdAt)} · {count} {count === 1 ? "item" : "itens"}
                      </span>
                      <span className="mt-1 block text-sm text-ink-soft">
                        {order.items
                          .slice(0, 2)
                          .map((i) => i.name)
                          .join(", ")}
                        {order.items.length > 2 ? ` e mais ${order.items.length - 2}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-4">
                      <OrderStatusBadge status={order.status} />
                      <strong className="text-lg tabular-nums">{formatBRL(order.totalCents)}</strong>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
