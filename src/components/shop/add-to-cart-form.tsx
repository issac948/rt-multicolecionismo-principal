"use client";

import Link from "next/link";
import { useState } from "react";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { Alert } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { MAX_CART_LINE_QUANTITY } from "@/lib/constants";
import { addToCartAction } from "@/server/actions/cart";
import type { FormState } from "@/server/actions/shared";

export function AddToCartForm({ productId, stock }: { productId: string; stock: number }) {
  const max = Math.max(0, Math.min(stock, MAX_CART_LINE_QUANTITY));
  const [quantity, setQuantity] = useState(1);
  const { state, onSubmit, pending } = useActionForm<FormState>(addToCartAction, {});

  if (max === 0) {
    return <Alert tone="warn">Este produto está sem estoque no momento.</Alert>;
  }

  const clamp = (n: number) => Math.min(max, Math.max(1, Number.isFinite(n) ? Math.trunc(n) : 1));

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="productId" value={productId} />

      <div>
        <label htmlFor="quantidade" className="label">
          Quantidade
        </label>
        <div className="inline-flex items-stretch">
          <button
            type="button"
            className="btn btn-outline !rounded-r-none !px-3"
            onClick={() => setQuantity((q) => clamp(q - 1))}
            disabled={quantity <= 1}
            aria-label="Diminuir quantidade"
          >
            <Minus size={18} aria-hidden />
          </button>
          <input
            id="quantidade"
            name="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            value={quantity}
            onChange={(e) => setQuantity(clamp(Number(e.target.value)))}
            className="input !w-16 !rounded-none text-center"
          />
          <button
            type="button"
            className="btn btn-outline !rounded-l-none !px-3"
            onClick={() => setQuantity((q) => clamp(q + 1))}
            disabled={quantity >= max}
            aria-label="Aumentar quantidade"
          >
            <Plus size={18} aria-hidden />
          </button>
        </div>
        <p className="hint">{stock <= 5 ? `Restam ${stock} em estoque.` : "Disponível em estoque."}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" name="intent" value="buy" className="btn btn-primary btn-block sm:w-auto" disabled={pending}>
          Comprar agora
        </button>
        <button type="submit" name="intent" value="add" className="btn btn-outline btn-block sm:w-auto" disabled={pending}>
          <ShoppingCart size={18} aria-hidden /> Adicionar ao carrinho
        </button>
      </div>

      {state.message && (
        <Alert tone={state.ok ? "ok" : "error"}>
          {state.message}{" "}
          {state.ok && (
            <Link href="/carrinho" className="font-bold">
              Ver carrinho
            </Link>
          )}
        </Alert>
      )}
    </form>
  );
}
