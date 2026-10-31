"use client";

import { Alert } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { runMaintenanceNowAction } from "@/server/actions/admin";
import type { FormState } from "@/server/actions/shared";

/** Botão do Resumo: roda agora a manutenção (cancela pedidos não pagos vencidos e devolve o estoque; limpa o que sobrou). */
export function MaintenanceButton() {
  const { state, onSubmit, pending } = useActionForm<FormState>(runMaintenanceNowAction, {});
  return (
    <form onSubmit={onSubmit} className="mt-3">
      <button type="submit" className="btn btn-outline btn-sm" disabled={pending}>
        {pending ? "Executando..." : "Executar manutenção agora"}
      </button>
      {state.message && (
        <Alert tone={state.ok ? "ok" : "error"} className="mt-3">
          {state.message}
        </Alert>
      )}
    </form>
  );
}
