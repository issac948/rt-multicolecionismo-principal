import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import sharp from "sharp";

const browser = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "loja_session" && browser.token ? { name, value: browser.token } : undefined),
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { POST as uploadRoute } from "@/app/api/admin/upload/route";
import { GET as serveUpload } from "@/app/uploads/[...key]/route";
import { computeTargetSize } from "@/lib/client-image";
import { createSession } from "@/server/auth/session";
import { productImages, storedFiles } from "@/server/db/schema";
import { getEnv } from "@/server/env";
import { claimMaintenanceSlot, resetMaintenanceGate, runMaintenanceIfDue } from "@/server/services/maintenance";
import { DatabaseStorage, fileUrl, getStorage, LocalDiskStorage, storageConfigProblem } from "@/server/storage";
import { saveProductImage } from "@/server/storage/images";
import { createAdmin, db, resetDb } from "./helpers";

const ENV_KEYS = ["STORAGE_DRIVER", "NETLIFY", "AWS_LAMBDA_FUNCTION_NAME", "VERCEL", "STORAGE_PUBLIC_BASE_URL", "S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  await resetDb();
  browser.token = null;
  resetMaintenanceGate();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const png = () => sharp({ create: { width: 64, height: 48, channels: 3, background: "#2a7a5a" } }).png().toBuffer();

describe("escolha do armazenamento de fotos", () => {
  it("no computador/servidor comum usa a pasta local", () => {
    expect(getEnv().storage.driver).toBe("local");
    expect(getStorage()).toBeInstanceOf(LocalDiskStorage);
  });

  it("no Netlify (ou outra hospedagem sem servidor) usa o banco, sem precisar configurar nada", () => {
    for (const marker of ["NETLIFY", "AWS_LAMBDA_FUNCTION_NAME", "VERCEL"]) {
      process.env[marker] = "true";
      expect(getEnv().storage.driver, marker).toBe("database");
      expect(getStorage(), marker).toBeInstanceOf(DatabaseStorage);
      delete process.env[marker];
    }
  });

  it("STORAGE_DRIVER manda mais que a detecção automática", () => {
    process.env.NETLIFY = "true";
    process.env.STORAGE_DRIVER = "local";
    expect(getEnv().storage.driver).toBe("local");
    process.env.STORAGE_DRIVER = "valor-invalido";
    expect(getEnv().storage.driver).toBe("database"); // valor desconhecido cai na regra automática
  });

  it("serviço externo incompleto: aponta exatamente o que falta e não grava em lugar errado", () => {
    process.env.STORAGE_DRIVER = "s3";
    expect(storageConfigProblem()).toMatch(/S3_ENDPOINT.*S3_BUCKET.*S3_ACCESS_KEY_ID.*S3_SECRET_ACCESS_KEY/);
    expect(() => getStorage()).toThrow(/S3_ENDPOINT/);
    process.env.S3_ENDPOINT = "https://x.example";
    process.env.S3_BUCKET = "b";
    process.env.S3_ACCESS_KEY_ID = "a";
    process.env.S3_SECRET_ACCESS_KEY = "s";
    expect(storageConfigProblem()).toBeNull();
    expect(getStorage().constructor.name).toBe("S3Storage");
  });

  it("endereço público: pela loja (/uploads) ou direto do CDN quando configurado", () => {
    expect(fileUrl("products/a.webp")).toBe("/uploads/products/a.webp");
    expect(fileUrl(null)).toBeNull();
    process.env.STORAGE_DRIVER = "s3";
    process.env.STORAGE_PUBLIC_BASE_URL = "https://fotos.exemplo.com.br/";
    expect(fileUrl("products/a.webp")).toBe("https://fotos.exemplo.com.br/products/a.webp");
  });
});

describe("armazenamento no banco (DatabaseStorage)", () => {
  beforeEach(() => {
    process.env.STORAGE_DRIVER = "database";
  });

  it("grava, lê, sobrescreve e apaga; os bytes voltam idênticos", async () => {
    const storage = new DatabaseStorage();
    const bytes = Buffer.from([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
    await storage.put("products/a.webp", bytes, "image/webp");
    const back = await storage.get("products/a.webp");
    expect(back?.data.equals(bytes)).toBe(true);
    expect(back?.contentType).toBe("image/webp");

    await storage.put("products/a.webp", Buffer.from("novo"), "image/webp");
    expect((await storage.get("products/a.webp"))?.data.toString()).toBe("novo");
    expect(await db.select().from(storedFiles)).toHaveLength(1);

    await storage.delete("products/a.webp");
    expect(await storage.get("products/a.webp")).toBeNull();
    await storage.delete("products/nao-existe.webp"); // não é erro
  });

  it("recusa chaves inválidas (caminhos, tipos estranhos) sem tocar no banco", async () => {
    const storage = new DatabaseStorage();
    for (const bad of ["../x.webp", "products/../x.webp", "/abs.webp", "a b.webp", "x.svg", "x.html", "products//x.webp"]) {
      await expect(storage.put(bad, Buffer.from("x"), "image/webp"), bad).rejects.toThrow();
      expect(await storage.get(bad), bad).toBeNull();
    }
    expect(await db.select().from(storedFiles)).toHaveLength(0);
  });

  it("a foto enviada pelo painel fica no banco e continua lá com outra instância do armazenamento (como após um novo deploy)", async () => {
    // Foto grande de verdade (a miniatura só é menor que a foto grande quando há o que reduzir).
    const big = await sharp(Buffer.from(Array.from({ length: 1800 * 1200 * 3 }, (_, i) => (i * 7 + (i >> 5)) & 255)), { raw: { width: 1800, height: 1200, channels: 3 } })
      .jpeg({ quality: 90 })
      .toBuffer();
    const image = await saveProductImage(big);
    const [row] = await db.select().from(productImages);
    expect(await db.select({ key: storedFiles.key }).from(storedFiles).orderBy(storedFiles.key)).toHaveLength(2);
    const fresh = new DatabaseStorage();
    const stored = await fresh.get(row.storageKey);
    expect(stored?.data.subarray(8, 12).toString()).toBe("WEBP");
    expect(image.url).toBe(`/uploads/${row.storageKey}`);
    expect((await fresh.get(row.thumbKey))?.data.length).toBeLessThan(stored!.data.length);
  });

  it("lista só o que é mais antigo que o corte e tem o prefixo (para limpar fotos abandonadas)", async () => {
    const storage = new DatabaseStorage();
    await storage.put("events/velho.webp", Buffer.from("x"), "image/webp");
    await storage.put("events/novo.webp", Buffer.from("x"), "image/webp");
    await storage.put("products/velho.webp", Buffer.from("x"), "image/webp");
    await db.update(storedFiles).set({ createdAt: new Date(Date.now() - 48 * 3600_000) }).where(sql`${storedFiles.key} IN ('events/velho.webp', 'products/velho.webp')`);
    const keys = await storage.listOlderThan("events/", new Date(Date.now() - 24 * 3600_000));
    expect(keys).toEqual(["events/velho.webp"]);
  });
});

describe("entrega das fotos (/uploads/...)", () => {
  beforeEach(() => {
    process.env.STORAGE_DRIVER = "database";
  });
  const call = (key: string, headers: Record<string, string> = {}) =>
    serveUpload(new Request(`http://localhost:3000/uploads/${key}`, { headers }), { params: Promise.resolve({ key: key.split("/") }) });

  it("entrega com cache longo e pede ao CDN do Netlify para guardar", async () => {
    await new DatabaseStorage().put("products/a.webp", Buffer.from("RIFFxxxxWEBP"), "image/webp");
    const response = await call("products/a.webp");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toContain("max-age=31536000");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("netlify-cdn-cache-control")).toContain("durable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("etag")).toBe('"products/a.webp"');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("RIFFxxxxWEBP");
  });

  it("quem já tem a foto recebe 304 SEM ler o armazenamento", async () => {
    // O arquivo nem existe no banco: se a rota o lesse, daria 404. 304 prova que não leu.
    const response = await call("products/ja-no-navegador.webp", { "if-none-match": '"products/ja-no-navegador.webp"' });
    expect(response.status).toBe(304);
  });

  it("chave inexistente ou inválida dá 404 (e 404 não fica em cache por muito tempo)", async () => {
    const missing = await call("products/nao-existe.webp");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).not.toContain("immutable");
    expect((await call("..%2Fsegredo.webp")).status).toBe(404);
    expect((await call("products/x.svg")).status).toBe(404);
  });

  it("envio pelo painel com o armazenamento no banco: grava no banco e a foto é entregue", async () => {
    const admin = await createAdmin();
    browser.token = (await createSession(admin.id, "ADMIN")).token;
    const fd = new FormData();
    fd.set("file", new Blob([await png()], { type: "image/png" }), "f.png");
    const response = await uploadRoute(new Request("http://localhost:3000/api/admin/upload", { method: "POST", body: fd, headers: { origin: "http://localhost:3000" } }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string };
    const served = await call(body.url.replace("/uploads/", ""));
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/webp");
  });
});

describe("manutenção sob demanda (Netlify não tem temporizador interno)", () => {
  it("só uma execução por intervalo, mesmo com várias tentativas ao mesmo tempo", async () => {
    const results = await Promise.all([claimMaintenanceSlot(), claimMaintenanceSlot(), claimMaintenanceSlot(), claimMaintenanceSlot()]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await claimMaintenanceSlot()).toBe(false);
  });

  it("depois do intervalo, volta a liberar", async () => {
    expect(await claimMaintenanceSlot(300)).toBe(true);
    await db.execute(sql`UPDATE settings SET value = jsonb_build_object('lastRunAt', now() - interval '10 minutes') WHERE key = 'maintenance'`);
    expect(await claimMaintenanceSlot(300)).toBe(true);
  });

  it("runMaintenanceIfDue roda a rotina uma vez e não deixa a manutenção atrapalhar (nunca lança erro)", async () => {
    const first = await runMaintenanceIfDue();
    expect(first).toMatchObject({ expiredOrders: 0, expiredSessions: 0 });
    resetMaintenanceGate();
    expect(await runMaintenanceIfDue()).toBeNull(); // o banco ainda guarda a última execução
    // A linha de controle não aparece como "configuração da loja".
    const [row] = await db.execute(sql`SELECT count(*)::int AS n FROM settings WHERE key = 'store'`).then((r) => r.rows as Array<{ n: number }>);
    expect(row.n).toBe(1);
  });
});

describe("redução de fotos no navegador (cálculo do tamanho)", () => {
  it("reduz mantendo a proporção e nunca aumenta", () => {
    expect(computeTargetSize(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(computeTargetSize(3000, 4000)).toEqual({ width: 1500, height: 2000 });
    expect(computeTargetSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(computeTargetSize(2000, 2000)).toEqual({ width: 2000, height: 2000 });
    expect(computeTargetSize(10000, 1)).toEqual({ width: 2000, height: 1 });
    expect(computeTargetSize(0, 0)).toEqual({ width: 1, height: 1 });
  });
});

