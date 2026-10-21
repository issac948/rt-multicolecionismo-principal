"use client";

import { useEffect, useRef } from "react";
import { Alert, Field } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { adjustStockAction } from "@/server/actions/admin";
import type { FormState } from "@/server/actions/shared";

export type StockProductOption = { id: string; name: string; stock: number; active: boolean };

/** Entrada, saída ou contagem de estoque. Tudo fica registrado no histórico. */
export function StockAdjustForm({ products, defaultProductId }: { products: StockProductOption[]; defaultProductId?: string }) {
  const { state, onSubmit, pending } = useActionForm<FormState>(adjustStockAction, {});
  const errors = state.errors ?? {};
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    // Mantém o produto escolhido (é comum ajustar vários seguidos), limpa quantidade e motivo.
    const form = formRef.current;
    if (!form) return;
    for (const name of ["quantity", "reason"]) {
      const input = form.elements.namedItem(name);
      if (input instanceof HTMLInputElement) input.value = "";
    }
  }, [state]);

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-6">
      <div className="md:col-span-3">
        <Field label="Produto" htmlFor="productId" error={errors.productId}>
          <select id="productId" name="productId" className="select" defaultValue={defaultProductId ?? ""} required>
            <option value="" disabled>
              Escolha o produto
            </option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} — {product.stock} em estoque{product.active ? "" : " (rascunho)"}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="md:col-span-3">
        <Field label="O que aconteceu?" htmlFor="mode" error={errors.mode}>
          <select id="mode" name="mode" className="select" defaultValue="ENTRADA">
            <option value="ENTRADA">Chegou mercadoria (somar ao estoque)</option>
            <option value="SAIDA">Saiu / perdeu mercadoria (subtrair do estoque)</option>
            <option value="DEFINIR">Contei o estoque (definir a quantidade exata)</option>
          </select>
        </Field>
      </div>

      <div className="md:col-span-2">
        <Field label="Quantidade" htmlFor="quantity" error={errors.quantity} hint="Número inteiro.">
          <input id="quantity" name="quantity" className="input" inputMode="numeric" required />
        </Field>
      </div>
      <div className="md:col-span-4">
        <Field label="Motivo (opcional)" htmlFor="reason" error={errors.reason} hint="Ex.: Reposição do fornecedor, produto danificado, contagem do mês.">
          <input id="reason" name="reason" className="input" maxLength={200} />
        </Field>
      </div>

      <div className="md:col-span-6">
        {state.message && (
          <Alert tone={state.ok ? "ok" : "error"} className="mb-3">
            {state.message}
          </Alert>
        )}
        <button type="submit" className="btn btn-dark" disabled={pending}>
          {pending ? "Salvando..." : "Registrar no estoque"}
        </button>
      </div>
    </form>
  );
}
