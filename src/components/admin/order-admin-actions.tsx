"use client";

import { Ban, PackageCheck, RotateCcw, Truck } from "lucide-react";
import { Alert, Field } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/constants";
import { refundOrderAction, updateOrderStatusAction } from "@/server/actions/admin";
import type { FormState } from "@/server/actions/shared";

const BUTTON_TEXT: Partial<Record<OrderStatus, string>> = {
  PROCESSANDO: "Começar a separar o pedido",
  ENVIADO: "Marcar como enviado",
  ENTREGUE: "Marcar como entregue",
  CANCELADO: "Cancelar pedido",
};

/** Botões de mudança de status. Só aparecem as mudanças que o sistema permite a partir do status atual. */
export function OrderStatusActions({
  orderId,
  nextStatuses,
  trackingCode,
  isPickup,
}: {
  orderId: string;
  nextStatuses: OrderStatus[];
  trackingCode: string | null;
  isPickup: boolean;
}) {
  const { state, onSubmit, pending } = useActionForm<FormState>(updateOrderStatusAction, {});
  if (nextStatuses.length === 0) {
    return <p className="text-ink-soft">Este pedido não tem mais mudanças de status possíveis.</p>;
  }
  const canShip = nextStatuses.includes("ENVIADO");

  return (
    <form
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.value === "CANCELADO" && !window.confirm("Cancelar este pedido? Os produtos voltam para o estoque.")) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
      className="space-y-4"
      noValidate
    >
      <input type="hidden" name="orderId" value={orderId} />

      {canShip && (
        <Field
          label={isPickup ? "Observação da retirada (opcional)" : "Código de rastreio (opcional)"}
          htmlFor="trackingCode"
          error={state.errors?.trackingCode}
          hint={isPickup ? undefined : "O cliente vê este código na página do pedido."}
        >
          <input id="trackingCode" name="trackingCode" className="input" defaultValue={trackingCode ?? ""} maxLength={80} />
        </Field>
      )}

      <div className="flex flex-wrap gap-3">
        {nextStatuses.map((next) => (
          <button
            key={next}
            type="submit"
            name="next"
            value={next}
            className={next === "CANCELADO" ? "btn btn-outline" : "btn btn-primary"}
            disabled={pending}
          >
            {next === "CANCELADO" ? <Ban size={18} aria-hidden /> : next === "ENVIADO" ? <Truck size={18} aria-hidden /> : <PackageCheck size={18} aria-hidden />}
            {BUTTON_TEXT[next] ?? `Marcar como ${ORDER_STATUS_LABEL[next]}`}
          </button>
        ))}
      </div>

      {state.message && <Alert tone={state.ok ? "ok" : "error"}>{state.message}</Alert>}
    </form>
  );
}

export function RefundButton({
  orderId,
  orderNumber,
  providerLabel,
  manual = false,
}: {
  orderId: string;
  orderNumber: number;
  providerLabel: string;
  /** Provedor sem reembolso pelo site (InfinitePay): o dono devolve pelo app e aqui só registra. */
  manual?: boolean;
}) {
  const { state, onSubmit, pending } = useActionForm<FormState>(refundOrderAction, {});
  return (
    <form
      onSubmit={(event) => {
        const question = manual
          ? `Você JÁ devolveu o dinheiro do pedido #${orderNumber} pelo app do ${providerLabel}? Só confirme depois de devolver: o pedido passa a "Reembolsado" e o estoque volta. Isso não pode ser desfeito.`
          : `Reembolsar o pedido #${orderNumber}? O valor volta para o cliente pelo ${providerLabel}. Isso não pode ser desfeito.`;
        if (!window.confirm(question)) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
      className="space-y-3"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <button type="submit" className="btn btn-danger" disabled={pending}>
        <RotateCcw size={18} aria-hidden /> {pending ? "Registrando..." : manual ? "Já devolvi pelo app: marcar como reembolsado" : "Reembolsar pedido"}
      </button>
      {state.message && <Alert tone={state.ok ? "ok" : "error"}>{state.message}</Alert>}
    </form>
  );
}
