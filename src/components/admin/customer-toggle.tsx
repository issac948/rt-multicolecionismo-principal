"use client";

import { useActionForm } from "@/components/use-action-form";
import { toggleCustomerActiveAction } from "@/server/actions/admin";
import type { FormState } from "@/server/actions/shared";

export function CustomerToggle({ userId, active, name }: { userId: string; active: boolean; name: string }) {
  const { state, onSubmit, pending } = useActionForm<FormState>(toggleCustomerActiveAction, {});
  return (
    <form
      onSubmit={(event) => {
        if (active && !window.confirm(`Desativar a conta de ${name}? Ele(a) não vai conseguir mais entrar. Os pedidos continuam guardados.`)) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <button type="submit" className="btn btn-outline btn-sm" disabled={pending}>
        {active ? "Desativar" : "Reativar"}
        <span className="sr-only"> conta de {name}</span>
      </button>
      {state.message && !state.ok && <p className="field-error">{state.message}</p>}
    </form>
  );
}
