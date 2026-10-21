import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogView } from "@/components/shop/catalog-view";
import { parseCatalogParams } from "@/server/catalog-params";
import { getCategoryContext } from "@/server/services/categories";
import { listPublicProducts } from "@/server/services/products";

async function categoryHasProducts(categoryId: string): Promise<boolean> {
  return (await listPublicProducts({ categoryId, pageSize: 1 })).total > 0;
}

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = (await getCategoryContext((await params).slug))?.category;
  if (!category) return { title: "Categoria não encontrada", robots: { index: false } };
  return {
    title: category.name,
    description: category.description || `Veja os produtos da categoria ${category.name}.`,
    alternates: { canonical: `/categoria/${category.slug}` },
    // Categoria ainda sem produto publicado não deve ir para o Google.
    robots: (await categoryHasProducts(category.id)) ? undefined : { index: false, follow: true },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const context = await getCategoryContext((await params).slug);
  if (!context) notFound();
  const { category, parent, children } = context;
  const query = parseCatalogParams(await searchParams);

  return (
    <div className="container-page py-10">
      {parent && (
        <p className="mb-2 text-sm">
          <Link href={`/categoria/${parent.slug}`}>{parent.name}</Link> <span aria-hidden>›</span> <span className="text-ink-soft">{category.name}</span>
        </p>
      )}
      <h1>{category.name}</h1>
      {category.description && <p className="mt-3 max-w-[60ch] text-ink-soft">{category.description}</p>}
      {children.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Subcategorias">
          {children.map((c) => (
            <li key={c.id}>
              <Link href={`/categoria/${c.slug}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line px-4 font-semibold no-underline hover:border-signal hover:bg-panel">
                {c.name} <span className="text-sm font-normal text-ink-soft">{c.productCount}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6">
        <CatalogView basePath={`/categoria/${category.slug}`} params={query} categoryId={category.id} />
      </div>
    </div>
  );
}
