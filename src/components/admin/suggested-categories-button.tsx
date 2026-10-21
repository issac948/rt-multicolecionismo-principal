"use client";

import { Alert } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { createSuggestedCategoriesAction } from "@/server/actions/admin";
import type { FormState } from "@/server/actions/shared";

/** Cria a estrutura sugerida de categorias (só o que ainda não existe; não altera as suas). */
export function SuggestedCategoriesButton() {
  const { state, onSubmit, pending } = useActionForm<FormState>(createSuggestedCategoriesAction, {});
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <button type="submit" className="btn btn-dark btn-sm" disabled={pending}>
        {pending ? "Criando..." : "Criar categorias sugeridas"}
      </button>
      {state.message && <Alert tone={state.ok ? "ok" : "error"}>{state.message}</Alert>}
    </form>
  );
}
