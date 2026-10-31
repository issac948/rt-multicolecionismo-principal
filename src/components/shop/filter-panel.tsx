"use client";

import { SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Painel de filtros da lista de produtos. No celular fica recolhido (abre se já houver filtro ativo);
 * em telas largas (1024 px ou mais) fica sempre aberto, como uma coluna ao lado da lista.
 */
export function FilterPanel({ activeCount, children }: { activeCount: number; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      if (ref.current) ref.current.open = media.matches || activeCount > 0;
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [activeCount]);

  return (
    <details ref={ref} className="filter-panel mb-6 rounded-md bg-panel p-4 lg:mb-0" open={activeCount > 0}>
      <summary className="flex cursor-pointer items-center gap-2 font-bold lg:cursor-default lg:pointer-events-none">
        <SlidersHorizontal size={18} aria-hidden />
        Filtrar e ordenar{activeCount > 0 ? ` (${activeCount} ativo${activeCount > 1 ? "s" : ""})` : ""}
      </summary>
      {children}
    </details>
  );
}
