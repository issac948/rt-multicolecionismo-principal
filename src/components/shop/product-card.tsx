import Link from "next/link";
import { NoPhoto } from "@/components/shop/no-photo";
import { Badge, PriceTag } from "@/components/ui";
import { conditionLabel } from "@/lib/collectibles";
import type { ProductWithRelations } from "@/server/services/products";
import { fileUrl } from "@/server/storage";

export function ProductCard({ product }: { product: ProductWithRelations }) {
  const image = product.images[0];
  const soldOut = product.stock <= 0;
  const low = !soldOut && product.stock <= product.lowStockThreshold;
  const condition = conditionLabel(product.condition);
  const meta = [product.brand, product.scale].filter(Boolean).join(" · ");

  return (
    <Link href={`/produtos/${product.slug}`} className="product-card">
      <div className="product-card__media">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(image.thumbKey) ?? ""} alt={image.alt || product.name} loading="lazy" />
        ) : (
          <NoPhoto />
        )}
        {/* Um único bloco para os selos: em cartões estreitos (celular) eles quebram em duas linhas em vez de se sobrepor. */}
        {(soldOut || low || condition) && (
          <div className="absolute inset-x-2 top-2 flex flex-wrap items-start gap-1">
            {soldOut ? <Badge tone="neutral">Sem estoque</Badge> : low ? <Badge tone="warning">Últimas unidades</Badge> : null}
            {condition && <span className={`badge ml-auto ${product.condition === "LACRADO" ? "badge-sealed" : "badge-neutral"}`}>{condition}</span>}
          </div>
        )}
      </div>
      {meta && <p className="-mb-1.5 text-[0.8125rem] font-bold uppercase tracking-wide text-ink-soft">{meta}</p>}
      <h3 className="product-card__name">{product.name}</h3>
      <div>
        <PriceTag product={product} />
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: ProductWithRelations[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
