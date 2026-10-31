import { sql } from "drizzle-orm";
import { db } from "../db";
import { getEnv } from "../env";

export type StorageUsage = {
  driver: "local" | "database" | "s3";
  /** Só no armazenamento "database": quantidade e bytes das fotos guardadas no banco. */
  files: number;
  photoBytes: number;
  byPrefix: Array<{ prefix: string; files: number; bytes: number }>;
  /** Teto configurado para as fotos no banco. */
  photoLimitBytes: number;
  /** Tamanho total do banco de dados e o tamanho do plano informado. */
  databaseBytes: number;
  databaseLimitBytes: number;
};

/** Bytes das fotos guardadas no banco (soma dos tamanhos dos arquivos). */
export async function storedFilesBytes(): Promise<number> {
  const [row] = (await db.execute(sql`SELECT coalesce(sum(size), 0)::bigint AS bytes FROM stored_files`)).rows as Array<{ bytes: string | number }>;
  return Number(row?.bytes ?? 0);
}

export async function databaseSizeBytes(): Promise<number> {
  const [row] = (await db.execute(sql`SELECT pg_database_size(current_database())::bigint AS bytes`)).rows as Array<{ bytes: string | number }>;
  return Number(row?.bytes ?? 0);
}

/** Números para o painel (medidor de espaço). Consultas leves: uma soma agrupada e o tamanho do banco. */
export async function getStorageUsage(): Promise<StorageUsage> {
  const env = getEnv();
  const base = {
    driver: env.storage.driver,
    photoLimitBytes: env.storage.dbMaxBytes,
    databaseLimitBytes: env.databasePlanLimitBytes,
  };
  const databaseBytes = await databaseSizeBytes();
  if (env.storage.driver !== "database") return { ...base, files: 0, photoBytes: 0, byPrefix: [], databaseBytes };

  const rows = (await db.execute(sql`
    SELECT split_part(key, '/', 1) AS prefix, count(*)::int AS files, coalesce(sum(size), 0)::bigint AS bytes
    FROM stored_files GROUP BY 1 ORDER BY 1
  `)).rows as Array<{ prefix: string; files: number; bytes: string | number }>;
  const byPrefix = rows.map((r) => ({ prefix: r.prefix, files: r.files, bytes: Number(r.bytes) }));
  return {
    ...base,
    files: byPrefix.reduce((n, r) => n + r.files, 0),
    photoBytes: byPrefix.reduce((n, r) => n + r.bytes, 0),
    byPrefix,
    databaseBytes,
  };
}

export type UsageLevel = "ok" | "warn" | "danger";

/** 70% = aviso, 90% = perigo. */
export function usageLevel(used: number, limit: number): UsageLevel {
  if (limit <= 0) return "ok";
  const ratio = used / limit;
  return ratio >= 0.9 ? "danger" : ratio >= 0.7 ? "warn" : "ok";
}

export function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1).replace(".", ",")} MB`;
}
