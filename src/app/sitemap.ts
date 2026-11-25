import type { MetadataRoute } from "next";
import { getEnv } from "@/server/env";
import { publicCategoryTree } from "@/lib/categories";
import { listCategoriesWithCounts } from "@/server/services/categories";
import { listProductSlugsForSitemap } from "@/server/services/products";

export const dynamic = "force-dynamic";

/** Só entram páginas públicas: início, listagem, categorias com produto publicado e produtos publicados. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getEnv().siteUrl;
  const [categoryList, productRows] = await Promise.all([listCategoriesWithCounts({ onlyActive: true }), listProductSlugsForSitemap()]);
  // Categoria sem produto publicado não entra (seria uma página vazia para o Google).
  const categories = publicCategoryTree(categoryList).flatMap((node) => [node, ...node.children]);

  return [
    { url: `${siteUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/produtos`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/eventos`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${siteUrl}/trocas-e-devolucoes`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/politica-de-privacidade`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/termos-de-uso`, changeFrequency: "yearly", priority: 0.3 },
    ...categories.map((c) => ({
      url: `${siteUrl}/categoria/${c.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...productRows.map((p) => ({
      url: `${siteUrl}/produtos/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
