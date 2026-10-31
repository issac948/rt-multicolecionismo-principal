"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import {
  addDaysIso,
  buildMonthGrid,
  EVENT_STATUS_LABEL,
  EVENT_STATUS_TONE,
  formatEventDateLong,
  formatMonthLabel,
  formatTimeRange,
  groupEventsByDate,
  monthKeyOf,
  shiftMonth,
  WEEKDAY_NARROW,
  WEEKDAY_SHORT,
  type CalendarEvent,
} from "@/lib/events";
import { cn } from "@/lib/text";

type Props = {
  /** Mês mostrado de início (AAAA-MM). */
  initialMonth: string;
  /** Eventos desse mês, já carregados no servidor (a página abre sem esperar). */
  initialEvents: CalendarEvent[];
  /** Dia que abre selecionado (AAAA-MM-DD), se houver. */
  initialSelected?: string | null;
  /** "Hoje" no fuso de São Paulo, calculado no servidor (evita diferença entre servidor e navegador). */
  today: string;
  /** Rota que devolve os eventos de um mês: GET `${endpoint}?mes=AAAA-MM` → { events }. */
  endpoint: string;
  /** Primeiro e último mês que se pode abrir. */
  minMonth: string;
  maxMonth: string;
  /** "painel" mostra rascunhos e cancelados, o status e o link para editar. */
  mode?: "site" | "painel";
  /** Só no painel: início do endereço para editar um evento (o id é somado no fim) e para criar um novo numa data (a data é somada no fim). */
  editBase?: string;
  newBase?: string;
  /** Atualiza ?mes= e ?dia= na barra de endereço, para o link poder ser compartilhado. */
  syncUrl?: boolean;
  className?: string;
};

type DayTone = "ativo" | "rascunho" | "cancelado" | null;

function toneOf(list: CalendarEvent[] | undefined): DayTone {
  if (!list || list.length === 0) return null;
  if (list.some((e) => !e.status || e.status === "PUBLICADO")) return "ativo";
  if (list.some((e) => e.status === "RASCUNHO")) return "rascunho";
  return "cancelado";
}

/**
 * Calendário mensal de eventos. A mesma peça serve o site público e o painel.
 * - Dias com evento ficam pretos com o número dourado; os pequenos quadrados embaixo contam quantos eventos há (até 3).
 * - Escolher um dia mostra todos os eventos dele (nome, horário, local, descrição e foto).
 * - Teclado: setas movem entre os dias, PageUp/PageDown trocam de mês, Home/End vão ao início/fim da semana.
 */
export function EventsCalendar({
  initialMonth,
  initialEvents,
  initialSelected = null,
  today,
  endpoint,
  minMonth,
  maxMonth,
  mode = "site",
  editBase,
  newBase,
  syncUrl = false,
  className,
}: Props) {
  const [month, setMonth] = useState(initialMonth);
  const [cache, setCache] = useState<Record<string, CalendarEvent[]>>({ [initialMonth]: initialEvents });
  const [selected, setSelected] = useState<string | null>(initialSelected && monthKeyOf(initialSelected) === initialMonth ? initialSelected : null);
  const [focusIso, setFocusIso] = useState<string>(initialSelected ?? (monthKeyOf(today) === initialMonth ? today : `${initialMonth}-01`));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; month: string } | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const requestId = useRef(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const weeks = useMemo(() => buildMonthGrid(month), [month]);
  const monthEvents = cache[month];
  const byDate = useMemo(() => groupEventsByDate(monthEvents ?? []), [monthEvents]);
  const selectedEvents = selected ? (byDate.get(selected) ?? []) : [];
  const isPainel = mode === "painel";
  const monthCount = monthEvents?.length ?? 0;

  const loadMonth = useCallback(
    async (key: string) => {
      if (cache[key]) {
        setError(null);
        return true;
      }
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${endpoint}?mes=${key}`, { headers: { accept: "application/json" } });
        if (!response.ok) throw new Error(String(response.status));
        const json = (await response.json()) as { events?: CalendarEvent[] };
        if (id !== requestId.current) return false; // chegou uma resposta mais nova; ignora esta
        setCache((current) => ({ ...current, [key]: json.events ?? [] }));
        return true;
      } catch {
        if (id === requestId.current) setError({ message: "Não foi possível carregar este mês. Confira a internet e tente de novo.", month: key });
        return false;
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [cache, endpoint],
  );

  const writeUrl = useCallback(
    (key: string, day: string | null) => {
      if (!syncUrl || typeof window === "undefined") return;
      const url = new URL(window.location.href);
      if (key === monthKeyOf(today)) url.searchParams.delete("mes");
      else url.searchParams.set("mes", key);
      if (day) url.searchParams.set("dia", day);
      else url.searchParams.delete("dia");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    },
    [syncUrl, today],
  );

  const goToMonth = useCallback(
    async (key: string, options: { select?: string | null; focus?: string | null } = {}) => {
      if (key < minMonth || key > maxMonth) return;
      const ok = await loadMonth(key);
      if (!ok) return;
      setMonth(key);
      const select = options.select ?? null;
      setSelected(select);
      setFocusIso(options.focus ?? select ?? (monthKeyOf(today) === key ? today : `${key}-01`));
      pendingFocus.current = options.focus ?? null;
      writeUrl(key, select);
    },
    [loadMonth, maxMonth, minMonth, today, writeUrl],
  );

  // Depois de trocar de mês pelo teclado, devolve o foco para o dia certo.
  useEffect(() => {
    const iso = pendingFocus.current;
    if (!iso) return;
    pendingFocus.current = null;
    gridRef.current?.querySelector<HTMLElement>(`[data-iso="${iso}"]`)?.focus();
  }, [month]);

  const selectDay = (iso: string) => {
    setSelected(iso);
    setFocusIso(iso);
    writeUrl(month, iso);
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-iso]");
    const iso = cell?.dataset.iso;
    if (!iso) return;
    let target: string | null = null;
    switch (event.key) {
      case "ArrowLeft":
        target = addDaysIso(iso, -1);
        break;
      case "ArrowRight":
        target = addDaysIso(iso, 1);
        break;
      case "ArrowUp":
        target = addDaysIso(iso, -7);
        break;
      case "ArrowDown":
        target = addDaysIso(iso, 7);
        break;
      case "Home":
        target = addDaysIso(iso, -new Date(`${iso}T00:00:00Z`).getUTCDay());
        break;
      case "End":
        target = addDaysIso(iso, 6 - new Date(`${iso}T00:00:00Z`).getUTCDay());
        break;
      case "PageUp":
      case "PageDown": {
        const key = shiftMonth(monthKeyOf(iso), event.key === "PageUp" ? -1 : 1);
        event.preventDefault();
        void goToMonth(key, { focus: `${key}-01` });
        return;
      }
      default:
        return;
    }
    event.preventDefault();
    if (monthKeyOf(target) === month) {
      setFocusIso(target);
      gridRef.current?.querySelector<HTMLElement>(`[data-iso="${target}"]`)?.focus();
    } else {
      void goToMonth(monthKeyOf(target), { focus: target });
    }
  };

  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const currentMonthKey = monthKeyOf(today);

  return (
    <div className={cn("cal", className)} data-mode={mode}>
      <div className="cal-board">
        <div className="cal-head">
          <p className="cal-month" aria-live="polite">
            {formatMonthLabel(month)}
          </p>
          <div className="cal-nav">
            {month !== currentMonthKey && minMonth <= currentMonthKey && currentMonthKey <= maxMonth && (
              <button type="button" className="btn-link cal-today" onClick={() => void goToMonth(currentMonthKey)}>
                Ir para hoje
              </button>
            )}
            <button type="button" className="cal-arrow" onClick={() => void goToMonth(prevMonth)} disabled={prevMonth < minMonth} aria-label={`Mês anterior: ${formatMonthLabel(prevMonth)}`}>
              <ChevronLeft size={22} aria-hidden />
            </button>
            <button type="button" className="cal-arrow" onClick={() => void goToMonth(nextMonth)} disabled={nextMonth > maxMonth} aria-label={`Próximo mês: ${formatMonthLabel(nextMonth)}`}>
              <ChevronRight size={22} aria-hidden />
            </button>
          </div>
        </div>

        <div
          ref={gridRef}
          role="grid"
          aria-label={`Calendário de ${formatMonthLabel(month)}`}
          aria-busy={loading}
          className={cn("cal-grid", loading && "is-loading")}
          onKeyDown={onGridKeyDown}
        >
          <div role="row" className="cal-weekdays">
            {WEEKDAY_SHORT.map((name, i) => (
              <span key={name} role="columnheader">
                <span className="sr-only">{["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"][i]}</span>
                <span aria-hidden className="hidden sm:inline">
                  {name}
                </span>
                <span className="sm:hidden" aria-hidden>
                  {WEEKDAY_NARROW[i]}
                </span>
              </span>
            ))}
          </div>
          {weeks.map((week) => (
            <div role="row" className="cal-week" key={week[0].iso}>
              {week.map((cell) => {
                if (!cell.inMonth) return <span role="gridcell" key={cell.iso} className="cal-blank" aria-hidden />;
                const list = byDate.get(cell.iso);
                const tone = toneOf(list);
                const count = list?.length ?? 0;
                const isSelected = selected === cell.iso;
                const isToday = cell.iso === today;
                const isPast = cell.iso < today;
                const label = `${formatEventDateLong(cell.iso)}${isToday ? ", hoje" : ""}. ${count === 0 ? "Sem eventos" : count === 1 ? "1 evento" : `${count} eventos`}`;
                return (
                  <span role="gridcell" key={cell.iso}>
                    <button
                      type="button"
                      data-iso={cell.iso}
                      data-tone={tone ?? undefined}
                      aria-label={label}
                      aria-pressed={isSelected}
                      aria-current={isToday ? "date" : undefined}
                      tabIndex={focusIso === cell.iso ? 0 : -1}
                      className={cn("cal-day", tone && "has-events", isSelected && "is-selected", isToday && "is-today", isPast && "is-past")}
                      onFocus={() => setFocusIso(cell.iso)}
                      onClick={() => {
                        selectDay(cell.iso);
                        // No celular a lista fica logo abaixo: leva a tela até ela.
                        if (tone && window.matchMedia("(max-width: 767px)").matches) {
                          requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
                        }
                      }}
                    >
                      <span className="cal-day-number">{cell.day}</span>
                      {count > 0 && (
                        <span className="cal-day-count" aria-hidden>
                          {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                            <i key={i} />
                          ))}
                        </span>
                      )}
                    </button>
                  </span>
                );
              })}
            </div>
          ))}
        </div>

        <ul className="cal-legend" aria-label="Legenda">
          <li>
            <span className="cal-key cal-key-on" aria-hidden /> Dia com evento
          </li>
          <li>
            <span className="cal-key cal-key-today" aria-hidden /> Hoje
          </li>
          {isPainel && (
            <>
              <li>
                <span className="cal-key cal-key-draft" aria-hidden /> Rascunho
              </li>
              <li>
                <span className="cal-key cal-key-cancelled" aria-hidden /> Cancelado
              </li>
            </>
          )}
        </ul>

        {error && (
          <div className="alert alert-error mt-3" role="alert">
            {error.message}{" "}
            <button type="button" className="btn-link" onClick={() => void goToMonth(error.month)}>
              Tentar de novo
            </button>
          </div>
        )}
      </div>

      <div className="cal-detail" ref={detailRef} aria-live="polite">
        {selected ? (
          <>
            <h3 className="cal-detail-title">{formatEventDateLong(selected)}</h3>
            {selectedEvents.length === 0 ? (
              <div className="cal-empty">
                <p>{isPainel ? "Nenhum evento nesta data." : "Nenhum evento marcado para este dia."}</p>
                {isPainel && newBase && (
                  <p className="mt-2">
                    <Link href={`${newBase}${selected}`} className="btn btn-outline btn-sm">
                      Adicionar evento nesta data
                    </Link>
                  </p>
                )}
              </div>
            ) : (
              <ul className="cal-events">
                {selectedEvents.map((event) => (
                  <li key={event.id}>
                    <EventCard event={event} painel={isPainel} editBase={editBase} />
                  </li>
                ))}
              </ul>
            )}
            {isPainel && newBase && selectedEvents.length > 0 && (
              <p className="mt-4">
                <Link href={`${newBase}${selected}`} className="btn btn-outline btn-sm">
                  Adicionar outro evento neste dia
                </Link>
              </p>
            )}
          </>
        ) : (
          <div className="cal-empty">
            {monthEvents === undefined ? (
              <p>Carregando...</p>
            ) : monthCount === 0 ? (
              <p>
                {isPainel ? "Nenhum evento em " : "Nenhum evento marcado em "}
                {formatMonthLabel(month)}.
                {isPainel ? " Escolha um dia para adicionar." : " Use as setas para ver outros meses."}
              </p>
            ) : (
              <p>
                {monthCount === 1 ? "1 evento" : `${monthCount} eventos`} em {formatMonthLabel(month)}. Escolha um dia destacado para ver os detalhes.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EventCard({ event, painel, editBase }: { event: CalendarEvent; painel: boolean; editBase?: string }) {
  const time = formatTimeRange(event.startTime, event.endTime);
  const status = event.status;
  return (
    <article className={cn("cal-event", status === "CANCELADO" && "is-cancelled")}>
      {event.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- a foto já vem reduzida (WebP) do próprio armazenamento da loja
        <img src={event.imageUrl} alt={`Foto do evento ${event.title}`} loading="lazy" decoding="async" className="cal-event-photo" />
      )}
      <div className="cal-event-body">
        <h4 className="cal-event-title">{event.title}</h4>
        {painel && status && (
          <p className="mt-1">
            <span className={`badge badge-${EVENT_STATUS_TONE[status]}`}>{EVENT_STATUS_LABEL[status]}</span>
            {event.templateName && <span className="ml-2 text-sm text-ink-soft">Modelo: {event.templateName}</span>}
          </p>
        )}
        <p className="cal-event-meta">
          <strong>{time ?? "Horário a confirmar"}</strong>
        </p>
        {event.location && (
          <p className="cal-event-meta">
            <MapPin size={16} aria-hidden className="mt-1 shrink-0" />
            <span>{event.location}</span>
          </p>
        )}
        {event.description && <p className="cal-event-text">{event.description}</p>}
        {painel && editBase && (
          <p className="mt-3">
            <Link href={`${editBase}${event.id}`} className="btn btn-outline btn-sm">
              Editar este evento
            </Link>
          </p>
        )}
      </div>
    </article>
  );
}
