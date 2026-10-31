import Link from "next/link";
import { NoPhoto } from "@/components/shop/no-photo";
import { Badge, PriceTag } from "@/components/ui";
import { conditionLabel } from "@/lib/collectibles";
import type { ProductWithRelations } from "@/server/services/products";
import { fileUrl } from "@/server/storage";

export function ProductCard({ product, priority = false }: { product: ProductWithRelations; priority?: boolean }) {
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
          <img
            src={fileUrl(image.thumbKey) ?? ""}
            alt={image.alt || product.name}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            width={560}
            height={420}
          />
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
      {meta && <p className="product-card__meta">{meta}</p>}
      <h3 className="product-card__name">{product.name}</h3>
      <div className="product-card__price">
        <PriceTag product={product} />
      </div>
    </Link>
  );
}

/**
 * Lista de produtos. `rail`: no celular vira uma faixa que rola de lado (grade normal a partir de 640 px);
 * sem `rail`, grade de 2 colunas no celular (`layout="four"`: já com 4 colunas no tablet, para listas de 4 itens não deixarem um sozinho na linha; `"sidebar"`: ao lado dos filtros). `priorityCount` carrega as primeiras fotos sem esperar (acima da dobra).
 */
const GRID_COLUMNS = {
  default: "md:grid-cols-3 lg:grid-cols-4",
  four: "md:grid-cols-4",
  // Ao lado da coluna de filtros (a partir de 1024 px) sobra menos largura.
  sidebar: "md:grid-cols-3 xl:grid-cols-4",
} as const;

export function ProductGrid({ products, rail = false, priorityCount = 0, layout = "default" }: { products: ProductWithRelations[]; rail?: boolean; priorityCount?: number; layout?: "default" | "four" | "sidebar" }) {
  return (
    <ul className={rail ? "rail" : `grid grid-cols-2 gap-x-4 gap-y-8 ${GRID_COLUMNS[layout]}`}>
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard product={product} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
