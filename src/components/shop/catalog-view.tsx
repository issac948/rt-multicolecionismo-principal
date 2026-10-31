import Link from "next/link";
import { EmptyState, Pagination, buildHref } from "@/components/ui";
import { FilterPanel } from "@/components/shop/filter-panel";
import { ProductGrid } from "@/components/shop/product-card";
import { toProductFilters, type CatalogParams } from "@/server/catalog-params";
import { PRODUCT_CONDITION_LABEL } from "@/lib/constants";
import { publicCategoryTree } from "@/lib/categories";
import { getCategoryBySlug, listCategoriesWithCounts } from "@/server/services/categories";
import { listCatalogFacets, listPublicProducts } from "@/server/services/products";

const SORT_LABELS: Record<CatalogParams["sort"], string> = {
  relevancia: "Destaques",
  recentes: "Mais recentes",
  "menor-preco": "Menor preço",
  "maior-preco": "Maior preço",
  nome: "Nome (A a Z)",
};

/** Lista de produtos com filtros e paginação, usada em /produtos, /categoria/* e /buscar. */
export async function CatalogView({
  basePath,
  params,
  categoryId,
  emptyTitle = "Nenhum produto encontrado",
}: {
  basePath: string;
  params: CatalogParams;
  categoryId?: string;
  emptyTitle?: string;
}) {
  // Em /produtos e /buscar a pessoa pode escolher a categoria; em /categoria/* ela já vem da própria página.
  const [categoryOptions, chosenCategory] = categoryId
    ? [[], null]
    : await Promise.all([
        listCategoriesWithCounts({ onlyActive: true }).then((list) => categoryFilterOptions(list, params.kind, params.category)),
        params.category ? getCategoryBySlug(params.category) : Promise.resolve(null),
      ]);
  const scopeId = categoryId ?? (chosenCategory?.active ? chosenCategory.id : undefined);
  const [result, facets] = await Promise.all([listPublicProducts(toProductFilters(params, { categoryId: scopeId })), listCatalogFacets({ categoryId: scopeId })]);
  // Só aparece filtro que serve para alguma coisa: com uma única opção (ou nenhuma) não há o que escolher.
  const worth = (options: unknown[], chosen: unknown) => options.length >= 2 || Boolean(chosen);
  const activeFilters = [
    params.min,
    params.max,
    params.onSale,
    params.inStock,
    params.sort !== "relevancia",
    params.brand,
    params.scale,
    params.series,
    params.condition,
    params.kind,
    params.category,
  ].filter(Boolean).length;
  const kindCounts = facets.kinds;
  const kindsPresent = [kindCounts.carros, kindCounts.colecionavel, kindCounts.outros].filter((n) => n > 0).length;

  const hrefFor = (page: number) =>
    buildHref(basePath, {
      q: params.q,
      ordem: params.sort === "relevancia" ? undefined : params.sort,
      min: params.min,
      max: params.max,
      promocao: params.onSale ? "1" : undefined,
      estoque: params.inStock ? "1" : undefined,
      marca: params.brand,
      escala: params.scale,
      serie: params.series,
      condicao: params.condition,
      categoria: params.category,
      tipo: params.kind,
      pagina: page > 1 ? page : undefined,
    });

  return (
    <div className="lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:items-start lg:gap-8">
      <FilterPanel activeCount={activeFilters}>
        <form method="get" action={basePath} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {params.q && <input type="hidden" name="q" value={params.q} />}
          <div>
            <label htmlFor="f-ordem" className="label">
              Ordenar por
            </label>
            <select id="f-ordem" name="ordem" defaultValue={params.sort} className="select">
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-min" className="label">
              Preço mínimo (R$)
            </label>
            <input id="f-min" name="min" inputMode="decimal" defaultValue={params.min} className="input" placeholder="0" />
          </div>
          <div>
            <label htmlFor="f-max" className="label">
              Preço máximo (R$)
            </label>
            <input id="f-max" name="max" inputMode="decimal" defaultValue={params.max} className="input" placeholder="2.000" />
          </div>
          {!categoryId && worth(categoryOptions, params.category) && (
            <div>
              <label htmlFor="f-categoria" className="label">
                Categoria
              </label>
              <select id="f-categoria" name="categoria" defaultValue={params.category} className="select">
                <option value="">Todas</option>
                {categoryOptions.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.label} ({option.count})
                  </option>
                ))}
              </select>
            </div>
          )}
          {kindsPresent > 1 && (
            <div>
              <label htmlFor="f-tipo" className="label">
                Tipo de produto
              </label>
              <select id="f-tipo" name="tipo" defaultValue={params.kind} className="select">
                <option value="">Todos</option>
                {kindCounts.carros > 0 && <option value="miniaturas">Miniaturas de carros ({kindCounts.carros})</option>}
                {kindCounts.colecionavel > 0 && <option value="bonecos">Bonecos e colecionáveis ({kindCounts.colecionavel})</option>}
                {kindCounts.outros > 0 && <option value="outros">Acessórios para a coleção ({kindCounts.outros})</option>}
              </select>
            </div>
          )}
          {worth(facets.brands, params.brand) && (
            <div>
              <label htmlFor="f-marca" className="label">
                Marca
              </label>
              <select id="f-marca" name="marca" defaultValue={params.brand} className="select">
                <option value="">Todas</option>
                {facets.brands.map((brand) => (
                  <option key={brand.value} value={brand.value}>
                    {brand.value} ({brand.count})
                  </option>
                ))}
              </select>
            </div>
          )}
          {worth(facets.scales, params.scale) && (
            <div>
              <label htmlFor="f-escala" className="label">
                Escala
              </label>
              <select id="f-escala" name="escala" defaultValue={params.scale} className="select">
                <option value="">Todas</option>
                {facets.scales.map((scale) => (
                  <option key={scale.value} value={scale.value}>
                    {scale.value} ({scale.count})
                  </option>
                ))}
              </select>
            </div>
          )}
          {worth(facets.series, params.series) && (
            <div>
              <label htmlFor="f-serie" className="label">
                Série ou coleção
              </label>
              <select id="f-serie" name="serie" defaultValue={params.series} className="select">
                <option value="">Todas</option>
                {facets.series.map((series) => (
                  <option key={series.value} value={series.value}>
                    {series.value} ({series.count})
                  </option>
                ))}
              </select>
            </div>
          )}
          {worth(facets.conditions, params.condition) && (
            <div>
              <label htmlFor="f-condicao" className="label">
                Embalagem
              </label>
              <select id="f-condicao" name="condicao" defaultValue={params.condition} className="select">
                <option value="">Lacrados e soltos</option>
                {facets.conditions.map((condition) => (
                  <option key={condition.value} value={condition.value}>
                    {PRODUCT_CONDITION_LABEL[condition.value]} ({condition.count})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="promocao" value="1" defaultChecked={params.onSale} className="checkbox" /> Só em promoção
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="estoque" value="1" defaultChecked={params.inStock} className="checkbox" /> Só com estoque
            </label>
          </div>
          <div className="flex gap-3 sm:col-span-2 lg:col-span-1">
            <button type="submit" className="btn btn-dark">
              Aplicar
            </button>
            {activeFilters > 0 && (
              <Link href={buildHref(basePath, { q: params.q })} className="btn btn-outline">
                Limpar filtros
              </Link>
            )}
          </div>
        </form>
      </FilterPanel>

      <div className="min-w-0">
        <h2 className="sr-only">Produtos</h2>
        <p className="mb-4 text-ink-soft" aria-live="polite">
          {result.total === 0 ? "Nenhum produto" : `${result.total} produto${result.total > 1 ? "s" : ""}`}
          {result.pages > 1 ? `, página ${result.page} de ${result.pages}` : ""}
        </p>

        {result.items.length === 0 ? (
          <EmptyState
            title={emptyTitle}
            action={
              <Link href="/produtos" className="btn btn-primary">
                Ver todos os produtos
              </Link>
            }
          >
            Tente outras palavras ou remova algum filtro.
          </EmptyState>
        ) : (
          <ProductGrid products={result.items} layout="sidebar" />
        )}

        <Pagination page={result.page} pages={result.pages} hrefFor={hrefFor} />
      </div>
    </div>
  );
}

/** Tipo da vitrine (?tipo=) → tipo da categoria no banco. */
const CATEGORY_KIND_OF_FILTER = { miniaturas: "CARROS", bonecos: "COLECIONAVEL", outros: "OUTROS" } as const;

/**
 * Opções do seletor de categoria: só categorias com produto publicado, em lista simples ("Mãe" e "Mãe › Filha"), com a quantidade de produtos.
 * Com um tipo escolhido (ex.: miniaturas de carros) só aparecem as categorias desse tipo,
 * para a pessoa não combinar "Miniaturas" com uma categoria de bonecos e cair numa lista vazia.
 */
function categoryFilterOptions(
  list: Awaited<ReturnType<typeof listCategoriesWithCounts>>,
  kind: CatalogParams["kind"],
  chosenSlug: string,
): Array<{ slug: string; label: string; count: number }> {
  const wanted = kind ? CATEGORY_KIND_OF_FILTER[kind] : null;
  const show = (k: string, slug: string) => !wanted || k === wanted || slug === chosenSlug;
  return publicCategoryTree(list).flatMap((node) => [
    ...(show(node.kind, node.slug) ? [{ slug: node.slug, label: node.name, count: node.totalCount }] : []),
    ...node.children.filter((child) => show(child.kind, child.slug)).map((child) => ({ slug: child.slug, label: `${node.name} › ${child.name}`, count: child.productCount })),
  ]);
}
