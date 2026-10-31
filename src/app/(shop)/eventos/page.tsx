import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { EventsCalendar } from "@/components/events/events-calendar";
import { UpcomingEvents } from "@/components/events/upcoming-events";
import { absoluteUrl, jsonLd } from "@/components/shop/format";
import {
  CALENDAR_MAX_MONTHS_AHEAD,
  CALENDAR_MAX_MONTHS_BEHIND,
  isMonthInPublicWindow,
  isValidIsoDate,
  isValidMonthKey,
  monthKeyOf,
  shiftMonth,
  todayIso,
  type PublicEvent,
} from "@/lib/events";
import { whatsappLink } from "@/lib/text";
import { getEnv } from "@/server/env";
import { listPublicEventsInMonth, listUpcomingPublicEvents } from "@/server/services/events";
import { getSettings } from "@/server/services/settings";

export const metadata: Metadata = {
  title: "Eventos",
  description: "Calendário de eventos e feiras em que a RT Multicolecionismo participa: datas, horários e locais.",
  alternates: { canonical: "/eventos" },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Dados estruturados (schema.org/Event) só com eventos reais e publicados. */
function eventJsonLd(event: PublicEvent, siteUrl: string, storeName: string) {
  // Curitiba não tem horário de verão desde 2019: o fuso é fixo (UTC-03:00).
  const stamp = (time: string | null) => (time ? `${event.date}T${time}:00-03:00` : event.date);
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description || undefined,
    startDate: stamp(event.startTime),
    endDate: event.endTime ? stamp(event.endTime) : undefined,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: event.location ? { "@type": "Place", name: event.location, address: event.location } : undefined,
    image: absoluteUrl(siteUrl, event.imageUrl),
    organizer: { "@type": "Organization", name: storeName, url: siteUrl },
  };
}

export default async function EventsPage({ searchParams }: Props) {
  const raw = await searchParams;
  const today = todayIso();
  const requestedMonth = one(raw.mes);
  const month = requestedMonth && isValidMonthKey(requestedMonth) && isMonthInPublicWindow(requestedMonth, today) ? requestedMonth : monthKeyOf(today);

  const [settings, monthEvents, upcoming] = await Promise.all([getSettings(), listPublicEventsInMonth(month), listUpcomingPublicEvents(6, today)]);

  // Dia aberto: o do link (se for deste mês); senão hoje, se houver evento; senão o próximo evento do mês.
  const requestedDay = one(raw.dia);
  let selected: string | null = null;
  if (requestedDay && isValidIsoDate(requestedDay) && monthKeyOf(requestedDay) === month) selected = requestedDay;
  else if (monthEvents.some((e) => e.date === today)) selected = today;
  else selected = monthEvents.find((e) => e.date >= today)?.date ?? null;

  const siteUrl = getEnv().siteUrl;
  const whatsapp = whatsappLink(settings.whatsapp, "Olá! Vim pelo site e gostaria de saber sobre os próximos eventos.");

  return (
    <div className="container-page py-8 md:py-12">
      {upcoming.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(upcoming.map((e) => eventJsonLd(e, siteUrl, settings.storeName))) }} />}

      <header className="max-w-[60ch]">
        <h1>Eventos</h1>
        <p className="mt-3 text-lg text-ink-soft">
          {settings.fairsNote || "Datas, horários e locais dos eventos em que a loja participa."} Toque num dia destacado para ver os detalhes.
        </p>
      </header>

      <section className="mt-8 scroll-mt-24" id="calendario" aria-labelledby="titulo-calendario">
        <h2 id="titulo-calendario" className="sr-only">
          Calendário de eventos
        </h2>
        <EventsCalendar
          key={`${month}|${selected ?? ""}`}
          initialMonth={month}
          initialEvents={monthEvents}
          initialSelected={selected}
          today={today}
          endpoint="/api/eventos"
          minMonth={shiftMonth(monthKeyOf(today), -CALENDAR_MAX_MONTHS_BEHIND)}
          maxMonth={shiftMonth(monthKeyOf(today), CALENDAR_MAX_MONTHS_AHEAD)}
          syncUrl
        />
      </section>

      <section className="mt-12 max-w-2xl" aria-labelledby="titulo-proximos">
        <h2 id="titulo-proximos">Próximos eventos</h2>
        {upcoming.length > 0 ? (
          <div className="mt-4">
            <UpcomingEvents events={upcoming} />
          </div>
        ) : (
          <div className="cal-empty mt-4">
            <p>Ainda não há eventos marcados. Assim que a loja confirmar a próxima participação, a data aparece aqui.</p>
            {whatsapp && (
              <p className="mt-3">
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                  <MessageCircle size={16} aria-hidden /> Perguntar no WhatsApp
                </a>
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
