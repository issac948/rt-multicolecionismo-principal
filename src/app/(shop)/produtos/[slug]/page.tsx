import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Truck } from "lucide-react";
import { AddToCartForm } from "@/components/shop/add-to-cart-form";
import { deliveryLines, paymentLines } from "@/components/shop/delivery-info";
import { absoluteUrl, jsonLd } from "@/components/shop/format";
import { ProductGallery } from "@/components/shop/product-gallery";
import { ProductGrid } from "@/components/shop/product-card";
import { Badge, PriceTag } from "@/components/ui";
import { collectibleSpecs, conditionLabel } from "@/lib/collectibles";
import { effectivePriceCents } from "@/lib/money";
import { whatsappLink } from "@/lib/text";
import { getEnv } from "@/server/env";
import { getPublicProductBySlug, listRelatedProducts } from "@/server/services/products";
import { getSettings } from "@/server/services/settings";
import { fileUrl } from "@/server/storage";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getPublicProductBySlug((await params).slug);
  if (!product) return { title: "Produto não encontrado", robots: { index: false } };

  const description = product.seoDescription || product.shortDescription || product.description.slice(0, 155);
  const image = product.images[0];
  return {
    title: product.seoTitle || product.name,
    description,
    alternates: { canonical: `/produtos/${product.slug}` },
    openGraph: {
      type: "website",
      title: product.seoTitle || product.name,
      description,
      images: image ? [{ url: fileUrl(image.storageKey) as string, width: image.width, height: image.height }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const product = await getPublicProductBySlug((await params).slug);
  if (!product) notFound();

  const [settings, related] = await Promise.all([getSettings(), listRelatedProducts(product)]);
  const siteUrl = getEnv().siteUrl;
  const soldOut = product.stock <= 0;

  const gallery = product.images.map((image) => ({
    id: image.id,
    url: fileUrl(image.storageKey) as string,
    thumbUrl: fileUrl(image.thumbKey) as string,
    alt: image.alt ?? "",
  }));

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription || product.description.slice(0, 300) || undefined,
    sku: product.sku || undefined,
    image: gallery.map((g) => absoluteUrl(siteUrl, g.url)),
    category: product.category?.name,
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    offers: {
      "@type": "Offer",
      url: `${siteUrl}/produtos/${product.slug}`,
      priceCurrency: "BRL",
      price: (effectivePriceCents(product) / 100).toFixed(2),
      availability: soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      // Só declaramos "novo" quando o produto está marcado como lacrado; "solto" não diz nada sobre o estado de uso.
      itemCondition: product.condition === "LACRADO" ? "https://schema.org/NewCondition" : undefined,
    },
  };

  const specs = collectibleSpecs(product);
  const condition = conditionLabel(product.condition);
  const lines = [...deliveryLines(settings), ...paymentLines(settings)];
  // Só aparece se o dono cadastrou o WhatsApp; a mensagem já leva o nome e o link do produto para ele saber do que se trata.
  const askOnWhatsapp = whatsappLink(settings.whatsapp, `Olá! Tenho uma dúvida sobre este produto: ${product.name} ${siteUrl}/produtos/${product.slug}`);
  const paragraphs = product.description.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="container-page py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />

      <nav aria-label="Você está em" className="mb-5 text-sm text-ink-soft">
        <Link href="/produtos">Produtos</Link>
        {product.category && (
          <>
            {" / "}
            <Link href={`/categoria/${product.category.slug}`}>{product.category.name}</Link>
          </>
        )}
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
        <ProductGallery images={gallery} name={product.name} />

        <div>
          {(product.brand || condition || product.scale) && (
            <p className="mb-2 flex flex-wrap items-center gap-2">
              {product.brand && (
                <Link href={`/produtos?marca=${encodeURIComponent(product.brand)}`} className="eyebrow !text-ink no-underline hover:underline" aria-label={`Ver mais produtos da marca ${product.brand}`}>
                  {product.brand}
                </Link>
              )}
              {product.scale && (
                <Link href={`/produtos?escala=${encodeURIComponent(product.scale)}`} className="badge badge-neutral no-underline hover:underline" aria-label={`Ver mais produtos na escala ${product.scale}`}>
                  Escala {product.scale}
                </Link>
              )}
              {condition && <span className={`badge ${product.condition === "LACRADO" ? "badge-sealed" : "badge-neutral"}`}>{condition}</span>}
            </p>
          )}
          <h1>{product.name}</h1>
          {product.shortDescription && <p className="mt-3 max-w-[55ch] text-lg text-ink-soft">{product.shortDescription}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <PriceTag product={product} size="lg" />
            {soldOut ? (
              <Badge tone="neutral">Sem estoque</Badge>
            ) : product.stock <= product.lowStockThreshold ? (
              <Badge tone="warning">Últimas unidades</Badge>
            ) : (
              <Badge tone="success">Disponível</Badge>
            )}
          </div>
          {product.promoText && <p className="mt-3 font-semibold">{product.promoText}</p>}

          <div className="mt-6">
            <AddToCartForm productId={product.id} stock={product.stock} />
          </div>

          {askOnWhatsapp && (
            <p className="mt-3">
              <a href={askOnWhatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                <MessageCircle size={16} aria-hidden /> Perguntar sobre este produto no WhatsApp
              </a>
            </p>
          )}

          {lines.length > 0 && (
            <div className="mt-8 flex gap-3 rounded-md bg-panel p-4">
              <Truck size={22} aria-hidden className="mt-0.5 shrink-0" />
              <div className="space-y-1 text-sm">
                <p className="font-bold text-base">Entrega e pagamento</p>
                {lines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <p className="text-ink-soft">O valor final do frete aparece no carrinho, antes de pagar.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        {paragraphs.length > 0 && (
          <section aria-labelledby="titulo-descricao">
            <h2 id="titulo-descricao">Descrição</h2>
            <div className="prose-simple mt-4">
              {paragraphs.map((paragraph, i) => (
                <p key={i} className="whitespace-pre-line">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        )}

        {(product.features.length > 0 || product.category || specs.length > 0) && (
          <section aria-labelledby="titulo-caracteristicas">
            <h2 id="titulo-caracteristicas">{specs.length > 0 ? "Ficha do produto" : "Características"}</h2>
            <dl className="mt-4 divide-y divide-line rounded-md bg-white">
              {specs.map((spec) => (
                <div key={spec.label} className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-3">
                  <dt className="font-semibold">{spec.label}</dt>
                  <dd>{spec.value}</dd>
                </div>
              ))}
              {product.category && (
                <div className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-3">
                  <dt className="font-semibold">Categoria</dt>
                  <dd>{product.category.name}</dd>
                </div>
              )}
              {product.features.map((feature, i) => (
                <div key={i} className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-3">
                  <dt className="font-semibold">{feature.label}</dt>
                  <dd>{feature.value}</dd>
                </div>
              ))}
              {product.sku && (
                <div className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-3">
                  <dt className="font-semibold">Código</dt>
                  <dd>{product.sku}</dd>
                </div>
              )}
            </dl>
          </section>
        )}
      </div>

      {related.length > 0 && (
        <section className="mt-16" aria-labelledby="titulo-relacionados">
          <h2 id="titulo-relacionados">Mais desta categoria</h2>
          <div className="mt-5">
            <ProductGrid products={related} />
          </div>
        </section>
      )}
    </div>
  );
}
