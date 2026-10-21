"use client";

import { useState, type FormEvent } from "react";
import { Truck } from "lucide-react";
import { formatBRL } from "@/lib/money";
import { formatCep } from "@/lib/text";
import { useShippingQuote } from "./use-shipping-quote";

/** "Calcule o frete" do carrinho: o cliente digita o CEP e vê as opções e os prazos antes de entrar na conta. */
export function ShippingCalculator() {
  const { state, quote } = useShippingQuote();
  const [cep, setCep] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void quote(cep);
  }

  return (
    <div className="space-y-3 rounded bg-panel p-3">
      <form onSubmit={onSubmit} noValidate className="space-y-2">
        <label htmlFor="calc-cep" className="flex items-center gap-2 text-sm font-bold">
          <Truck size={18} aria-hidden /> Calcular o frete
        </label>
        <div className="flex gap-2">
          <input
            id="calc-cep"
            className="input min-w-0 flex-1"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="Seu CEP (00000-000)"
            maxLength={9}
            value={cep}
            onChange={(e) => setCep(e.target.value.replace(/[^\d-]/g, ""))}
          />
          <button type="submit" className="btn btn-outline btn-sm" disabled={state.status === "loading"}>
            {state.status === "loading" ? "Calculando..." : "Calcular"}
          </button>
        </div>
      </form>

      {state.status === "error" && (
        <p className="text-sm font-semibold text-enamel-deep" role="alert">
          {state.message}
        </p>
      )}

      {state.status === "ok" && (
        <div className="text-sm" role="status">
          {state.options.length > 0 ? (
            <>
              <p className="text-ink-soft">Entrega para o CEP {formatCep(state.cep)}:</p>
              <ul className="mt-1 space-y-1">
                {state.options.map((option) => (
                  <li key={option.code}>
                    <strong>{option.label}:</strong> {option.priceCents === 0 ? "grátis" : formatBRL(option.priceCents)}
                    {option.estimate ? ` — ${option.estimate}` : ""}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="font-semibold text-enamel-deep">Não há entrega calculada para este CEP.</p>
          )}
          {state.notice && <p className="mt-1 text-ink-soft">{state.notice}</p>}
        </div>
      )}
    </div>
  );
}
