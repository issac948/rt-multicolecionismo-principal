import { isValidStorageKey, type StorageProvider } from "./types";

export type TransferResult = {
  /** Fotos copiadas (ou que seriam copiadas, na simulação). */
  copied: number;
  copiedBytes: number;
  /** Fotos que já estavam no destino (nunca são sobrescritas). */
  already: number;
  /** Usadas pelo banco, mas sem arquivo na origem. */
  missing: string[];
  failed: string[];
};

/**
 * Copia fotos de um armazenamento para outro (pasta -> banco/serviço externo, ou banco -> serviço externo).
 * Regras de segurança: só copia chaves válidas; NUNCA apaga nada na origem; NUNCA sobrescreve o que já existe no destino;
 * com `apply = false` não grava nada (simulação). Uma foto que falha não impede as demais.
 */
export async function copyFiles(source: StorageProvider, target: StorageProvider, keys: string[], apply: boolean): Promise<TransferResult> {
  const result: TransferResult = { copied: 0, copiedBytes: 0, already: 0, missing: [], failed: [] };
  for (const key of [...new Set(keys)].filter(isValidStorageKey).sort()) {
    try {
      if (await target.get(key)) {
        result.already++;
        continue;
      }
      const file = await source.get(key);
      if (!file) {
        result.missing.push(key);
        continue;
      }
      if (apply) await target.put(key, file.data, file.contentType);
      result.copied++;
      result.copiedBytes += file.data.length;
    } catch (error) {
      result.failed.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}
