import { promises as fs } from "node:fs";
import path from "node:path";
import { contentTypeForKey, isValidStorageKey, type StorageProvider } from "./types";

/** Fotos em uma pasta do computador/servidor (desenvolvimento e hospedagem com disco permanente). */
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
      return { data, contentType: contentTypeForKey(key) };
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

  async listOlderThan(prefix: string, cutoff: Date): Promise<string[]> {
    const dir = path.resolve(this.rootDir, prefix.replace(/\/+$/, ""));
    if (!dir.startsWith(path.resolve(this.rootDir) + path.sep)) return [];
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const out: string[] = [];
    for (const name of names) {
      const key = `${prefix.replace(/\/+$/, "")}/${name}`;
      if (!isValidStorageKey(key)) continue;
      const stat = await fs.stat(path.join(dir, name));
      if (stat.isFile() && stat.mtime < cutoff) out.push(key);
    }
    return out;
  }
}
