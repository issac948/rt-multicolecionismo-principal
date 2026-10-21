"use client";

import { Alert, Field } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { testShippingAction } from "@/server/actions/admin";
import type { FormState } from "@/server/actions/shared";

type TestState = FormState & { lines?: string[] };

/** Testa o frete pela SuperFrete com o CEP de origem JÁ SALVO. Fica fora do formulário principal (formulários não se aninham). */
export function ShippingTestForm() {
  const { state, onSubmit, pending } = useActionForm<TestState>(testShippingAction, {});
  const errors = state.errors ?? {};

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3 rounded-md border border-line bg-paper p-4">
      <h3 className="text-xl">Testar o frete</h3>
      <p className="text-sm text-ink-soft">
        Consulta a SuperFrete de verdade, com o CEP de origem que você salvou e um produto com o peso e as medidas padrão. Use para conferir se o token e o endereço estão certos.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <Field label="CEP de destino para o teste" htmlFor="testCep" error={errors.testCep}>
            <input id="testCep" name="testCep" className="input" inputMode="numeric" maxLength={9} placeholder="00000-000" />
          </Field>
        </div>
        <button type="submit" className="btn btn-outline" disabled={pending}>
          {pending ? "Consultando..." : "Testar frete"}
        </button>
      </div>
      {state.message && (
        <Alert tone={state.ok ? "ok" : "error"}>
          {state.message}
          {state.lines && state.lines.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {state.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
    </form>
  );
}
