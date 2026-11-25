import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { collectDbReport, expectedSchema, formatReport, makeReadOnlyQuery } from "../scripts/lib/db-report";
import { describeDatabaseUrl } from "../scripts/lib/db-target";
import { createAdmin, createTestProduct, db, resetDb } from "./helpers";
import { sql } from "drizzle-orm";

const URL_TEST = process.env.DATABASE_URL as string;
const DRIZZLE = path.resolve(process.cwd(), "drizzle");
let client: Client;

async function report() {
  const r = await collectDbReport(client, { target: describeDatabaseUrl(URL_TEST), drizzleDir: DRIZZLE });
  return { r, text: formatReport(r), lines: r.sections.flatMap((s) => s.lines) };
}

beforeAll(async () => {
  client = new Client({ connectionString: URL_TEST });
  await client.connect();
});
afterAll(async () => {
  await client.end();
});
beforeEach(async () => {
  await resetDb();
});

describe("db:check (somente leitura)", () => {
  it("banco de teste recém-migrado: sem erros, migrações e esquema conferem", async () => {
    await createAdmin();
    const { r, text } = await report();
    expect(r.erros).toBe(0);
    expect(text).toContain("8 de 8 migrações do código aplicadas");
    expect(text).toContain(`${expectedSchema().size} tabelas`);
    expect(text).toContain("SOMENTE LEITURA");
  });

  it("recusa qualquer coisa que não seja SELECT e o banco recusa escrita", async () => {
    await client.query("BEGIN READ ONLY");
    try {
      const q = makeReadOnlyQuery(client);
      await expect(q("DELETE FROM users")).rejects.toThrow(/SELECT/);
      await expect(q("SELECT 1; DROP TABLE users")).rejects.toThrow(/SELECT/);
      // se alguém contornasse a checagem de texto, o PostgreSQL ainda bloqueia
      await expect(client.query("SAVEPOINT w; CREATE TABLE x_escrita(a int)")).rejects.toMatchObject({ code: "25006" });
    } finally {
      await client.query("ROLLBACK");
    }
    const exists = await client.query("SELECT to_regclass('public.x_escrita') AS t");
    expect(exists.rows[0].t).toBeNull();
  });

  it("não altera dados: contagens iguais antes e depois", async () => {
    await createAdmin();
    await createTestProduct();
    const count = async () =>
      (await client.query("SELECT (SELECT count(*) FROM users)::int AS u, (SELECT count(*) FROM products)::int AS p, (SELECT count(*) FROM settings)::int AS s")).rows[0];
    const before = await count();
    await report();
    expect(await count()).toEqual(before);
  });

  it("mascara o e-mail do administrador e alerta o admin padrão do seed", async () => {
    await db.execute(sql`INSERT INTO users (email, password_hash, name, role, active) VALUES ('admin@loja.local', 'x', 'Seed', 'ADMIN', true), ('dono.da.loja@gmail.com', 'x', 'Dono', 'ADMIN', true)`);
    const { r, text, lines } = await report();
    expect(text).toContain("a***@loja.local");
    expect(text).toContain("d***@gmail.com");
    expect(text).not.toContain("dono.da.loja");
    expect(lines.some((l) => l.level === "erro" && l.text.includes("administrador padrão do seed"))).toBe(true);
    expect(r.erros).toBeGreaterThan(0);
  });

  it("sem administrador é erro", async () => {
    const { lines } = await report();
    expect(lines.some((l) => l.level === "erro" && l.text.includes("nenhum administrador"))).toBe(true);
  });

  it("avisa produto de demonstração publicado e sem foto", async () => {
    await createTestProduct({ sku: "DEMO-001", active: true });
    const { lines } = await report();
    const texts = lines.filter((l) => l.level === "aviso").map((l) => l.text).join("\n");
    expect(texts).toMatch(/demonstração: 1 \(1 publicados\)/);
    expect(texts).toMatch(/sem foto/);
  });

  it("detecta pedido não pago vencido segurando estoque", async () => {
    await db.execute(sql`INSERT INTO orders (status, subtotal_cents, total_cents, shipping_method_code, shipping_method_label, customer_name, customer_email, expires_at)
      VALUES ('PENDENTE', 1000, 1000, 'fixed', 'Fixo', 'Cliente', 'c@x.com', now() - interval '2 hours')`);
    const { lines } = await report();
    expect(lines.some((l) => l.level === "aviso" && l.text.includes("1 pedido(s) não pago(s) com prazo vencido"))).toBe(true);
    await db.execute(sql`UPDATE orders SET expires_at = now() - interval '8 hours'`);
    expect((await report()).lines.some((l) => l.level === "erro" && l.text.includes("pedido(s) não pago(s) com prazo vencido"))).toBe(true);
  });

  it("detecta migração pendente e coluna ausente (código novo, banco velho)", async () => {
    await createAdmin();
    const last = (await client.query("SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1")).rows[0];
    await client.query("DELETE FROM drizzle.__drizzle_migrations WHERE created_at = $1", [last.created_at]);
    await client.query("ALTER TABLE products RENAME COLUMN brand TO brand_x");
    try {
      const { r, text } = await report();
      expect(text).toContain("7 de 8 migrações do código aplicadas");
      expect(text).toContain("pendente: 0007_cupons_de_desconto");
      expect(text).toContain("products.brand");
      expect(r.erros).toBeGreaterThanOrEqual(2);
    } finally {
      await client.query("ALTER TABLE products RENAME COLUMN brand_x TO brand");
      await client.query("INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)", [last.hash, last.created_at]);
    }
    expect((await report()).r.erros).toBe(0);
  });

  it("o relatório não vaza senha nem URL", async () => {
    const { text } = await report();
    expect(text).not.toContain("loja_dev_pw");
    expect(text).not.toContain("postgres://");
  });
});
