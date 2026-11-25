import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BACKUP_EXCLUDED, createBackup, orderedTables, restoreBackup, verifyBackup } from "../scripts/lib/backup";
import { expectedSchema } from "../scripts/lib/db-report";
import { describeDatabaseUrl } from "../scripts/lib/db-target";
import { addToCart, getOrCreateUserCart } from "@/server/services/cart";
import { createOrderFromCart } from "@/server/services/orders";
import { createAddress, createAdmin, createTestProduct, createUser, db, resetDb } from "./helpers";

const URL_TEST = process.env.DATABASE_URL as string;
const DRIZZLE = path.resolve(process.cwd(), "drizzle");
let client: Client;
let tmp: string;

beforeAll(async () => {
  client = new Client({ connectionString: URL_TEST });
  await client.connect();
  tmp = await mkdtemp(path.join(os.tmpdir(), "backup-test-"));
});
afterAll(async () => {
  await client.end();
  await rm(tmp, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetDb();
});

const target = () => describeDatabaseUrl(URL_TEST);
const allTables = () => [...expectedSchema().keys()].filter((t) => !(BACKUP_EXCLUDED as readonly string[]).includes(t));

async function seed() {
  await createAdmin();
  const product = await createTestProduct({ stock: 5, active: true });
  const user = await createUser();
  const address = await createAddress(user.id);
  const cartId = await getOrCreateUserCart(user.id);
  await addToCart(cartId, product.id, 2);
  const order = await createOrderFromCart({ userId: user.id, cartId, addressId: address.id, shippingCode: "ENTREGA", note: "obs ç ã \"aspas\"" });
  await db.execute(sql`INSERT INTO stored_files (key, content_type, size, data) VALUES ('products/x.webp', 'image/webp', 4, '\\x00ff10ab'::bytea)`);
  return { product, user, order };
}

async function dump(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const t of allTables()) {
    const r = await client.query(`SELECT row_to_json(x)::text AS j FROM "${t}" x`);
    out[t] = r.rows.map((row) => row.j as string).sort();
  }
  return out;
}

async function backupTo(name: string, includePhotos = true) {
  const dir = path.join(tmp, name);
  const manifest = await createBackup(client, { dir, target: target(), drizzleDir: DRIZZLE, includePhotos });
  return { dir, manifest };
}

describe("backup", () => {
  it("exporta todas as tabelas, sem sessões nem links de senha, e a verificação passa", async () => {
    const { user } = await seed();
    await db.execute(sql`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (${user.id}, ${"a".repeat(64)}, now() + interval '1 day')`);
    const { dir, manifest } = await backupTo("ok");
    expect(Object.keys(manifest.tabelas).sort()).toEqual(allTables().sort());
    expect(manifest.excluidas).toEqual(expect.arrayContaining(["sessions", "password_reset_tokens"]));
    expect(manifest.tabelas.orders.linhas).toBe(1);
    expect(manifest.tabelas.stored_files.linhas).toBe(1);
    const v = await verifyBackup(dir, { drizzleDir: DRIZZLE });
    expect(v.erros).toEqual([]);
    expect(v.ok).toBe(true);
    const files = (await readFile(path.join(dir, "manifest.json"), "utf8")) + (await readFile(path.join(dir, "LEIA-ME.txt"), "utf8"));
    expect(files).not.toContain("loja_dev_pw");
  });

  it("não altera o banco e recusa pasta já usada", async () => {
    await seed();
    const before = await dump();
    const { dir } = await backupTo("sem-alterar");
    expect(await dump()).toEqual(before);
    await expect(createBackup(client, { dir, target: target(), drizzleDir: DRIZZLE })).rejects.toThrow(/pasta nova/);
  });

  it("--sem-fotos deixa de fora stored_files e avisa", async () => {
    await seed();
    const { dir, manifest } = await backupTo("sem-fotos", false);
    expect(manifest.tabelas.stored_files).toBeUndefined();
    const v = await verifyBackup(dir, { drizzleDir: DRIZZLE });
    expect(v.ok).toBe(true);
    expect(v.avisos.join()).toMatch(/sem as fotos/);
  });
});

describe("verificação detecta backup estragado", () => {
  it("arquivo alterado, registro apagado, arquivo ausente e manifesto ausente", async () => {
    await seed();
    const { dir } = await backupTo("estragar");
    const file = path.join(dir, "products.jsonl");
    const original = await readFile(file, "utf8");

    await writeFile(file, original.replace(/Miniatura/, "Outra"));
    expect((await verifyBackup(dir)).erros.join()).toMatch(/products: o conteúdo mudou/);

    await writeFile(file, "");
    expect((await verifyBackup(dir)).erros.join()).toMatch(/0 registros no arquivo, 1 no manifesto/);

    await writeFile(file, "isto não é json\n");
    expect((await verifyBackup(dir)).ok).toBe(false);

    await rm(file);
    expect((await verifyBackup(dir)).erros.join()).toMatch(/products: arquivo ausente/);

    await rm(path.join(dir, "manifest.json"));
    expect((await verifyBackup(dir)).erros.join()).toMatch(/manifest\.json ausente/);
  });
});

describe("restauração", () => {
  it("apaga tudo, restaura e o banco fica idêntico (incl. foto binária, acentos e número do pedido)", async () => {
    const { order } = await seed();
    const before = await dump();
    const { dir } = await backupTo("restaurar");
    await client.query(`TRUNCATE ${allTables().map((t) => `"${t}"`).join(", ")}, sessions, password_reset_tokens RESTART IDENTITY CASCADE`);
    expect((await dump()).orders).toEqual([]);

    const r = await restoreBackup(client, dir, { drizzleDir: DRIZZLE });
    expect(r.tabelas.orders).toBe(1);
    expect(await dump()).toEqual(before);

    // o próximo pedido não repete o número
    const next = await client.query("SELECT nextval(pg_get_serial_sequence('orders', 'number'))::int AS n");
    expect(next.rows[0].n).toBeGreaterThan(order.number);
  });

  it("recusa restaurar em banco que já tem dados e não muda nada", async () => {
    await seed();
    const { dir } = await backupTo("nao-vazio");
    const before = await dump();
    await expect(restoreBackup(client, dir)).rejects.toThrow(/não está vazia/);
    expect(await dump()).toEqual(before);
  });

  it("recusa backup com problema (SHA-256 diferente)", async () => {
    await seed();
    const { dir } = await backupTo("invalido");
    await writeFile(path.join(dir, "users.jsonl"), "{}\n");
    await expect(restoreBackup(client, dir)).rejects.toThrow(/Backup inválido/);
  });

  it("registros que dependem uns dos outros (subcategoria antes da categoria-mãe) entram por novas tentativas", async () => {
    await db.execute(sql`INSERT INTO categories (id, name, slug, kind) VALUES ('00000000-0000-4000-8000-0000000000aa', 'Mãe', 'mae', 'CARROS')`);
    await db.execute(sql`INSERT INTO categories (id, name, slug, kind, parent_id) VALUES ('00000000-0000-4000-8000-0000000000bb', 'Filha', 'filha', 'CARROS', '00000000-0000-4000-8000-0000000000aa')`);
    await createAdmin();
    const { dir } = await backupTo("hierarquia");
    const f = path.join(dir, "categories.jsonl");
    const all = (await readFile(f, "utf8")).split("\n").filter(Boolean);
    const lines = [...all.filter((l) => l.includes('"Filha"')), ...all.filter((l) => !l.includes('"Filha"'))]; // filha primeiro
    expect(lines[0]).toContain('"Filha"');
    await writeFile(f, lines.join("\n") + "\n");
    // o manifesto precisa acompanhar o arquivo reordenado
    const m = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
    const { createHash } = await import("node:crypto");
    m.tabelas.categories.sha256 = createHash("sha256").update(await readFile(f, "utf8")).digest("hex");
    await writeFile(path.join(dir, "manifest.json"), JSON.stringify(m));
    await client.query(`TRUNCATE ${allTables().map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
    await restoreBackup(client, dir);
    expect((await client.query("SELECT count(*)::int AS n FROM categories")).rows[0].n).toBe(2);
  });

  it("ordem de inserção conhecida vem primeiro", () => {
    expect(orderedTables(["orders", "zzz", "users", "aaa"])).toEqual(["users", "orders", "aaa", "zzz"]);
  });
});

describe("ordem de restauração", () => {
  it("toda tabela vem depois das tabelas que ela referencia (inclui cupons e histórico de preços)", async () => {
    const tables = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
    const names = (tables.rows as Array<{ tablename: string }>).map((r) => r.tablename).filter((n) => !(BACKUP_EXCLUDED as readonly string[]).includes(n));
    const fks = await db.execute(sql`
      SELECT cl.relname AS child, pl.relname AS parent FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_class pl ON pl.oid = c.confrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace WHERE c.contype = 'f' AND n.nspname = 'public' AND cl.oid <> pl.oid`);
    const order = orderedTables(names);
    expect(names).toContain("coupon_redemptions");
    const wrong = (fks.rows as Array<{ child: string; parent: string }>).filter(
      (f) => names.includes(f.child) && names.includes(f.parent) && order.indexOf(f.parent) > order.indexOf(f.child),
    );
    expect(wrong).toEqual([]);
  });
});

