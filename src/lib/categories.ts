import type { CategoryKind } from "./constants";

/**
 * Regras puras (sem banco) para a árvore de categorias: um único nível de subcategorias.
 * Pode ser usado no navegador e no servidor.
 */
export type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  active: boolean;
  kind: string;
  parentId: string | null;
  /** Produtos publicados diretamente nesta categoria. */
  productCount: number;
};

export type CategoryTreeNode<T extends CategoryNode = CategoryNode> = T & {
  children: T[];
  /** Produtos publicados nesta categoria + nas subcategorias. */
  totalCount: number;
};

/** Monta as categorias principais com suas subcategorias (ordem já vem do banco: posição e nome). */
export function buildCategoryTree<T extends CategoryNode>(list: T[]): Array<CategoryTreeNode<T>> {
  const byParent = new Map<string, T[]>();
  for (const c of list) {
    if (c.parentId) byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
  }
  const ids = new Set(list.map((c) => c.id));
  return list
    // Subcategoria cuja mãe não está na lista (ex.: mãe inativa) é tratada como principal para não sumir do painel.
    .filter((c) => !c.parentId || !ids.has(c.parentId))
    .map((c) => {
      const children = byParent.get(c.id) ?? [];
      return { ...c, children, totalCount: c.productCount + children.reduce((sum, ch) => sum + ch.productCount, 0) };
    });
}

/** Só aparece na vitrine categoria ativa com produto publicado nela ou em alguma subcategoria (sem páginas vazias). */
export function publicCategoryTree<T extends CategoryNode>(list: T[]): Array<CategoryTreeNode<T>> {
  return buildCategoryTree(list.filter((c) => c.active))
    .map((node) => ({ ...node, children: node.children.filter((ch) => ch.productCount > 0) }))
    .map((node) => ({ ...node, totalCount: node.productCount + node.children.reduce((s, ch) => s + ch.productCount, 0) }))
    .filter((node) => node.totalCount > 0);
}

/** Opções para o seletor de categoria do cadastro de produto: "Mãe › Filha", com o tipo de cada uma. */
export function toCategoryOptions(list: Array<{ id: string; name: string; kind: string; parentId: string | null; position?: number }>): Array<{ id: string; name: string; kind: CategoryKind }> {
  const byId = new Map(list.map((c) => [c.id, c]));
  const label = (c: { name: string; parentId: string | null }) => {
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    return parent ? `${parent.name} › ${c.name}` : c.name;
  };
  return list
    .map((c) => ({ id: c.id, name: label(c), kind: kindOrDefault(c.kind) }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function isCarKind(kind: string | null | undefined): boolean {
  return kind === "CARROS";
}

export function kindOrDefault(kind: string | null | undefined): CategoryKind {
  return kind === "CARROS" || kind === "COLECIONAVEL" ? kind : "OUTROS";
}

/** Categorias que o cadastro sugere ao dono (só estrutura; nenhum produto é criado). Brands/escalas são filtros, não categorias. */
export const SUGGESTED_CATEGORIES: Array<{ name: string; description: string; kind: CategoryKind; children: Array<{ name: string; description: string }> }> = [
  {
    name: "Miniaturas de carros",
    description: "Miniaturas de carros colecionáveis, lacradas ou soltas.",
    kind: "CARROS",
    children: [
      { name: "Hot Wheels", description: "Miniaturas Hot Wheels." },
      { name: "Mini GT", description: "Miniaturas Mini GT." },
      { name: "Matchbox", description: "Miniaturas Matchbox." },
      { name: "Outras marcas", description: "Miniaturas de outras marcas e escalas." },
    ],
  },
  {
    name: "Outras miniaturas e veículos",
    description: "Caminhões, motos e outros veículos colecionáveis em miniatura.",
    kind: "CARROS",
    children: [],
  },
  {
    name: "Bonecos e colecionáveis",
    description: "Bonecos, figuras de ação, personagens e outros colecionáveis.",
    kind: "COLECIONAVEL",
    children: [
      { name: "Bonecos e figuras de ação", description: "Bonecos e figuras de ação colecionáveis." },
      { name: "Personagens e figuras", description: "Personagens e figuras colecionáveis." },
      { name: "Outros colecionáveis", description: "Demais itens de colecionismo." },
    ],
  },
  {
    name: "Expositores e acessórios",
    description: "Expositores, protetores e itens para guardar, proteger e exibir a coleção.",
    kind: "OUTROS",
    children: [],
  },
];
