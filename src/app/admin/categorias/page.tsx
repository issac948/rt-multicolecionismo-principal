import type { Metadata } from "next";
import { AdminPageHeader, SectionPanel } from "@/components/admin/admin-ui";
import { CategoryForm } from "@/components/admin/category-form";
import { SuggestedCategoriesButton } from "@/components/admin/suggested-categories-button";
import { Badge } from "@/components/ui";
import { buildCategoryTree } from "@/lib/categories";
import { requireAdminPage } from "@/server/auth/current-user";
import { listCategoriesWithCounts } from "@/server/services/categories";

const KIND_SHORT: Record<string, string> = { CARROS: "Miniaturas de carros", COLECIONAVEL: "Bonecos e colecionáveis", OUTROS: "Acessórios" };

export const metadata: Metadata = { title: "Categorias" };

export default async function AdminCategoriesPage() {
  await requireAdminPage("/admin/categorias");
  const categories = await listCategoriesWithCounts();
  const tree = buildCategoryTree(categories);
  const roots = tree.map((n) => ({ id: n.id, name: n.name }));

  const renderItem = (category: (typeof categories)[number], hasChildren: boolean, isChild: boolean) => (
    <li key={category.id} className={`rounded-md border border-line p-4 ${isChild ? "ml-4 border-l-4 border-l-gold sm:ml-8" : ""}`}>
      <p className="mb-3 flex flex-wrap items-center gap-2">
        <strong className="text-lg">{category.name}</strong>
        {category.active ? <Badge tone="success">Visível</Badge> : <Badge tone="neutral">Oculta</Badge>}
        {!isChild && <Badge tone="info">{KIND_SHORT[category.kind] ?? "Outros"}</Badge>}
        {isChild && <Badge tone="neutral">Subcategoria</Badge>}
        <span className="text-sm text-ink-soft">
          {category.productCount} {category.productCount === 1 ? "produto publicado" : "produtos publicados"}
        </span>
      </p>
      <CategoryForm
        category={{
          id: category.id,
          name: category.name,
          description: category.description ?? "",
          position: category.position,
          active: category.active,
          kind: category.kind,
          parentId: category.parentId,
        }}
        productCount={category.productCount}
        parents={roots.filter((r) => r.id !== category.id)}
        hasChildren={hasChildren}
      />
    </li>
  );

  return (
    <>
      <AdminPageHeader
        title="Categorias"
        description="Agrupe os produtos por tipo e, se quiser, em subcategorias. Só aparecem na loja as categorias visíveis que têm produto publicado."
      />

      <div className="space-y-6">
        <SectionPanel title="Estrutura sugerida para miniaturas e colecionáveis" id="titulo-sugestao">
          <p className="mb-3 text-sm text-ink-soft">
            Cria <strong>Miniaturas de carros</strong> (Hot Wheels, Mini GT, Matchbox, Outras marcas), <strong>Outras miniaturas e veículos</strong>,{" "}
            <strong>Bonecos e colecionáveis</strong> e <strong>Expositores e acessórios</strong>. Só cria o que ainda não existe; as suas categorias não são
            alteradas. Marca, escala e série também funcionam como filtros na loja, mesmo sem categoria.
          </p>
          <SuggestedCategoriesButton />
        </SectionPanel>

        <SectionPanel title="Nova categoria ou subcategoria" id="titulo-nova">
          <CategoryForm parents={roots} />
        </SectionPanel>

        <SectionPanel title="Categorias cadastradas" id="titulo-lista">
          {categories.length === 0 ? (
            <p className="text-ink-soft">Nenhuma categoria ainda. Use a estrutura sugerida ou crie a primeira acima.</p>
          ) : (
            <ul className="space-y-4">
              {tree.flatMap((node) => [
                renderItem(node, node.children.length > 0, false),
                ...node.children.map((child) => renderItem(child as (typeof categories)[number], false, true)),
              ])}
            </ul>
          )}
        </SectionPanel>
      </div>
    </>
  );
}
