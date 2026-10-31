import Link from "next/link";
import { eventDateParts, formatTimeRange, monthKeyOf, type PublicEvent } from "@/lib/events";

/** Link que abre o calendário já no mês e no dia do evento. */
export function eventCalendarHref(event: Pick<PublicEvent, "date">): string {
  return `/eventos?mes=${monthKeyOf(event.date)}&dia=${event.date}#calendario`;
}

/** Lista curta dos próximos eventos (home e página de eventos). Só recebe eventos já filtrados como públicos. */
export function UpcomingEvents({ events, label = "Próximos eventos" }: { events: PublicEvent[]; label?: string }) {
  if (events.length === 0) return null;
  return (
    <ul className="grid gap-3" aria-label={label}>
      {events.map((event) => {
        const parts = eventDateParts(event.date);
        const time = formatTimeRange(event.startTime, event.endTime);
        return (
          <li key={event.id}>
            <Link href={eventCalendarHref(event)} className="upcoming-row">
              <span className="upcoming-date" aria-hidden>
                <span className="text-xs font-semibold opacity-80">{parts.weekday}</span>
                <span className="text-2xl font-extrabold leading-none [font-stretch:80%]">{parts.day}</span>
                <span className="text-xs font-semibold">{parts.month}</span>
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-extrabold leading-tight [font-stretch:80%]">{event.title}</span>
                <span className="mt-0.5 block text-sm text-ink-soft">
                  <span className="sr-only">{`${parts.day} de ${parts.month}. `}</span>
                  {[time, event.location].filter(Boolean).join(" · ") || "Horário e local a confirmar"}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
