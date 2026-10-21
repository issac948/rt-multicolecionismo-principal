"use client";

import { Alert } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { removeDemoProductsAction } from "@/server/actions/admin";
import type { FormState } from "@/server/actions/shared";

/** Botão do Resumo para tirar os produtos de demonstração (com confirmação). */
export function DemoRemoveButton({ count }: { count: number }) {
  const { state, onSubmit, pending } = useActionForm<FormState>(removeDemoProductsAction, {});
  return (
    <form
      onSubmit={(event) => {
        if (!window.confirm(`Remover os ${count} produtos de demonstração? Seus produtos reais não são afetados. Os que aparecem em pedidos só serão ocultados.`)) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
      className="mt-3"
    >
      <button type="submit" className="btn btn-dark btn-sm" disabled={pending}>
        {pending ? "Removendo..." : "Remover produtos de demonstração"}
      </button>
      {state.message && (
        <Alert tone={state.ok ? "ok" : "error"} className="mt-3">
          {state.message}
        </Alert>
      )}
    </form>
  );
}
