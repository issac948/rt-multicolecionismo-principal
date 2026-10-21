import Link from "next/link";
import type { Metadata } from "next";
import { MessageCircle, ShieldCheck, Tent, Truck } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { deliveryLines, paymentLines } from "@/components/shop/delivery-info";
import { hasContactInfo } from "@/components/shop/contact-info";
import { absoluteUrl, jsonLd } from "@/components/shop/format";
import { ProductGrid } from "@/components/shop/product-card";
import { publicCategoryTree } from "@/lib/categories";
import { splitCarShowcases } from "@/lib/home-sections";
import { formatPhone, whatsappLink } from "@/lib/text";
import { getEnv } from "@/server/env";
import { listCategoriesWithCounts } from "@/server/services/categories";
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
  const [settings, allCategories, featuredCars, recentCars, carPool, figures, others, onSale, facets] = await Promise.all([
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
  ]);

  const whatsapp = whatsappLink(settings.whatsapp, "Olá! Vim pelo site e gostaria de ajuda.");
  const tree = publicCategoryTree(allCategories);
  const carSubcategories = tree.filter((c) => c.kind === "CARROS").flatMap((c) => c.children);

  const hasCars = facets.kinds.carros > 0;
  const { novidades, miniaturas } = splitCarShowcases({ featured: featuredCars.items, recent: recentCars.items, pool: carPool.items });
  const hasAnyProduct = hasCars || facets.kinds.colecionavel > 0 || facets.kinds.outros > 0;

  const facts = [
    { icon: Truck, title: "Entrega", lines: deliveryLines(settings) },
    { icon: ShieldCheck, title: "Pagamento", lines: paymentLines(settings) },
    {
      icon: Tent,
      title: "Também em feiras",
      lines: settings.fairsNote ? [settings.fairsNote, settings.whatsapp ? "Fale com a gente no WhatsApp para saber mais." : ""].filter(Boolean) : [],
    },
    {
      icon: MessageCircle,
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

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(organization) }} />

      {/* Abertura: preto, dourado e vermelho da logo, com o "sol" e os raios ao fundo. */}
      <section className="sunburst on-dark">
        <div className="container-page grid items-center gap-8 py-10 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:py-16">
          <div>
            <p className="eyebrow">Miniaturas e colecionáveis · Curitiba</p>
            <h1 className="mt-3 text-white">{settings.tagline || settings.storeName}</h1>
            {settings.description && <p className="mt-4 max-w-[48ch] text-lg text-white/85">{settings.description}</p>}
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={hasCars ? "/produtos?tipo=miniaturas" : "/produtos"} className="btn btn-primary">
                Ver as miniaturas de carros
              </Link>
              {figures.items.length > 0 && (
                <Link href="#bonecos" className="btn btn-light">
                  Bonecos e colecionáveis
                </Link>
              )}
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-light">
                  <MessageCircle size={18} aria-hidden /> WhatsApp
                </a>
              )}
            </div>
          </div>
          <div className="flex justify-center md:justify-end">
            <BrandMark size={320} customSrc={fileUrl(settings.logoKey)} className="h-auto w-56 sm:w-72 md:w-80 drop-shadow-[0_8px_40px_rgb(241_183_50/0.25)]" />
          </div>
        </div>
      </section>
      <div className="checker" aria-hidden />

      {facets.brands.length > 0 && (
        <section className="container-page mt-12" aria-labelledby="titulo-marcas">
          <h2 id="titulo-marcas" className="section-title">
            Marcas
          </h2>
          <ul className="mt-5 flex flex-wrap gap-2">
            {facets.brands.map((brand) => (
              <li key={brand.value}>
                <Link
                  href={`/produtos?marca=${encodeURIComponent(brand.value)}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-night px-4 font-bold text-white no-underline hover:bg-signal hover:text-ink"
                >
                  {brand.value}
                  <span className="text-sm font-semibold opacity-70">{brand.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {featuredCars.items.length > 0 && (
        <section className="container-page mt-12" aria-labelledby="titulo-destaques">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <h2 id="titulo-destaques" className="section-title">
              Destaques
            </h2>
            <Link href="/produtos?tipo=miniaturas">Ver todas as miniaturas</Link>
          </div>
          <div className="mt-6">
            <ProductGrid products={featuredCars.items} />
          </div>
        </section>
      )}

      {novidades.length > 0 && (
        <section className="container-page mt-14" aria-labelledby="titulo-novidades">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <h2 id="titulo-novidades" className="section-title">
              Novidades
            </h2>
            <Link href="/produtos?tipo=miniaturas&ordem=recentes">Ver todas as novidades</Link>
          </div>
          <div className="mt-6">
            <ProductGrid products={novidades} />
          </div>
        </section>
      )}

      {hasCars && (
        <section className="container-page mt-14" aria-labelledby="titulo-miniaturas">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <h2 id="titulo-miniaturas" className="section-title">
              Miniaturas de carros
            </h2>
            <Link href="/produtos?tipo=miniaturas">Ver todas as miniaturas</Link>
          </div>
          {carSubcategories.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Subcategorias de miniaturas">
              {carSubcategories.map((c) => (
                <li key={c.id}>
                  <Link href={`/categoria/${c.slug}`} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 font-semibold no-underline hover:border-signal hover:bg-panel">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {miniaturas.length > 0 && (
            <div className="mt-6">
              <ProductGrid products={miniaturas} />
            </div>
          )}
        </section>
      )}

      {figures.items.length > 0 && (
        <section id="bonecos" className="mt-16 scroll-mt-24 bg-panel py-10" aria-labelledby="titulo-bonecos">
          <div className="container-page">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <h2 id="titulo-bonecos" className="section-title">
                Bonecos e colecionáveis
              </h2>
              <Link href="/produtos?tipo=bonecos">Ver todos</Link>
            </div>
            <p className="mt-2 max-w-[60ch] text-ink-soft">Bonecos, figuras de ação, personagens e outros colecionáveis para a sua coleção.</p>
            <div className="mt-6">
              <ProductGrid products={figures.items} />
            </div>
          </div>
        </section>
      )}

      {tree.length > 0 && (
        <section className="container-page mt-16" aria-labelledby="titulo-categorias">
          <h2 id="titulo-categorias" className="section-title">
            Escolha pela categoria
          </h2>
          <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {tree.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/categoria/${category.slug}`}
                  className="flex h-full flex-col justify-between rounded-md border-l-4 border-signal bg-night p-4 text-white no-underline hover:bg-night-soft hover:border-enamel"
                >
                  <span className="text-xl font-extrabold leading-tight [font-stretch:76%]">{category.name}</span>
                  <span className="mt-6 text-sm text-white/70">
                    {category.totalCount} {category.totalCount === 1 ? "produto" : "produtos"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {others.items.length > 0 && (
        <section className="container-page mt-16" aria-labelledby="titulo-outros">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <h2 id="titulo-outros" className="section-title">
              Acessórios para a coleção
            </h2>
            <Link href="/produtos?tipo=outros">Ver acessórios</Link>
          </div>
          <div className="mt-6">
            <ProductGrid products={others.items} />
          </div>
        </section>
      )}

      {onSale.items.length > 0 && (
        <section className="container-page mt-16" aria-labelledby="titulo-promocao">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <h2 id="titulo-promocao" className="section-title">
              Em promoção
            </h2>
            <Link href="/produtos?promocao=1">Ver todas as promoções</Link>
          </div>
          <div className="mt-6">
            <ProductGrid products={onSale.items} />
          </div>
        </section>
      )}

      {!hasAnyProduct && (
        <section className="container-page mt-16">
          <div className="panel text-center">
            <h2>Os produtos estão chegando</h2>
            <p className="mt-2 text-ink-soft">Ainda não há produtos publicados. Volte em breve ou fale com a loja.</p>
          </div>
        </section>
      )}

      {facts.length > 0 && (
        <section className="container-page mt-16" aria-label="Informações da compra">
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {facts.map(({ icon: Icon, title, lines }) => (
              <li key={title} className="rounded-md bg-panel p-5 border-t-4 border-signal">
                <Icon size={26} aria-hidden />
                <h3 className="mt-3">{title}</h3>
                <div className="mt-2 space-y-1 text-ink-soft">
                  {lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="container-page mt-16" aria-labelledby="titulo-loja">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 id="titulo-loja" className="section-title">
              Sobre a {settings.storeName}
            </h2>
            <p className="mt-4 max-w-[60ch] text-ink-soft">
              {settings.description || settings.tagline}
            </p>
            {settings.addressText && <p className="mt-3 max-w-[60ch]">{settings.addressText}</p>}
          </div>
          {hasContactInfo(settings) && (
            <p className="self-end">
              <Link href="#contato">Ver formas de contato</Link>
            </p>
          )}
        </div>
      </section>
    </>
  );
}
