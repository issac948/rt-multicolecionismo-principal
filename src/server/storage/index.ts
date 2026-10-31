import { getEnv } from "../env";
import { DatabaseStorage } from "./database";
import { LocalDiskStorage } from "./local";
import { S3Storage } from "./s3";
import type { StorageProvider } from "./types";

export { isValidStorageKey, contentTypeForKey, type StorageProvider } from "./types";
export { LocalDiskStorage } from "./local";
export { DatabaseStorage } from "./database";

/** Informa por que o armazenamento escolhido não pode ser usado (configuração incompleta), ou null se está tudo certo. */
export function storageConfigProblem(): string | null {
  const { storage } = getEnv();
  if (storage.driver !== "s3") return null;
  const s3 = storage.s3;
  const missing = [
    !s3.endpoint && "S3_ENDPOINT",
    !s3.bucket && "S3_BUCKET",
    !s3.accessKeyId && "S3_ACCESS_KEY_ID",
    !s3.secretAccessKey && "S3_SECRET_ACCESS_KEY",
  ].filter(Boolean);
  return missing.length > 0 ? `Armazenamento externo (s3) sem: ${missing.join(", ")}.` : null;
}

/**
 * Escolhe onde as fotos ficam (variável STORAGE_DRIVER):
 *  - "database": no PostgreSQL da loja (padrão no Netlify e outras hospedagens sem disco permanente);
 *  - "local": em uma pasta (padrão no computador e em servidor com disco permanente);
 *  - "s3": em serviço externo compatível com S3 (Cloudflare R2, etc.).
 */
export function getStorage(): StorageProvider {
  const env = getEnv();
  switch (env.storage.driver) {
    case "database":
      return new DatabaseStorage();
    case "s3": {
      const problem = storageConfigProblem();
      if (problem) throw new Error(problem);
      return new S3Storage({ ...env.storage.s3, publicBaseUrl: env.storage.publicBaseUrl });
    }
    default:
      return new LocalDiskStorage(env.uploadDir);
  }
}

/** URL pública de uma chave de arquivo (ou null). */
export function fileUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const { storage } = getEnv();
  // Com serviço externo + endereço público, as fotos saem direto do CDN (sem passar pela loja).
  if (storage.driver === "s3" && storage.publicBaseUrl) return `${storage.publicBaseUrl}/${key}`;
  return `/uploads/${key}`;
}
