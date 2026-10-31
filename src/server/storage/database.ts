import { and, eq, lt, like } from "drizzle-orm";
import { escapeLike } from "@/lib/text";
import { db } from "../db";
import { storedFiles } from "../db/schema";
import { getEnv } from "../env";
import { StorageQuotaError } from "../errors";
import { contentTypeForKey, isValidStorageKey, type StorageProvider } from "./types";
import { databaseSizeBytes, formatMb, storedFilesBytes } from "./usage";

/**
 * Fotos guardadas no próprio PostgreSQL (tabela stored_files).
 * É o padrão em hospedagem sem disco permanente (Netlify): as fotos sobrevivem a novas publicações e reinícios
 * e entram no backup do banco. Cada foto já é reduzida (WebP, poucas centenas de KB), então o espaço usado é pequeno.
 */
export class DatabaseStorage implements StorageProvider {
  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    if (!isValidStorageKey(key)) throw new Error("Chave de arquivo inválida.");
    await this.assertRoom(key, data.length);
    await db
      .insert(storedFiles)
      .values({ key, contentType, size: data.length, data })
      .onConflictDoUpdate({ target: storedFiles.key, set: { contentType, size: data.length, data } });
  }

  /**
   * Recusa a gravação quando as fotos passariam do teto configurado ou quando o banco inteiro está quase cheio.
   * Num plano gratuito, banco cheio = pedidos e pagamentos deixam de ser gravados: as fotos nunca podem causar isso.
   */
  private async assertRoom(key: string, incoming: number): Promise<void> {
    const env = getEnv();
    const [existing] = await db.select({ size: storedFiles.size }).from(storedFiles).where(eq(storedFiles.key, key)).limit(1);
    const delta = incoming - (existing?.size ?? 0);
    if (delta <= 0) return;

    const used = await storedFilesBytes();
    if (used + delta > env.storage.dbMaxBytes) {
      throw new StorageQuotaError(
        `O espaço reservado para fotos (${formatMb(env.storage.dbMaxBytes)}) está cheio. Exclua fotos que não usa mais, aumente o limite (STORAGE_DB_MAX_MB) ou passe as fotos para um armazenamento externo.`,
      );
    }
    const databaseBytes = await databaseSizeBytes();
    if (databaseBytes + delta > env.databasePlanLimitBytes * 0.9) {
      throw new StorageQuotaError(
        `O banco de dados está perto do limite do plano (${formatMb(databaseBytes)} de ${formatMb(env.databasePlanLimitBytes)}). Novas fotos foram bloqueadas para proteger os pedidos. Veja as opções no painel (Resumo).`,
      );
    }
  }

  async get(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    if (!isValidStorageKey(key)) return null;
    const [row] = await db.select({ data: storedFiles.data, contentType: storedFiles.contentType }).from(storedFiles).where(eq(storedFiles.key, key)).limit(1);
    return row ? { data: row.data, contentType: row.contentType || contentTypeForKey(key) } : null;
  }

  async delete(key: string): Promise<void> {
    if (!isValidStorageKey(key)) return;
    await db.delete(storedFiles).where(eq(storedFiles.key, key));
  }

  publicUrl(key: string): string {
    return `/uploads/${key}`;
  }

  async listOlderThan(prefix: string, cutoff: Date): Promise<string[]> {
    const rows = await db
      .select({ key: storedFiles.key })
      .from(storedFiles)
      .where(and(like(storedFiles.key, `${escapeLike(prefix)}%`), lt(storedFiles.createdAt, cutoff)));
    return rows.map((r) => r.key);
  }
}
