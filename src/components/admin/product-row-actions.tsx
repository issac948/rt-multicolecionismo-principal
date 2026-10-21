"use client";

import { Eye, EyeOff, Trash2 } from "lucide-react";
import { useActionForm } from "@/components/use-action-form";
import { deleteProductAction, toggleProductActiveAction } from "@/server/actions/admin";
import type { FormState } from "@/server/actions/shared";

/** Publicar/ocultar rapidamente, direto da lista de produtos. */
export function ToggleProductActive({ productId, active, name }: { productId: string; active: boolean; name: string }) {
  const { state, onSubmit, pending } = useActionForm<FormState>(toggleProductActiveAction, {});
  return (
    <form onSubmit={onSubmit} className="inline">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <button type="submit" className="btn btn-outline btn-sm" disabled={pending}>
        {active ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        {active ? "Ocultar" : "Publicar"}
        <span className="sr-only"> {name}</span>
      </button>
      {state.message && !state.ok && <span className="field-error ml-2">{state.message}</span>}
    </form>
  );
}

/** Exclusão definitiva, com confirmação. Pedidos antigos continuam guardando nome e preço. */
export function DeleteProductButton({ productId, name }: { productId: string; name: string }) {
  const { state, onSubmit, pending } = useActionForm<FormState>(deleteProductAction, {});
  return (
    <form
      onSubmit={(event) => {
        if (!window.confirm(`Excluir "${name}" definitivamente? Isso não pode ser desfeito. Para só tirar da loja, use "Ocultar".`)) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
      className="space-y-2"
    >
      <input type="hidden" name="productId" value={productId} />
      <button type="submit" className="btn btn-danger" disabled={pending}>
        <Trash2 size={18} aria-hidden /> {pending ? "Excluindo..." : "Excluir produto"}
      </button>
      {state.message && !state.ok && <p className="field-error">{state.message}</p>}
    </form>
  );
}
