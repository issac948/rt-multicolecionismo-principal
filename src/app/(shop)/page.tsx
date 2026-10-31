import Link from "next/link";
import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { EventsCalendar } from "@/components/events/events-calendar";
import { UpcomingEvents } from "@/components/events/upcoming-events";
import { deliveryLines, paymentLines } from "@/components/shop/delivery-info";
import { hasContactInfo } from "@/components/shop/contact-info";
import { absoluteUrl, jsonLd } from "@/components/shop/format";
import { ProductGrid } from "@/components/shop/product-card";
import { SectionHead } from "@/components/shop/section-head";
import { publicCategoryTree } from "@/lib/categories";
import { CALENDAR_MAX_MONTHS_AHEAD, CALENDAR_MAX_MONTHS_BEHIND, monthKeyOf, shiftMonth, todayIso } from "@/lib/events";
import { splitCarShowcases } from "@/lib/home-sections";
import { formatPhone, whatsappLink } from "@/lib/text";
import { getEnv } from "@/server/env";
import { listCategoriesWithCounts } from "@/server/services/categories";
import { listPublicEventsInMonth, listUpcomingPublicEvents } from "@/server/services/events";
import { listCatalogFacets, listPublicProducts } from "@/server/services/products";
import { getSettings } from "@/server/services/settings";
import { fileUrl } from "@/server/storage";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return {
    title: { absolute: settings.tagline ? `${settings.storeName} | ${settings.tagline}` : settings.storeName },
    alternates: { canonical: "/" },
  };
}

export default async function HomePage() {
  const today = todayIso();
  const [settings, allCategories, featuredCars, recentCars, carPool, figures, others, onSale, facets, upcomingEvents] = await Promise.all([
    getSettings(),
    listCategoriesWithCounts({ onlyActive: true }),
    // Miniaturas de carros: destaques (marcados pelo dono), novidades (mais recentes) e as demais. Um produto não se repete entre elas.
    listPublicProducts({ kind: "carros", featuredOnly: true, pageSize: 4, inStock: true }),
    listPublicProducts({ kind: "carros", sort: "recentes", pageSize: 12, inStock: true }),
    listPublicProducts({ kind: "carros", pageSize: 24, inStock: true }),
    listPublicProducts({ kind: "colecionavel", pageSize: 4, inStock: true }),
    listPublicProducts({ kind: "outros", pageSize: 4, inStock: true }),
    listPublicProducts({ onSale: true, pageSize: 4, inStock: true, sort: "menor-preco" }),
    listCatalogFacets(),
    listUpcomingPublicEvents(4, today),
  ]);

  // Calendário da home: abre no mês do próximo evento (ou no mês atual) e já mostra os eventos desse mês.
  const nextEvent = upcomingEvents[0] ?? null;
  const calendarMonth = nextEvent ? monthKeyOf(nextEvent.date) : monthKeyOf(today);
  const calendarEvents = nextEvent ? await listPublicEventsInMonth(calendarMonth) : [];

  const whatsapp = whatsappLink(settings.whatsapp, "Olá! Vim pelo site e gostaria de ajuda.");
  const tree = publicCategoryTree(allCategories);
  const carSubcategories = tree.filter((c) => c.kind === "CARROS").flatMap((c) => c.children);

  const hasCars = facets.kinds.carros > 0;
  const { novidades, miniaturas } = splitCarShowcases({ featured: featuredCars.items, recent: recentCars.items, pool: carPool.items });
  const hasAnyProduct = hasCars || facets.kinds.colecionavel > 0 || facets.kinds.outros > 0;

  const facts = [
    { title: "Entrega", lines: deliveryLines(settings) },
    { title: "Pagamento", lines: paymentLines(settings) },
    {
      title: "Eventos",
      lines: settings.fairsNote ? [settings.fairsNote, "Veja as próximas datas na página de eventos."] : [],
    },
    {
      title: "Atendimento",
      lines: [
        settings.whatsapp ? `WhatsApp ${formatPhone(settings.whatsapp)}.` : "",
        settings.businessHours,
      ].filter(Boolean),
    },
  ].filter((f) => f.lines.length > 0);

  const siteUrl = getEnv().siteUrl;
  const organization = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: settings.storeName,
    url: siteUrl,
    description: settings.description || undefined,
    image: absoluteUrl(siteUrl, fileUrl(settings.logoKey)),
    telephone: settings.phone ? `+55${settings.phone}` : undefined,
    email: settings.email || undefined,
    sameAs: settings.instagram ? [`https://instagram.com/${settings.instagram}`] : undefined,
  };

  const categoryTiles = tree.length > 0 && (
    <section className="container-page mt-8 md:mt-10" aria-labelledby="titulo-categorias">
      <SectionHead id="titulo-categorias" title="Compre por categoria" />
      <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tree.map((category) => (
          <li key={category.id}>
            <Link
              href={`/categoria/${category.slug}`}
              className="flex h-full flex-col justify-between gap-5 rounded-md border-l-4 border-signal bg-night p-4 text-white no-underline hover:border-enamel hover:bg-night-soft"
            >
              <span>
                <span className="block text-xl font-extrabold leading-tight [font-stretch:76%]">{category.name}</span>
                {category.children.length > 0 && (
                  <span className="mt-1.5 line-clamp-2 block text-sm text-white/75">{category.children.map((c) => c.name).join(" · ")}</span>
                )}
              </span>
              <span className="text-sm font-semibold text-signal">
                {category.totalCount} {category.totalCount === 1 ? "produto" : "produtos"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(organization) }} />

      {/* Abertura: preto, dourado e vermelho da logo, com o "sol" e os raios ao fundo. A logo grande só aparece em telas largas (no celular ela já está no cabeçalho). */}
      <section className="sunburst on-dark">
        <div className="container-page grid items-center gap-8 py-9 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:py-16">
          <div>
            <p className="eyebrow">Miniaturas e colecionáveis em Curitiba</p>
            <h1 className="mt-2 text-white">{settings.tagline || settings.storeName}</h1>
            {settings.description && <p className="mt-4 max-w-[48ch] text-lg text-white/85">{settings.description}</p>}
            <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-3">
              <Link href={hasCars ? "/produtos?tipo=miniaturas" : "/produtos"} className="btn btn-primary">
                Ver as miniaturas de carros
              </Link>
              {figures.items.length > 0 && (
                <Link href="#bonecos" className="btn btn-light">
                  Bonecos e colecionáveis
                </Link>
              )}
            </div>
            {whatsapp && (
              <p className="mt-4">
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-semibold text-white underline decoration-signal underline-offset-4">
                  <MessageCircle size={18} aria-hidden /> Falar com a loja no WhatsApp
                </a>
              </p>
            )}
          </div>
          <div className="hidden justify-end md:flex">
            <BrandMark size={320} customSrc={fileUrl(settings.logoKey)} className="h-auto w-72 lg:w-80 drop-shadow-[0_8px_40px_rgb(241_183_50/0.25)]" />
          </div>
        </div>
      </section>
      <div className="checker" aria-hidden />

      {categoryTiles}

      {featuredCars.items.length > 0 && (
        <section className="container-page mt-12" aria-labelledby="titulo-destaques">
          <SectionHead id="titulo-destaques" title="Destaques" href="/produtos?tipo=miniaturas" linkLabel="Ver todas as miniaturas" />
          <div className="mt-6">
            <ProductGrid products={featuredCars.items} priorityCount={2} layout="four" />
          </div>
        </section>
      )}

      {/* Eventos: a loja vende em feiras e encontros, então o calendário fica logo no começo da página. */}
      <section className="container-page mt-12 scroll-mt-24" aria-labelledby="titulo-eventos" id="eventos">
        <SectionHead id="titulo-eventos" title="Eventos" href="/eventos" linkLabel="Ver a página de eventos">
          {nextEvent ? "Onde a loja estará nas próximas datas. Toque num dia destacado para ver horário e local." : undefined}
        </SectionHead>
        {nextEvent ? (
          <>
            <EventsCalendar
              className="mt-5"
              initialMonth={calendarMonth}
              initialEvents={calendarEvents}
              initialSelected={nextEvent.date}
              today={today}
              endpoint="/api/eventos"
              minMonth={shiftMonth(monthKeyOf(today), -CALENDAR_MAX_MONTHS_BEHIND)}
              maxMonth={shiftMonth(monthKeyOf(today), CALENDAR_MAX_MONTHS_AHEAD)}
            />
            {upcomingEvents.length > 1 && (
              <div className="mt-6 max-w-2xl">
                <h3 className="mb-3">Próximos eventos</h3>
                <UpcomingEvents events={upcomingEvents} />
              </div>
            )}
          </>
        ) : (
          <p className="cal-empty mt-4 max-w-2xl">
            Nenhum evento marcado no momento. As próximas datas aparecem aqui assim que forem publicadas
            {whatsapp ? (
              <>
                {" "}
                — ou pergunte pelo{" "}
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              </>
            ) : null}
            .
          </p>
        )}
      </section>

      {novidades.length > 0 && (
        <section className="container-page mt-14" aria-labelledby="titulo-novidades">
          <SectionHead id="titulo-novidades" title="Novidades" href="/produtos?tipo=miniaturas&ordem=recentes" linkLabel="Ver todas as novidades" />
          <div className="mt-6">
            <ProductGrid products={novidades} rail />
          </div>
        </section>
      )}

      {facets.brands.length > 0 && (
        <section className="container-page mt-12" aria-labelledby="titulo-marcas">
          <SectionHead id="titulo-marcas" title="Compre por marca" />
          <ul className="chip-row mt-4">
            {facets.brands.map((brand) => (
              <li key={brand.value} className="flex-none">
                <Link href={`/produtos?marca=${encodeURIComponent(brand.value)}`} className="chip">
                  {brand.value}
                  <small>{brand.count}</small>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasCars && miniaturas.length > 0 && (
        <section className="container-page mt-12" aria-labelledby="titulo-miniaturas">
          <SectionHead id="titulo-miniaturas" title="Mais miniaturas de carros" href="/produtos?tipo=miniaturas" linkLabel="Ver todas as miniaturas" />
          {carSubcategories.length > 0 && (
            <ul className="chip-row mt-4" aria-label="Subcategorias de miniaturas">
              {carSubcategories.map((c) => (
                <li key={c.id} className="flex-none">
                  <Link href={`/categoria/${c.slug}`} className="chip">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5">
            <ProductGrid products={miniaturas} rail />
          </div>
        </section>
      )}

      {figures.items.length > 0 && (
        <section id="bonecos" className="mt-14 scroll-mt-24 bg-panel py-10" aria-labelledby="titulo-bonecos">
          <div className="container-page">
            <SectionHead id="titulo-bonecos" title="Bonecos e colecionáveis" href="/produtos?tipo=bonecos" linkLabel="Ver todos">
              Bonecos, figuras de ação, personagens e outros colecionáveis para a sua coleção.
            </SectionHead>
            <div className="mt-6">
              <ProductGrid products={figures.items} rail />
            </div>
          </div>
        </section>
      )}

      {others.items.length > 0 && (
        <section className="container-page mt-14" aria-labelledby="titulo-outros">
          <SectionHead id="titulo-outros" title="Acessórios para a coleção" href="/produtos?tipo=outros" linkLabel="Ver acessórios" />
          <div className="mt-6">
            <ProductGrid products={others.items} rail />
          </div>
        </section>
      )}

      {onSale.items.length > 0 && (
        <section className="container-page mt-14" aria-labelledby="titulo-promocao">
          <SectionHead id="titulo-promocao" title="Em promoção" href="/produtos?promocao=1" linkLabel="Ver todas as promoções" />
          <div className="mt-6">
            <ProductGrid products={onSale.items} rail />
          </div>
        </section>
      )}

      {!hasAnyProduct && (
        <section className="container-page mt-12">
          <div className="panel text-center">
            <h2>Os produtos estão chegando</h2>
            <p className="mt-2 text-ink-soft">Ainda não há produtos publicados. Volte em breve ou fale com a loja.</p>
          </div>
        </section>
      )}

      {facts.length > 0 && (
        <section className="container-page mt-14" aria-labelledby="titulo-compra">
          <SectionHead id="titulo-compra" title="Como comprar" />
          <dl className="mt-5 grid gap-x-10 gap-y-6 md:grid-cols-2">
            {facts.map(({ title, lines }) => (
              <div key={title} className="border-l-4 border-signal pl-4">
                <dt className="text-lg font-extrabold [font-stretch:80%]">{title}</dt>
                <dd className="mt-1 space-y-1 text-ink-soft">
                  {lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="container-page mt-14" aria-labelledby="titulo-loja">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <SectionHead id="titulo-loja" title={`Sobre a ${settings.storeName}`} />
            <p className="mt-4 max-w-[60ch] text-ink-soft">{settings.description || settings.tagline}</p>
            {settings.addressText && <p className="mt-3 max-w-[60ch]">{settings.addressText}</p>}
            {hasContactInfo(settings) && (
              <p className="mt-3">
                <Link href="#contato">Ver formas de contato</Link>
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
