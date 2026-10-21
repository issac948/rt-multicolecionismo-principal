"use client";

import { CreditCard, XCircle } from "lucide-react";
import { Alert } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { cancelOrderAction, payOrderAction } from "@/server/actions/checkout";
import type { FormState } from "@/server/actions/shared";

/** "Pagar agora" e "Cancelar pedido" na página do pedido. */
export function OrderActions({
  orderId,
  canPay,
  canCancel,
  paymentReady,
}: {
  orderId: string;
  canPay: boolean;
  canCancel: boolean;
  paymentReady: boolean;
}) {
  const pay = useActionForm<FormState>(payOrderAction, {});
  const cancel = useActionForm<FormState>(cancelOrderAction, {});
  const busy = pay.pending || cancel.pending;
  const error = pay.state.message ?? cancel.state.message;

  if (!canPay && !canCancel) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {canPay && (
          <form onSubmit={pay.onSubmit}>
            <input type="hidden" name="orderId" value={orderId} />
            <button type="submit" className="btn btn-primary" disabled={busy || !paymentReady}>
              <CreditCard size={18} aria-hidden /> {pay.pending ? "Abrindo pagamento..." : "Pagar agora"}
            </button>
          </form>
        )}
        {canCancel && (
          <form
            onSubmit={(event) => {
              if (!window.confirm("Cancelar este pedido? Os produtos voltam para o estoque da loja.")) {
                event.preventDefault();
                return;
              }
              cancel.onSubmit(event);
            }}
          >
            <input type="hidden" name="orderId" value={orderId} />
            <button type="submit" className="btn btn-outline" disabled={busy}>
              <XCircle size={18} aria-hidden /> Cancelar pedido
            </button>
          </form>
        )}
      </div>
      {canPay && !paymentReady && (
        <Alert tone="warn">O pagamento online não está disponível agora. Fale com a loja para concluir este pedido.</Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
