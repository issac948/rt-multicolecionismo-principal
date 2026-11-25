"use client";

import { useState } from "react";
import { Copy, Printer } from "lucide-react";

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <button type="button" className="btn btn-dark print:hidden" onClick={() => window.print()}>
      <Printer aria-hidden size={16} /> {label}
    </button>
  );
}

/** Copia um texto (ex.: endereço de entrega) para colar no SuperFrete ou no WhatsApp. */
export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "erro">("idle");
  return (
    <button
      type="button"
      className="btn btn-outline print:hidden"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("ok");
        } catch {
          setState("erro");
        }
        setTimeout(() => setState("idle"), 2500);
      }}
    >
      <Copy aria-hidden size={16} /> {state === "ok" ? "Copiado!" : state === "erro" ? "Não foi possível copiar" : label}
    </button>
  );
}
