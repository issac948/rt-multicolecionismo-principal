import type { Metadata } from "next";
import Link from "next/link";
import { CatalogView } from "@/components/shop/catalog-view";
import { EmptyState } from "@/components/ui";
import { parseCatalogParams } from "@/server/catalog-params";

// Páginas de resultado de busca não devem ser indexadas pelo Google.
export const metadata: Metadata = { title: "Buscar", robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseCatalogParams(await searchParams);

  if (!params.q) {
    return (
      <div className="container-page py-10">
        <h1>Buscar produtos</h1>
        <form action="/buscar" method="get" role="search" className="mt-6 flex max-w-xl gap-3">
          <label htmlFor="busca-pagina" className="sr-only">
            O que você procura?
          </label>
          <input id="busca-pagina" name="q" type="search" className="input" placeholder="Ex.: Hot Wheels, Mini GT, 1:64" maxLength={80} />
          <button type="submit" className="btn btn-dark">
            Buscar
          </button>
        </form>
        <div className="mt-8">
          <EmptyState
            title="Digite o que você procura"
            action={
              <Link href="/produtos" className="btn btn-primary">
                Ver todos os produtos
              </Link>
            }
          >
            Pesquise pelo nome, tipo ou característica do produto.
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-10">
      <h1>Resultados para “{params.q}”</h1>
      <div className="mt-6">
        <CatalogView basePath="/buscar" params={params} emptyTitle={`Nada encontrado para “${params.q}”`} />
      </div>
    </div>
  );
}
