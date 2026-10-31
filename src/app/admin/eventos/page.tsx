import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, Layers } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { EventsCalendar } from "@/components/events/events-calendar";
import { Alert, Badge, EmptyState } from "@/components/ui";
import {
  EVENT_STATUS_LABEL,
  EVENT_STATUS_TONE,
  eventDateParts,
  formatEventDateShort,
  formatTimeRange,
  isValidMonthKey,
  monthKeyOf,
  shiftMonth,
  todayIso,
  type AdminEventItem,
} from "@/lib/events";
import { requireAdminPage } from "@/server/auth/current-user";
import { countAdminEventsByScope, listAdminEvents, listAdminEventsInMonth, type AdminEventScope } from "@/server/services/events";

export const metadata: Metadata = { title: "Eventos" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const VIEWS = ["proximos", "calendario", "passados", "cancelados"] as const;
type View = (typeof VIEWS)[number];

export default async function AdminEventsPage({ searchParams }: Props) {
  await requireAdminPage("/admin/eventos");
  const query = await searchParams;
  const today = todayIso();
  const requestedView = one(query.ver);
  const view: View = (VIEWS as readonly string[]).includes(requestedView ?? "") ? (requestedView as View) : "proximos";
  const counts = await countAdminEventsByScope(today);

  const tabs: Array<{ id: View; label: string; count?: number }> = [
    { id: "proximos", label: "Próximos", count: counts.proximos },
    { id: "calendario", label: "Calendário" },
    { id: "passados", label: "Passados", count: counts.passados },
    { id: "cancelados", label: "Cancelados", count: counts.cancelados },
  ];

  const created = Number(one(query.criado));
  const deleted = one(query.excluido) === "1";

  return (
    <>
      <AdminPageHeader
        title="Eventos"
        description="Marque as datas em que a loja participa de feiras e encontros. O que está publicado aparece no calendário do site na hora, sem precisar publicar o site de novo."
        actions={
          <>
            <Link href="/admin/eventos/novo" className="btn btn-primary">
              <CalendarPlus size={18} aria-hidden /> Novo evento
            </Link>
            <Link href="/admin/eventos/modelos" className="btn btn-outline">
              <Layers size={18} aria-hidden /> Modelos
            </Link>
          </>
        }
      />

      <div className="space-y-4">
        {Number.isInteger(created) && created > 0 && <Alert tone="ok">{created === 1 ? "Evento cadastrado." : `${created} datas cadastradas.`}</Alert>}
        {deleted && <Alert tone="ok">Evento excluído.</Alert>}

        <nav aria-label="Ver eventos" className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={tab.id === "proximos" ? "/admin/eventos" : `/admin/eventos?ver=${tab.id}`}
              aria-current={view === tab.id ? "page" : undefined}
              className={`btn btn-sm ${view === tab.id ? "btn-dark" : "btn-outline"}`}
            >
              {tab.label}
              {tab.count !== undefined && <span className="opacity-70">({tab.count})</span>}
            </Link>
          ))}
        </nav>

        {view === "calendario" ? <AdminCalendarView today={today} month={one(query.mes)} /> : <AdminEventList scope={view as AdminEventScope} today={today} />}
      </div>
    </>
  );
}

async function AdminCalendarView({ today, month: requested }: { today: string; month: string | undefined }) {
  const month = requested && isValidMonthKey(requested) ? requested : monthKeyOf(today);
  const events = await listAdminEventsInMonth(month);
  const current = monthKeyOf(today);
  return (
    <EventsCalendar
      key={month}
      mode="painel"
      initialMonth={month}
      initialEvents={events}
      initialSelected={events.find((e) => e.date >= today)?.date ?? null}
      today={today}
      endpoint="/api/admin/eventos"
      minMonth={shiftMonth(current, -60)}
      maxMonth={shiftMonth(current, 60)}
      editBase="/admin/eventos/"
      newBase="/admin/eventos/novo?data="
    />
  );
}

const EMPTY: Record<AdminEventScope, { title: string; text: string }> = {
  proximos: { title: "Nenhum evento marcado", text: "Cadastre a próxima data para ela aparecer no calendário do site." },
  passados: { title: "Nenhum evento passado", text: "Quando as datas passarem, elas ficam aqui para consulta." },
  cancelados: { title: "Nenhum evento cancelado", text: "Eventos cancelados somem do site e ficam guardados aqui, podendo ser reativados." },
};

async function AdminEventList({ scope, today }: { scope: AdminEventScope; today: string }) {
  const items = await listAdminEvents(scope, today);
  if (items.length === 0) {
    return (
      <EmptyState
        title={EMPTY[scope].title}
        action={
          scope === "proximos" ? (
            <Link href="/admin/eventos/novo" className="btn btn-primary">
              Cadastrar evento
            </Link>
          ) : undefined
        }
      >
        {EMPTY[scope].text}
      </EmptyState>
    );
  }
  return (
    <ul className="grid gap-3" aria-label="Eventos">
      {items.map((event) => (
        <li key={event.id}>
          <EventRow event={event} />
        </li>
      ))}
      {items.length >= 200 && <li className="text-sm text-ink-soft">Mostrando os primeiros 200 eventos.</li>}
    </ul>
  );
}

function EventRow({ event }: { event: AdminEventItem }) {
  const parts = eventDateParts(event.date);
  const time = formatTimeRange(event.startTime, event.endTime);
  return (
    <Link href={`/admin/eventos/${event.id}`} className="upcoming-row">
      <span className="upcoming-date" aria-hidden>
        <span className="text-xs font-semibold opacity-80">{parts.weekday}</span>
        <span className="text-2xl font-extrabold leading-none [font-stretch:80%]">{parts.day}</span>
        <span className="text-xs font-semibold">{parts.month}</span>
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-extrabold leading-tight [font-stretch:80%]">{event.title}</span>
          <Badge tone={EVENT_STATUS_TONE[event.status ?? "PUBLICADO"]}>{EVENT_STATUS_LABEL[event.status ?? "PUBLICADO"]}</Badge>
        </span>
        <span className="mt-0.5 block text-sm text-ink-soft">
          <span className="sr-only">{formatEventDateShort(event.date)}. </span>
          {[time ?? "Sem horário", event.location || "Sem local", event.templateName ? `Modelo: ${event.templateName}` : "Avulso"].join(" · ")}
        </span>
      </span>
    </Link>
  );
}
