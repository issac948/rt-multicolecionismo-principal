import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { CopyButton } from "@/components/admin/print-copy-buttons";
import { addressToText } from "@/lib/address-text";
import { AdminPageHeader, SectionPanel } from "@/components/admin/admin-ui";
import { OrderStatusActions, RefundButton } from "@/components/admin/order-admin-actions";
import { Alert, OrderStatusBadge, PaymentStatusBadge } from "@/components/ui";
import { PAID_ORDER_STATUSES } from "@/lib/constants";
import { formatBRL } from "@/lib/money";
import { UUID_RE } from "@/lib/schemas";
import { formatCep, formatDateTime, formatPhone, paymentMethodLabel, whatsappLink } from "@/lib/text";
import { requireAdminPage } from "@/server/auth/current-user";
import { getPaymentProvider, isPaymentConfigured } from "@/server/payments";
import { allowedNextStatuses, getOrderDetail } from "@/server/services/orders";
import { fileUrl } from "@/server/storage";

export const metadata: Metadata = { title: "Pedido" };

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdminPage(`/admin/pedidos/${id}`);
  if (!UUID_RE.test(id)) notFound();

  const order = await getOrderDetail(id);
  if (!order) notFound();

  const address = order.shippingAddress;
  const isPickup = order.shippingMethodCode === "RETIRADA";
  const approvedPayment = order.payments.find((p) => p.status === "APROVADO");
  const canRefund =
    Boolean(approvedPayment) &&
    order.paymentStatus === "APROVADO" &&
    (PAID_ORDER_STATUSES as readonly string[]).includes(order.status);
  const contact = whatsappLink(order.customerPhone, `Olá, ${order.customerName.split(" ")[0]}! Sobre o seu pedido #${order.number}:`);

  return (
    <>
      <AdminPageHeader
        title={`Pedido #${order.number}`}
        back={{ href: "/admin/pedidos", label: "Pedidos" }}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} /> <PaymentStatusBadge status={order.paymentStatus} /> · feito em {formatDateTime(order.createdAt)}
          </span>
        }
      />

      {order.attentionNote && (
        <Alert tone="warn" className="mb-4">
          <strong>Aviso:</strong> {order.attentionNote}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <div className="space-y-6">
          <SectionPanel title="Itens" id="titulo-itens">
            <ul className="divide-y divide-line">
              {order.items.map((item) => {
                const thumb = fileUrl(item.imageKey);
                return (
                  <li key={item.id} className="flex items-center gap-4 py-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-panel">
                      {thumb && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{item.name}</p>
                      <p className="text-sm text-ink-soft">
                        {item.quantity} × {formatBRL(item.unitPriceCents)}
                        {item.sku ? ` · Cód. ${item.sku}` : ""}
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
              {order.discountCents > 0 && (
                <div className="flex justify-between gap-4 text-ok">
                  <dt>Cupom {order.couponCode ?? ""}</dt>
                  <dd className="tabular-nums">− {formatBRL(order.discountCents)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt>{order.shippingMethodLabel}</dt>
                <dd className="tabular-nums">{order.shippingCents === 0 ? "Grátis" : formatBRL(order.shippingCents)}</dd>
              </div>
              <div className="flex items-end justify-between gap-4 border-t border-line pt-3">
                <dt className="font-bold">Total</dt>
                <dd className="text-2xl font-extrabold tabular-nums">{formatBRL(order.totalCents)}</dd>
              </div>
            </dl>
          </SectionPanel>

          <SectionPanel title="Pagamentos registrados" id="titulo-pagamentos">
            {order.payments.length === 0 ? (
              <p className="text-ink-soft">Nenhum pagamento recebido ainda.</p>
            ) : (
              <div className="table-wrap border border-line">
                <table className="table table-cards">
                  <thead>
                    <tr>
                      <th scope="col">Quando</th>
                      <th scope="col">Forma</th>
                      <th scope="col">Status</th>
                      <th scope="col">Detalhe</th>
                      <th scope="col" className="text-right">
                        Valor
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td data-primary className="whitespace-nowrap">{formatDateTime(payment.createdAt)}</td>
                        <td data-label="Forma">{paymentMethodLabel(payment.method)}</td>
                        <td data-label="Status">
                          <PaymentStatusBadge status={payment.status} />
                        </td>
                        <td data-label="Detalhe" className="text-sm text-ink-soft">{payment.statusDetail ?? payment.rawStatus ?? ""}</td>
                        <td data-label="Valor" className="text-right tabular-nums">{formatBRL(payment.amountCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-ink-soft">O pedido só é marcado como pago depois que o {getPaymentProvider().label} confirma o pagamento direto ao servidor da loja.</p>
          </SectionPanel>
        </div>

        <div className="space-y-6">
          <SectionPanel title="Andamento" id="titulo-andamento">
            <OrderStatusActions orderId={order.id} nextStatuses={allowedNextStatuses(order.status)} trackingCode={order.trackingCode} isPickup={isPickup} />
            {order.trackingCode && <p className="mt-3 text-sm">Rastreio atual: <strong>{order.trackingCode}</strong></p>}
            {order.expiresAt && (order.status === "PENDENTE" || order.status === "PAGAMENTO_PENDENTE") && (
              <p className="mt-3 text-sm text-ink-soft">Prazo para pagar: {formatDateTime(order.expiresAt)}. Depois disso o pedido é cancelado sozinho e o estoque volta.</p>
            )}
          </SectionPanel>

          {canRefund && (
            <SectionPanel title="Reembolso" id="titulo-reembolso">
              {isPaymentConfigured() ? (
                <>
                  <p className="mb-3 text-sm text-ink-soft">
                    {getPaymentProvider().manualRefund
                      ? `O ${getPaymentProvider().label} não devolve dinheiro pelo site: devolva o valor no app do ${getPaymentProvider().label} e depois clique abaixo para registrar aqui. `
                      : "Devolve o valor total ao cliente. "}
                    O pedido passa a “Reembolsado”. Se o pedido ainda não foi enviado, os produtos voltam para o estoque sozinhos. Se já foi enviado, registre a entrada em Estoque quando a mercadoria voltar.</p>
                  <RefundButton orderId={order.id} orderNumber={order.number} providerLabel={getPaymentProvider().label} manual={Boolean(getPaymentProvider().manualRefund)} />
                </>
              ) : (
                <p className="text-sm text-ink-soft">Configure o {getPaymentProvider().label} no servidor para poder reembolsar por aqui.</p>
              )}
            </SectionPanel>
          )}

          {order.paymentStatus === "REEMBOLSADO" && (
            <SectionPanel title="Reembolso" id="titulo-reembolsado">
              <p>O valor deste pedido foi devolvido ao cliente pelo {getPaymentProvider().label}.</p>
            </SectionPanel>
          )}

          <SectionPanel title="Cliente" id="titulo-cliente">
            <p className="font-bold">{order.customerName}</p>
            <p className="text-sm">{order.customerEmail}</p>
            {order.customerPhone && <p className="text-sm">{formatPhone(order.customerPhone)}</p>}
            {contact && (
              <a href={contact} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm mt-3">
                <MessageCircle size={16} aria-hidden /> Chamar no WhatsApp
              </a>
            )}
            {order.customerNote && (
              <div className="mt-4 rounded bg-paper p-3 text-sm">
                <p className="font-semibold">Observação do cliente</p>
                <p className="mt-1 whitespace-pre-line">{order.customerNote}</p>
              </div>
            )}
          </SectionPanel>

          <SectionPanel title="Entrega" id="titulo-entrega">
            <p>
              <strong>{order.shippingMethodLabel}</strong>
              {order.shippingEstimate ? ` · ${order.shippingEstimate}` : ""}
            </p>
            {address ? (
              <>
              <address className="mt-2 text-sm not-italic leading-relaxed">
                {address.recipientName}
                <br />
                {address.street}, {address.number}
                {address.complement ? ` — ${address.complement}` : ""}
                <br />
                {address.neighborhood} · {address.city}/{address.state}
                <br />
                CEP {formatCep(address.cep)} · {formatPhone(address.phone)}
              </address>
              <div className="mt-3">
                <CopyButton text={addressToText(address)} label="Copiar endereço" />
              </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">Cliente retira na loja.</p>
            )}
            <dl className="mt-3 space-y-1 text-sm text-ink-soft">
              {order.paidAt && (
                <div>
                  Pago em {formatDateTime(order.paidAt)}
                </div>
              )}
              {order.shippedAt && <div>Enviado em {formatDateTime(order.shippedAt)}</div>}
              {order.deliveredAt && <div>Entregue em {formatDateTime(order.deliveredAt)}</div>}
              {order.cancelledAt && <div>Cancelado em {formatDateTime(order.cancelledAt)}</div>}
            </dl>
          </SectionPanel>
        </div>
      </div>
    </>
  );
}
