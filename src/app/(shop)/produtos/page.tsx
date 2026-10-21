import type { Metadata } from "next";
import { CatalogView } from "@/components/shop/catalog-view";
import { parseCatalogParams, type CatalogParams } from "@/server/catalog-params";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** O título acompanha o tipo escolhido: quem vem de "Ver as miniaturas de carros" não cai numa página chamada "Todos os produtos". */
const KIND_TEXT: Record<Exclude<CatalogParams["kind"], "">, { title: string; description: string }> = {
  miniaturas: {
    title: "Miniaturas de carros",
    description: "Miniaturas de carros colecionáveis, lacradas e soltas: veja marcas, escalas, preços e disponibilidade.",
  },
  bonecos: {
    title: "Bonecos e colecionáveis",
    description: "Bonecos, figuras de ação, personagens e outros colecionáveis para a sua coleção.",
  },
  outros: {
    title: "Acessórios para a coleção",
    description: "Expositores, protetores e itens para guardar, proteger e exibir a sua coleção de miniaturas e colecionáveis.",
  },
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { kind } = parseCatalogParams(await searchParams);
  if (!kind) {
    return {
      title: "Produtos",
      description: "Miniaturas de carros colecionáveis, bonecos e outros colecionáveis, com preços, promoções e disponibilidade em estoque.",
      alternates: { canonical: "/produtos" },
    };
  }
  return { title: KIND_TEXT[kind].title, description: KIND_TEXT[kind].description, alternates: { canonical: `/produtos?tipo=${kind}` } };
}

export default async function ProductsPage({ searchParams }: Props) {
  const params = parseCatalogParams(await searchParams);
  return (
    <div className="container-page py-10">
      <h1>{params.kind ? KIND_TEXT[params.kind].title : "Todos os produtos"}</h1>
      {params.kind && <p className="mt-3 max-w-[60ch] text-ink-soft">{KIND_TEXT[params.kind].description}</p>}
      <div className="mt-6">
        <CatalogView basePath="/produtos" params={params} />
      </div>
    </div>
  );
}
