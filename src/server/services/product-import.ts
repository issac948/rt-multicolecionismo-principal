import { analyzeProductCsv, CSV_MAX_BYTES, type ImportAnalysis, type ImportContext } from "@/lib/product-csv";
import { normalizeForSearch, slugify } from "@/lib/text";
import { db } from "../db";
import { categories, products, stockMovements } from "../db/schema";
import { BusinessRuleError, isUniqueViolation, ValidationError } from "../errors";
import { toRow } from "./products";

/** O que já existe no banco e pode conflitar com a planilha (SKU, nome) e as categorias que podem ser usadas. */
export async function loadImportContext(): Promise<ImportContext> {
  const [cats, existing] = await Promise.all([
    db.select({ id: categories.id, name: categories.name, parentId: categories.parentId }).from(categories),
    db.select({ sku: products.sku, name: products.name }).from(products),
  ]);
  return {
    categories: cats,
    existingSkus: new Set(existing.map((p) => p.sku?.toLowerCase()).filter((s): s is string => Boolean(s))),
    existingNames: new Set(existing.map((p) => normalizeForSearch(p.name).replace(/\s+/g, " ").trim())),
  };
}

export function assertCsvSize(text: string): void {
  if (Buffer.byteLength(text, "utf8") > CSV_MAX_BYTES) throw new ValidationError({ file: "A planilha é grande demais (máximo 1 MB). Divida em arquivos menores." });
}

/** Confere a planilha sem gravar nada. */
export async function previewProductImport(text: string): Promise<ImportAnalysis> {
  assertCsvSize(text);
  return analyzeProductCsv(text, await loadImportContext());
}

/**
 * Grava SOMENTE as linhas corretas, numa única transação (ou entra tudo, ou não entra nada).
 * A planilha é conferida DE NOVO aqui com o banco como está agora: a prévia mostrada ao dono não é confiada.
 * Cria produtos novos; nunca altera nem apaga um produto existente. Entram como rascunho, a não ser que `publish` seja pedido.
 */
export async function commitProductImport(
  text: string,
  options: { publish: boolean; expectedCount: number },
  actorId: string | null,
): Promise<{ created: number; skipped: number }> {
  assertCsvSize(text);
  const analysis = analyzeProductCsv(text, await loadImportContext());
  if (analysis.fatal) throw new ValidationError({ file: analysis.fatal });
  if (analysis.ok === 0) throw new BusinessRuleError("Nenhuma linha está pronta para importar. Corrija a planilha e envie de novo.");
  // O dono confirmou "importar N produtos". Se o banco mudou e agora são outros, nada é gravado.
  if (analysis.ok !== options.expectedCount) {
    throw new BusinessRuleError(`A conferência mudou (agora são ${analysis.ok} produtos prontos, e você confirmou ${options.expectedCount}). Confira a prévia de novo antes de importar.`);
  }

  try {
    await db.transaction(async (tx) => {
      const taken = new Set((await tx.select({ slug: products.slug }).from(products)).map((r) => r.slug));
      const slugFor = (name: string) => {
        const base = slugify(name, 70) || "produto";
        let slug = base;
        for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
        taken.add(slug);
        return slug;
      };

      const rows = analysis.inputs.map(({ input }) => ({
        ...toRow({ ...input, active: options.publish }),
        slug: slugFor(input.name),
        stock: input.stock,
      }));

      const CHUNK = 100;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const created = await tx.insert(products).values(rows.slice(i, i + CHUNK)).returning({ id: products.id, name: products.name, stock: products.stock });
        const movements = created
          .filter((p) => p.stock > 0)
          .map((p) => ({ productId: p.id, productName: p.name, type: "CADASTRO" as const, quantityChange: p.stock, stockAfter: p.stock, reason: "Estoque inicial (importação de planilha)", userId: actorId }));
        if (movements.length > 0) await tx.insert(stockMovements).values(movements);
      }
    });
  } catch (error) {
    if (isUniqueViolation(error, "products_sku_unique") || isUniqueViolation(error, "products_slug_unique")) {
      throw new BusinessRuleError("Outro cadastro aconteceu ao mesmo tempo e repetiu um SKU ou nome. Nada foi importado: confira a prévia de novo.");
    }
    throw error;
  }
  return { created: analysis.ok, skipped: analysis.failed };
}
