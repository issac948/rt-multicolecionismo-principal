import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseStorage, LocalDiskStorage } from "@/server/storage";
import { copyFiles } from "@/server/storage/transfer";
import type { StorageProvider } from "@/server/storage";
import { resetDb } from "./helpers";

/** Armazenamento em memória que conta as gravações (para provar que a simulação não grava e que nada é sobrescrito). */
function memoryStorage(failOn: string[] = []) {
  const files = new Map<string, { data: Buffer; contentType: string }>();
  const puts: string[] = [];
  const provider: StorageProvider = {
    async put(key, data, contentType) {
      if (failOn.includes(key)) throw new Error("serviço indisponível");
      puts.push(key);
      files.set(key, { data, contentType });
    },
    async get(key) {
      return files.get(key) ?? null;
    },
    async delete(key) {
      files.delete(key);
    },
    publicUrl: (key) => `/uploads/${key}`,
  };
  return { provider, files, puts };
}

let dir: string;
beforeEach(async () => {
  process.env.STORAGE_DRIVER = "database";
  await resetDb();
  dir = await mkdtemp(path.join(tmpdir(), "loja-transfer-"));
});
afterEach(async () => {
  delete process.env.STORAGE_DRIVER;
  await rm(dir, { recursive: true, force: true });
});

describe("cópia de fotos entre armazenamentos (storage:migrate)", () => {
  it("copia do banco para outro armazenamento com os mesmos bytes e NÃO apaga a origem", async () => {
    const source = new DatabaseStorage();
    const a = Buffer.from([1, 2, 3, 250, 251, 252]);
    const b = Buffer.from("segunda foto");
    await source.put("products/a.webp", a, "image/webp");
    await source.put("products/b-thumb.webp", b, "image/webp");

    const target = new LocalDiskStorage(dir);
    const result = await copyFiles(source, target, ["products/a.webp", "products/b-thumb.webp"], true);

    expect(result).toMatchObject({ copied: 2, already: 0, missing: [], failed: [] });
    expect(result.copiedBytes).toBe(a.length + b.length);
    expect((await target.get("products/a.webp"))?.data.equals(a)).toBe(true);
    expect((await target.get("products/b-thumb.webp"))?.contentType).toBe("image/webp");
    // A origem continua intacta: quem decide apagar é o dono, depois de conferir.
    expect((await source.get("products/a.webp"))?.data.equals(a)).toBe(true);
    expect((await source.get("products/b-thumb.webp"))?.data.equals(b)).toBe(true);
  });

  it("simulação conta o que seria copiado, mas não grava nada", async () => {
    const source = new DatabaseStorage();
    await source.put("events/x.webp", Buffer.from("abc"), "image/webp");
    const target = memoryStorage();

    const result = await copyFiles(source, target.provider, ["events/x.webp"], false);

    expect(result).toMatchObject({ copied: 1, copiedBytes: 3, already: 0 });
    expect(target.puts).toEqual([]);
    expect(await readdir(dir)).toEqual([]);
  });

  it("nunca sobrescreve o que já existe no destino (rodar de novo é seguro)", async () => {
    const source = new DatabaseStorage();
    await source.put("products/a.webp", Buffer.from("da origem"), "image/webp");
    const target = memoryStorage();
    target.files.set("products/a.webp", { data: Buffer.from("ja estava no destino"), contentType: "image/webp" });

    const first = await copyFiles(source, target.provider, ["products/a.webp"], true);
    expect(first).toMatchObject({ copied: 0, already: 1 });
    expect(target.puts).toEqual([]);
    expect(target.files.get("products/a.webp")?.data.toString()).toBe("ja estava no destino");

    // Segunda rodada com uma foto nova: só a nova é copiada.
    await source.put("products/b.webp", Buffer.from("nova"), "image/webp");
    const second = await copyFiles(source, target.provider, ["products/a.webp", "products/b.webp"], true);
    expect(second).toMatchObject({ copied: 1, already: 1 });
    expect(target.puts).toEqual(["products/b.webp"]);
  });

  it("foto usada pelo banco mas sem arquivo na origem vai para 'missing'; chaves inválidas e repetidas são ignoradas", async () => {
    const source = new DatabaseStorage();
    await source.put("products/ok.webp", Buffer.from("ok"), "image/webp");
    const target = memoryStorage();

    const result = await copyFiles(source, target.provider, ["products/ok.webp", "products/ok.webp", "products/sumiu.webp", "../fora.webp", "x.svg"], true);

    expect(result.copied).toBe(1);
    expect(result.missing).toEqual(["products/sumiu.webp"]);
    expect(result.failed).toEqual([]);
    expect(target.puts).toEqual(["products/ok.webp"]);
  });

  it("uma foto que falha não impede as outras e a falha é informada", async () => {
    const source = new DatabaseStorage();
    await source.put("products/a.webp", Buffer.from("a"), "image/webp");
    await source.put("products/b.webp", Buffer.from("b"), "image/webp");
    await source.put("products/c.webp", Buffer.from("c"), "image/webp");
    const target = memoryStorage(["products/b.webp"]);

    const result = await copyFiles(source, target.provider, ["products/a.webp", "products/b.webp", "products/c.webp"], true);

    expect(result.copied).toBe(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toContain("products/b.webp");
    expect(result.failed[0]).toContain("serviço indisponível");
    expect(target.puts).toEqual(["products/a.webp", "products/c.webp"]);
  });
});
