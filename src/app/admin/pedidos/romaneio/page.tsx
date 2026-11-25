import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { PrintButton } from "@/components/admin/print-copy-buttons";
import { addressToText } from "@/lib/address-text";
import { formatDateTime } from "@/lib/text";
import { requireAdminPage } from "@/server/auth/current-user";
import { listOrdersWithItems } from "@/server/services/orders";

export const metadata: Metadata = { title: "Romaneio de separação" };

/** Lista para imprimir: pedidos PAGOS (ainda não enviados) com o que separar, o endereço e o total por produto. */
export default async function PickingListPage() {
  await requireAdminPage("/admin/pedidos/romaneio");
  const [paid, processing] = await Promise.all([listOrdersWithItems({ status: "PAGO" }), listOrdersWithItems({ status: "PROCESSANDO" })]);
  const orders = [...paid.rows, ...processing.rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const totals = new Map<string, { name: string; sku: string | null; qty: number }>();
  for (const o of orders)
    for (const i of o.items) {
      const key = i.productId ?? `${i.name}|${i.sku ?? ""}`;
      const cur = totals.get(key) ?? { name: i.name, sku: i.sku, qty: 0 };
      cur.qty += i.quantity;
      totals.set(key, cur);
    }

  return (
    <>
      <AdminPageHeader
        title="Romaneio de separação"
        description="Pedidos pagos e em separação, do mais antigo para o mais novo. Use “Imprimir” (o menu do painel não sai no papel)."
        actions={<PrintButton label="Imprimir romaneio" />}
        back={{ href: "/admin/pedidos", label: "Pedidos" }}
      />
      {orders.length === 0 ? (
        <p className="panel">Nenhum pedido pago esperando separação.</p>
      ) : (
        <div className="space-y-6">
          <section className="panel break-inside-avoid">
            <h2 className="text-xl">Total a separar ({orders.length} pedido{orders.length > 1 ? "s" : ""})</h2>
            <ul className="mt-2 divide-y divide-line">
              {[...totals.values()].map((t) => (
                <li key={`${t.name}${t.sku}`} className="flex justify-between gap-4 py-1.5">
                  <span>
                    {t.name}
                    {t.sku ? <span className="text-ink-soft"> · {t.sku}</span> : null}
                  </span>
                  <strong className="tabular-nums">{t.qty}x</strong>
                </li>
              ))}
            </ul>
          </section>

          {orders.map((o) => (
            <section key={o.id} className="panel break-inside-avoid">
              <h2 className="text-xl">
                Pedido #{o.number} <span className="text-base font-normal text-ink-soft">· {formatDateTime(o.createdAt)}</span>
              </h2>
              <ul className="mt-2 divide-y divide-line">
                {o.items.map((i) => (
                  <li key={i.id} className="flex items-start gap-3 py-1.5">
                    <span aria-hidden className="mt-1 inline-block size-4 shrink-0 border-2 border-ink" />
                    <span className="flex-1">
                      {i.name}
                      {i.sku ? <span className="text-ink-soft"> · {i.sku}</span> : null}
                    </span>
                    <strong className="tabular-nums">{i.quantity}x</strong>
                  </li>
                ))}
              </ul>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="font-semibold">Entrega: {o.shippingMethodLabel}</p>
                  {o.shippingAddress ? (
                    <pre className="mt-1 whitespace-pre-wrap font-sans">{addressToText(o.shippingAddress)}</pre>
                  ) : (
                    <p className="mt-1">Retirada / sem endereço.</p>
                  )}
                </div>
                {o.customerNote && (
                  <div>
                    <p className="font-semibold">Observação do cliente</p>
                    <p className="mt-1">{o.customerNote}</p>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
