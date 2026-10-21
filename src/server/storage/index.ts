import { promises as fs } from "node:fs";
import path from "node:path";
import { getEnv } from "../env";

/**
 * Abstração de armazenamento de arquivos. Para trocar o local das imagens
 * (ex.: Cloudflare R2 / Amazon S3), crie outra classe que implemente
 * `StorageProvider` e devolva-a em `getStorage()`. Nenhum outro código muda,
 * pois o restante do sistema só conhece chaves como "products/abc.webp".
 */
export interface StorageProvider {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  /** Endereço público (relativo ou absoluto) para usar em <img src>. */
  publicUrl(key: string): string;
}

const CONTENT_TYPES: Record<string, string> = {
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

export class LocalDiskStorage implements StorageProvider {
  constructor(private readonly rootDir: string) {}

  private resolve(key: string): string {
    if (!isValidStorageKey(key)) throw new Error("Chave de arquivo inválida.");
    const full = path.resolve(this.rootDir, key);
    const root = path.resolve(this.rootDir);
    if (!full.startsWith(root + path.sep)) throw new Error("Caminho fora da pasta de uploads.");
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    // Grava em arquivo temporário e renomeia: nunca existe arquivo pela metade.
    const tmp = `${full}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, data, { mode: 0o644 });
    await fs.rename(tmp, full);
  }

  async get(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    if (!isValidStorageKey(key)) return null;
    try {
      const data = await fs.readFile(this.resolve(key));
      const contentType = CONTENT_TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream";
      return { data, contentType };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  publicUrl(key: string): string {
    return `/uploads/${key}`;
  }
}

export function getStorage(): StorageProvider {
  return new LocalDiskStorage(getEnv().uploadDir);
}

/** URL pública de uma chave de arquivo (ou null). */
export function fileUrl(key: string | null | undefined): string | null {
  return key ? getStorage().publicUrl(key) : null;
}
