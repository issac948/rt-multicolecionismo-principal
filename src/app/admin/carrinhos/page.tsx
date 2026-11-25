import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { EmptyState } from "@/components/ui";
import { formatBRL } from "@/lib/money";
import { requireAdminPage } from "@/server/auth/current-user";
import { ACTIVE_CART_MINUTES, getLiveCartsReport, type LiveCart } from "@/server/services/live-carts";

export const metadata: Metadata = { title: "Carrinhos ao vivo" };

function ago(date: Date): string {
  const min = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

function CartTable({ carts }: { carts: LiveCart[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className="py-2 pr-3">Cliente</th>
            <th className="py-2 pr-3">Itens</th>
            <th className="py-2 pr-3">Valor</th>
            <th className="py-2">Última atividade</th>
          </tr>
        </thead>
        <tbody>
          {carts.map((c) => (
            <tr key={c.id} className="border-b border-line align-top">
              <td className="py-2 pr-3">
                {c.customerName ? (
                  <>
                    {c.customerName}
                    <span className="block text-ink-soft">{c.customerEmail}</span>
                  </>
                ) : (
                  <span className="text-ink-soft">Visitante (sem login)</span>
                )}
              </td>
              <td className="py-2 pr-3">
                {c.items.map((i, n) => (
                  <span key={n} className="block">
                    {i.quantity}× {i.name}
                  </span>
                ))}
              </td>
              <td className="py-2 pr-3 whitespace-nowrap">{formatBRL(c.totalCents)}</td>
              <td className="py-2 whitespace-nowrap">{ago(c.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function LiveCartsPage() {
  await requireAdminPage("/admin/carrinhos");
  const r = await getLiveCartsReport();

  return (
    <>
      <AutoRefresh seconds={30} />
      <AdminPageHeader
        title="Carrinhos ao vivo"
        description={`Atualiza sozinho a cada 30 s com a aba aberta. “Ativo” = mexeu no carrinho nos últimos ${ACTIVE_CART_MINUTES} min. Estes dados pessoais aparecem só aqui, nunca na loja.`}
      />

      <section className="panel mb-6" aria-labelledby="funil">
        <h2 id="funil" className="text-2xl">
          Últimos {r.funnel.days} dias
        </h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-sm text-ink-soft">Carrinhos com itens</dt>
            <dd className="text-3xl font-semibold">{r.funnel.cartsWithItems}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-soft">Pedidos criados</dt>
            <dd className="text-3xl font-semibold">{r.funnel.ordersCreated}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-soft">Pedidos pagos</dt>
            <dd className="text-3xl font-semibold">{r.funnel.ordersPaid}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-soft">Visitas ao site</dt>
            <dd className="text-lg text-ink-soft">não medido ainda</dd>
          </div>
        </dl>
      </section>

      <section className="panel mb-6" aria-labelledby="ativos">
        <h2 id="ativos" className="text-2xl">
          Ativos agora ({r.active.length})
        </h2>
        {r.active.length === 0 ? <EmptyState title="Nenhum carrinho ativo agora" /> : <CartTable carts={r.active} />}
      </section>

      <section className="panel mb-6" aria-labelledby="ranking">
        <h2 id="ranking" className="text-2xl">
          Mais colocados no carrinho agora
        </h2>
        {r.ranking.length === 0 ? (
          <p className="text-ink-soft">Nada por enquanto.</p>
        ) : (
          <ol className="mt-2 space-y-1">
            {r.ranking.map((p) => (
              <li key={p.productId}>
                <Link href={`/produtos/${p.slug}`} target="_blank">
                  {p.name}
                </Link>{" "}
                <span className="text-ink-soft">
                  — {p.carts} {p.carts === 1 ? "carrinho" : "carrinhos"}, {p.units} un.
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel" aria-labelledby="abandonados">
        <h2 id="abandonados" className="text-2xl">
          Abandonados ({r.abandoned.length})
        </h2>
        <p className="hint !mt-0">Carrinhos com itens parados há mais de {ACTIVE_CART_MINUTES} min (até {r.funnel.days} dias) de quem não fez pedido depois.</p>
        {r.abandoned.length === 0 ? <EmptyState title="Nenhum carrinho abandonado" /> : <CartTable carts={r.abandoned} />}
      </section>
    </>
  );
}
