"use client";

import { useCallback, useRef, useState } from "react";

export type QuotedShippingOption = {
  code: string;
  label: string;
  priceCents: number;
  estimate: string | null;
  requiresAddress: boolean;
  description?: string;
};

export type ShippingQuoteState =
  | { status: "idle" }
  | { status: "loading"; cep: string }
  | { status: "ok"; cep: string; options: QuotedShippingOption[]; notice: string | null }
  | { status: "error"; cep: string; message: string };

/** Consulta o frete pelo CEP no servidor (a loja recalcula tudo de novo ao criar o pedido). */
export function useShippingQuote() {
  const [state, setState] = useState<ShippingQuoteState>({ status: "idle" });
  const sequence = useRef(0);

  const quote = useCallback(async (rawCep: string) => {
    const cep = rawCep.replace(/\D/g, "");
    if (cep.length !== 8) {
      sequence.current += 1;
      setState({ status: "idle" });
      return;
    }
    const id = ++sequence.current;
    setState({ status: "loading", cep });
    try {
      const response = await fetch("/api/frete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cep }),
      });
      const json = (await response.json().catch(() => ({}))) as { options?: QuotedShippingOption[]; notice?: string | null; error?: string };
      if (id !== sequence.current) return; // chegou uma resposta de um CEP antigo
      if (!response.ok) {
        setState({ status: "error", cep, message: json.error ?? "Não foi possível calcular o frete agora." });
        return;
      }
      setState({ status: "ok", cep, options: json.options ?? [], notice: json.notice ?? null });
    } catch {
      if (id !== sequence.current) return;
      setState({ status: "error", cep, message: "Falha de conexão ao calcular o frete. Tente de novo." });
    }
  }, []);

  const reset = useCallback(() => {
    sequence.current += 1;
    setState({ status: "idle" });
  }, []);

  return { state, quote, reset };
}
