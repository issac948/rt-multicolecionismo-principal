/**
 * Abstração de armazenamento de arquivos. O resto do sistema só conhece "chaves" como "products/abc.webp";
 * trocar o lugar onde as fotos ficam (pasta, banco, serviço externo) não muda nenhuma outra tabela ou tela.
 */
export interface StorageProvider {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  /** Endereço público (relativo ou absoluto) para usar em <img src>. */
  publicUrl(key: string): string;
  /** Opcional: chaves com o prefixo dado, gravadas antes de `cutoff` (para limpar fotos enviadas e nunca usadas). */
  listOlderThan?(prefix: string, cutoff: Date): Promise<string[]>;
}

export const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/** Só chaves simples como "products/6f1c...webp"; nada de "..", barras duplas ou caracteres estranhos. */
const KEY_RE = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*\.(webp|png|jpg|jpeg)$/i;

export function isValidStorageKey(key: string): boolean {
  return key.length <= 200 && KEY_RE.test(key) && !key.includes("..");
}

export function contentTypeForKey(key: string): string {
  const dot = key.lastIndexOf(".");
  return CONTENT_TYPES[dot >= 0 ? key.slice(dot).toLowerCase() : ""] ?? "application/octet-stream";
}
