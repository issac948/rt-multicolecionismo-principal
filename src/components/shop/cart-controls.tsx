"use client";

import { Minus, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { MAX_CART_LINE_QUANTITY } from "@/lib/constants";
import { normalizeCartAction, removeCartItemAction, updateCartItemAction } from "@/server/actions/cart";
import type { FormState } from "@/server/actions/shared";

/**
 * Controles de uma linha do carrinho. Cada botão "−" / "+" envia o formulário já com a
 * nova quantidade; o servidor confere o estoque e responde. Nada de preço vem do navegador.
 */
export function CartLineControls({
  itemId,
  quantity,
  stock,
  productName,
}: {
  itemId: string;
  quantity: number;
  stock: number;
  productName: string;
}) {
  const update = useActionForm<FormState>(updateCartItemAction, {});
  const remove = useActionForm<FormState>(removeCartItemAction, {});
  const max = Math.min(stock, MAX_CART_LINE_QUANTITY);
  const busy = update.pending || remove.pending;
  const error = (update.state.message && !update.state.ok ? update.state.message : null) ?? (remove.state.message && !remove.state.ok ? remove.state.message : null);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={update.onSubmit} className="inline-flex items-stretch" aria-label={`Quantidade de ${productName}`}>
          <input type="hidden" name="itemId" value={itemId} />
          <button
            type="submit"
            name="quantity"
            value={quantity - 1}
            className="btn btn-outline btn-sm !rounded-r-none !px-3"
            disabled={busy || quantity <= 1}
            aria-label={`Diminuir a quantidade de ${productName}`}
          >
            <Minus size={16} aria-hidden />
          </button>
          <span
            className="grid min-w-12 place-items-center border-y-2 border-ink bg-white px-2 font-bold tabular-nums"
            aria-live="polite"
            aria-label={`${quantity} unidades`}
          >
            {quantity}
          </span>
          <button
            type="submit"
            name="quantity"
            value={quantity + 1}
            className="btn btn-outline btn-sm !rounded-l-none !px-3"
            disabled={busy || quantity >= max}
            aria-label={`Aumentar a quantidade de ${productName}`}
          >
            <Plus size={16} aria-hidden />
          </button>
        </form>

        <form onSubmit={remove.onSubmit}>
          <input type="hidden" name="itemId" value={itemId} />
          <button type="submit" className="btn-link inline-flex items-center gap-1 text-sm" disabled={busy}>
            <Trash2 size={16} aria-hidden /> Remover<span className="sr-only"> {productName}</span>
          </button>
        </form>
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

/** Corrige o carrinho de uma vez: remove o que acabou e reduz o que passou do estoque. */
export function NormalizeCartButton() {
  const { state, onSubmit, pending } = useActionForm<FormState>(normalizeCartAction, {});
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <button type="submit" className="btn btn-dark btn-block" disabled={pending}>
        <RefreshCw size={18} aria-hidden /> Ajustar carrinho automaticamente
      </button>
      {state.message && <Alert tone={state.ok ? "ok" : "error"}>{state.message}</Alert>}
    </form>
  );
}
