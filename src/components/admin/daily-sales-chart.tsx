"use client";

import { useId, useState } from "react";
import { formatBRL } from "@/lib/money";

export type DailyPoint = { day: string; revenueCents: number; orders: number };

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function dayLabel(day: string) {
  const [, month, date] = day.split("-");
  return `${date}/${month}`;
}

function weekday(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Escala simples com marcas "redondas" (0, meio, topo) em reais. */
function niceMax(cents: number) {
  // Mínimo de R$ 10 no topo: com a loja ainda sem vendas, a escala não vira "R$ 1 / R$ 1".
  const reais = Math.max(10, cents / 100);
  const magnitude = 10 ** Math.floor(Math.log10(reais));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * magnitude).find((s) => s >= reais) ?? 10 * magnitude;
  return step * 100;
}

function compactBRL(cents: number) {
  const reais = cents / 100;
  if (reais >= 1000) return `R$ ${(reais / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${reais.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

/**
 * Colunas de vendas pagas por dia. Uma série só (sem legenda); o valor exato aparece
 * ao passar o mouse / focar a coluna e, sempre, na tabela alternativa.
 */
export function DailySalesChart({ data }: { data: DailyPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const tableId = useId();

  const max = Math.max(0, ...data.map((d) => d.revenueCents));
  const top = niceMax(max);
  const total = data.reduce((sum, d) => sum + d.revenueCents, 0);
  const peak = max > 0 ? data.findIndex((d) => d.revenueCents === max) : -1;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">
          Total no período: <strong className="text-ink">{formatBRL(total)}</strong>
        </p>
        <button type="button" className="btn-link text-sm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable} aria-controls={tableId}>
          {asTable ? "Ver gráfico" : "Ver como tabela"}
        </button>
      </div>

      {asTable ? (
        <div id={tableId} className="table-wrap mt-3">
          <table className="table">
            <caption className="sr-only">Vendas pagas por dia</caption>
            <thead>
              <tr>
                <th scope="col">Dia</th>
                <th scope="col" className="text-right">Pedidos pagos</th>
                <th scope="col" className="text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.day}>
                  <th scope="row" className="font-normal">
                    {weekday(d.day)} {dayLabel(d.day)}
                  </th>
                  <td className="text-right tabular-nums">{d.orders}</td>
                  <td className="text-right tabular-nums">{formatBRL(d.revenueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div id={tableId} className="mt-4 grid grid-cols-[3.5rem_1fr] gap-x-2">
          {/* Eixo vertical: apenas 0, meio e topo */}
          <div className="relative h-44 text-right text-xs text-ink-soft" aria-hidden>
            {[1, 0.5, 0].map((fraction) => (
              <span key={fraction} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - fraction) * 100}%` }}>
                {fraction === 0 ? "0" : compactBRL(top * fraction)}
              </span>
            ))}
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-44" aria-hidden>
              {[0, 0.5, 1].map((fraction) => (
                <div key={fraction} className="absolute inset-x-0 border-t border-line" style={{ top: `${fraction * 100}%` }} />
              ))}
            </div>

            <ul className="relative flex h-44 items-end" role="list" aria-label="Vendas pagas por dia, últimos 14 dias">
              {data.map((d, i) => {
                const height = top > 0 ? (d.revenueCents / top) * 100 : 0;
                const isActive = active === i;
                return (
                  <li key={d.day} className="relative flex h-full flex-1 items-end justify-center">
                    <div
                      tabIndex={0}
                      role="img"
                      aria-label={`${weekday(d.day)} ${dayLabel(d.day)}: ${formatBRL(d.revenueCents)} em ${d.orders} ${d.orders === 1 ? "pedido pago" : "pedidos pagos"}`}
                      className="group flex h-full w-full items-end justify-center outline-offset-[-2px]"
                      onPointerEnter={() => setActive(i)}
                      onPointerLeave={() => setActive((c) => (c === i ? null : c))}
                      onFocus={() => setActive(i)}
                      onBlur={() => setActive((c) => (c === i ? null : c))}
                    >
                      {d.revenueCents > 0 && (
                        <div
                          className="w-full max-w-5 rounded-t-[4px] bg-ink transition-opacity"
                          style={{ height: `${Math.max(height, 1.5)}%`, opacity: active !== null && !isActive ? 0.55 : 1 }}
                        />
                      )}
                    </div>

                    {i === peak && !isActive && (
                      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold" style={{ bottom: `calc(${Math.max(height, 1.5)}% + 4px)` }} aria-hidden>
                        {compactBRL(d.revenueCents)}
                      </span>
                    )}

                    {isActive && (
                      <div
                        className="pointer-events-none absolute z-10 w-max rounded bg-ink px-3 py-2 text-xs text-white shadow-md"
                        style={{
                          bottom: `calc(${Math.max(height, 1.5)}% + 8px)`,
                          left: i < 3 ? 0 : undefined,
                          right: i > data.length - 4 ? 0 : undefined,
                          ...(i >= 3 && i <= data.length - 4 ? { left: "50%", transform: "translateX(-50%)" } : {}),
                        }}
                        role="status"
                      >
                        <p className="text-sm font-bold">{formatBRL(d.revenueCents)}</p>
                        <p className="text-white/80">
                          {weekday(d.day)} {dayLabel(d.day)} · {d.orders} {d.orders === 1 ? "pedido" : "pedidos"}
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <ul className="mt-1 flex text-[0.7rem] text-ink-soft" aria-hidden>
              {data.map((d, i) => (
                <li key={d.day} className="flex-1 text-center">
                  {i % 2 === data.length % 2 ? dayLabel(d.day) : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
