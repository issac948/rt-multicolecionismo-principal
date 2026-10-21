import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderActions } from "@/components/shop/order-actions";
import { Alert, OrderStatusBadge, PaymentStatusBadge } from "@/components/ui";
import { AWAITING_PAYMENT_STATUSES } from "@/lib/constants";
import { formatBRL } from "@/lib/money";
import { formatCep, formatDateTime, formatPhone, whatsappLink } from "@/lib/text";
import { UUID_RE } from "@/lib/schemas";
import { requireUser } from "@/server/auth/current-user";
import { getPaymentProvider, isPaymentConfigured } from "@/server/payments";
import { getOrderForUser } from "@/server/services/orders";
import { getSettings } from "@/server/services/settings";
import { fileUrl } from "@/server/storage";

export const metadata: Metadata = { title: "Pedido", robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OrderPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const user = await requireUser(`/pedido/${id}`);
  // Só o dono vê o pedido; para qualquer outra pessoa ele "não existe".
  const order = await getOrderForUser(id, user.id);
  if (!order) notFound();

  const query = await searchParams;
  const settings = await getSettings();

  const awaitingPayment = (AWAITING_PAYMENT_STATUSES as readonly string[]).includes(order.status);
  const expired = order.expiresAt !== null && order.expiresAt.getTime() <= Date.now();
  const canPay = awaitingPayment && !expired;
  const providerLabel = getPaymentProvider().label;
  const returnedFromGateway =
    typeof query.payment_id === "string" || typeof query.collection_id === "string" || typeof query.status === "string" || typeof query.retorno === "string";
  const returnOutcome = typeof query.retorno === "string" ? query.retorno : null;
  const paymentCancelled = query.pagamento === "cancelado";
  const paymentFailedToStart = query.pagamento === "falhou";
  const whatsapp = whatsappLink(settings.whatsapp, `Olá! Preciso de ajuda com o pedido #${order.number}.`);
  const address = order.shippingAddress;

  return (
    <div className="container-page py-10">
      <p className="text-sm">
        <Link href="/meus-pedidos">← Meus pedidos</Link>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1>Pedido #{order.number}</h1>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="mt-2 text-ink-soft">Feito em {formatDateTime(order.createdAt)}</p>

      <div className="mt-6 space-y-3">
        {paymentFailedToStart && awaitingPayment && (
          <Alert tone="warn">
            Seu pedido foi criado e os produtos estão reservados, mas não conseguimos abrir a página de pagamento agora. Clique em “Pagar agora”
            para tentar de novo.
          </Alert>
        )}
        {paymentCancelled && awaitingPayment && (
          <Alert tone="info">
            O pagamento foi cancelado no {providerLabel} e nada foi cobrado. O pedido continua reservado: clique em “Pagar agora” para tentar de novo.
          </Alert>
        )}
        {returnedFromGateway && awaitingPayment && (
          <Alert tone="info">
            {returnOutcome === "unavailable"
              ? `Não conseguimos confirmar o pagamento com o ${providerLabel} agora. Se você já pagou, aguarde alguns minutos e atualize esta página; o pedido só muda quando o ${providerLabel} confirma.`
              : `Estamos aguardando a confirmação do pagamento pelo ${providerLabel}. Isso costuma levar poucos instantes. Esta página mostra o status real do pedido: atualize para conferir.`}
          </Alert>
        )}
        {order.status === "PAGO" && <Alert tone="ok">Pagamento confirmado! A loja já vai separar o seu pedido.</Alert>}
        {canPay && order.expiresAt && (
          <Alert tone="warn">
            Pague até <strong>{formatDateTime(order.expiresAt)}</strong>. Depois disso o pedido é cancelado e os produtos voltam para a loja.
          </Alert>
        )}
        {awaitingPayment && expired && (
          <Alert tone="error">O prazo para pagar terminou e o pedido será cancelado em instantes. Faça um novo pedido se ainda quiser os produtos.</Alert>
        )}
        {order.status === "CANCELADO" && <Alert tone="error">Este pedido foi cancelado.</Alert>}
        {order.status === "REEMBOLSADO" && <Alert tone="info">O valor deste pedido foi reembolsado.</Alert>}
      </div>

      <div className="mt-6">
        <OrderActions orderId={order.id} canPay={canPay} canCancel={awaitingPayment} paymentReady={isPaymentConfigured()} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section className="panel" aria-labelledby="titulo-itens">
          <h2 id="titulo-itens" className="text-2xl">
            Itens
          </h2>
          <ul className="mt-4 divide-y divide-line">
            {order.items.map((item) => {
              const thumb = fileUrl(item.imageKey);
              return (
                <li key={item.id} className="flex items-center gap-4 py-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-panel">
                    {thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{item.name}</p>
                    <p className="text-sm text-ink-soft">
                      {item.quantity} × {formatBRL(item.unitPriceCents)}
                    </p>
                  </div>
                  <p className="font-bold tabular-nums">{formatBRL(item.totalCents)}</p>
                </li>
              );
            })}
          </ul>

          <dl className="mt-4 space-y-2 border-t border-line pt-4">
            <div className="flex justify-between gap-4">
              <dt>Produtos</dt>
              <dd className="tabular-nums">{formatBRL(order.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{order.shippingMethodLabel}</dt>
              <dd className="tabular-nums">{order.shippingCents === 0 ? "Grátis" : formatBRL(order.shippingCents)}</dd>
            </div>
            {order.discountCents > 0 && (
              <div className="flex justify-between gap-4">
                <dt>Desconto</dt>
                <dd className="tabular-nums">− {formatBRL(order.discountCents)}</dd>
              </div>
            )}
            <div className="flex items-end justify-between gap-4 border-t border-line pt-3">
              <dt className="font-bold">Total</dt>
              <dd className="text-2xl font-extrabold tabular-nums">{formatBRL(order.totalCents)}</dd>
            </div>
          </dl>
        </section>

        <aside className="space-y-6">
          <section className="panel space-y-2" aria-labelledby="titulo-pagamento">
            <h2 id="titulo-pagamento" className="text-2xl">
              Pagamento
            </h2>
            <p className="flex items-center gap-2">
              Status: <PaymentStatusBadge status={order.paymentStatus} />
            </p>
            {order.paidAt && <p className="text-sm text-ink-soft">Confirmado em {formatDateTime(order.paidAt)}</p>}
          </section>

          <section className="panel space-y-2" aria-labelledby="titulo-entrega">
            <h2 id="titulo-entrega" className="text-2xl">
              Entrega
            </h2>
            <p>
              <strong>{order.shippingMethodLabel}</strong>
              {order.shippingEstimate ? ` · ${order.shippingEstimate}` : ""}
            </p>
            {address ? (
              <address className="text-sm not-italic leading-relaxed">
                {address.recipientName}
                <br />
                {address.street}, {address.number}
                {address.complement ? ` — ${address.complement}` : ""}
                <br />
                {address.neighborhood} · {address.city}/{address.state}
                <br />
                CEP {formatCep(address.cep)} · {formatPhone(address.phone)}
              </address>
            ) : (
              <p className="text-sm text-ink-soft">{settings.shipping.pickupInstructions || "A loja combina a retirada com você."}</p>
            )}
            {order.trackingCode && (
              <p className="text-sm">
                Código de rastreio: <strong>{order.trackingCode}</strong>
              </p>
            )}
            {order.shippedAt && <p className="text-sm text-ink-soft">Enviado em {formatDateTime(order.shippedAt)}</p>}
            {order.deliveredAt && <p className="text-sm text-ink-soft">Entregue em {formatDateTime(order.deliveredAt)}</p>}
          </section>

          {order.customerNote && (
            <section className="panel">
              <h2 className="text-2xl">Sua observação</h2>
              <p className="mt-2 whitespace-pre-line text-sm">{order.customerNote}</p>
            </section>
          )}

          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-block">
              Falar com a loja sobre este pedido
            </a>
          )}
        </aside>
      </div>
    </div>
  );
}
