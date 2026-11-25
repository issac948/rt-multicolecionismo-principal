import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  changedMigrations,
  describeDatabaseUrl,
  maskEmail,
  maskHost,
  migrationHashes,
  parseMigrateArgs,
  pendingMigrations,
  planMigration,
  readJournal,
  redact,
} from "../scripts/lib/db-target";

const DRIZZLE = path.resolve(process.cwd(), "drizzle");
const NEON = "postgresql://neondb_owner:Falsa%40Senha9@ep-cool-darkness-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require";

describe("destino do banco (sem expor segredos)", () => {
  it("descreve um banco remoto com host e usuário mascarados e sem senha", () => {
    const t = describeDatabaseUrl(NEON);
    expect(t.ok).toBe(true);
    expect(t.isLocal).toBe(false);
    expect(t.database).toBe("neondb");
    expect(t.port).toBe(5432);
    expect(t.sslmode).toBe("require");
    expect(t.label).toBe("ep-coo…neon.tech:5432/neondb");
    expect(t.userMasked).toBe("n***");
    expect(t.secret).toBe("Falsa@Senha9");
    const shown = JSON.stringify({ label: t.label, userMasked: t.userMasked, hostMasked: t.hostMasked });
    expect(shown).not.toContain("Falsa@Senha9");
    expect(shown).not.toContain("cool-darkness");
  });

  it("reconhece banco local e banco de teste", () => {
    const t = describeDatabaseUrl("postgres://loja:x@localhost:5432/loja_test");
    expect(t.isLocal).toBe(true);
    expect(t.isTestDatabase).toBe(true);
    expect(describeDatabaseUrl("postgres://a:b@127.0.0.1/loja").isLocal).toBe(true);
    expect(describeDatabaseUrl("postgres://a:b@[::1]:5433/loja").isLocal).toBe(true);
    expect(describeDatabaseUrl("postgres://a:b@db.interno.com/loja").isLocal).toBe(false);
  });

  it("recusa URL ausente ou inválida sem repetir o texto recebido", () => {
    expect(describeDatabaseUrl(undefined).ok).toBe(false);
    expect(describeDatabaseUrl("   ").ok).toBe(false);
    const bad = describeDatabaseUrl("isto-nao-e-url-senha123");
    expect(bad.ok).toBe(false);
    expect(bad.error).not.toContain("senha123");
    expect(describeDatabaseUrl("mysql://a:b@h/db").ok).toBe(false);
    expect(describeDatabaseUrl("postgres://a:b@h").ok).toBe(false);
  });

  it("mascara e-mail e host", () => {
    expect(maskEmail("isaac@gmail.com")).toBe("i***@gmail.com");
    expect(maskEmail("admin@loja.local")).toBe("a***@loja.local");
    expect(maskHost("localhost")).toBe("localhost");
    expect(maskHost("ep-cool-darkness-123456.us-east-2.aws.neon.tech")).toBe("ep-coo…neon.tech");
  });

  it("redact tira senha, usuário, host e URL de mensagens de erro", () => {
    const t = describeDatabaseUrl(NEON);
    const msg = `password authentication failed for user "neondb_owner" (Falsa@Senha9) em ${t.host} via ${NEON}`;
    const out = redact(msg, t, NEON);
    expect(out).not.toContain("Falsa@Senha9");
    expect(out).not.toContain("neondb_owner");
    expect(out).not.toContain("cool-darkness");
    expect(out).not.toContain("postgresql://");
  });
});

describe("migrações pendentes", () => {
  const journal = [
    { idx: 0, tag: "0000_a", when: 100 },
    { idx: 1, tag: "0001_b", when: 200 },
    { idx: 2, tag: "0002_c", when: 300 },
  ];

  it("segue a regra do Drizzle: pendente = carimbo maior que o da última aplicada", () => {
    expect(pendingMigrations(journal, []).map((e) => e.tag)).toEqual(["0000_a", "0001_b", "0002_c"]);
    expect(pendingMigrations(journal, [{ createdAt: 200, hash: "x" }]).map((e) => e.tag)).toEqual(["0002_c"]);
    expect(pendingMigrations(journal, [{ createdAt: 300, hash: "x" }])).toEqual([]);
  });

  it("lê o diário real e confere o hash do arquivo (com fim de linha trocado também)", () => {
    const real = readJournal(DRIZZLE);
    expect(real.length).toBeGreaterThanOrEqual(6);
    expect(real.map((e) => e.when)).toEqual([...real.map((e) => e.when)].sort((a, b) => a - b));
    const first = real[0];
    const text = readFileSync(path.join(DRIZZLE, `${first.tag}.sql`), "utf8");
    const hash = createHash("sha256").update(text).digest("hex");
    expect(migrationHashes(DRIZZLE, first.tag)).toContain(hash);
    expect(changedMigrations(DRIZZLE, real, [{ createdAt: first.when, hash }])).toEqual([]);
    const crlf = createHash("sha256").update(text.replace(/\r?\n/g, "\r\n")).digest("hex");
    expect(changedMigrations(DRIZZLE, real, [{ createdAt: first.when, hash: crlf }])).toEqual([]);
    expect(changedMigrations(DRIZZLE, real, [{ createdAt: first.when, hash: "outro" }]).map((e) => e.tag)).toEqual([first.tag]);
  });
});

describe("trava do db:migrate", () => {
  const remote = describeDatabaseUrl(NEON);
  const local = describeDatabaseUrl("postgres://loja:x@localhost:5432/loja");
  const pending = [{ idx: 5, tag: "0005_x", when: 1 }];
  const args = (...a: string[]) => parseMigrateArgs(a);

  it("lê os argumentos", () => {
    expect(args()).toEqual({ simular: false, confirmar: null });
    expect(args("--simular")).toEqual({ simular: true, confirmar: null });
    expect(args("--confirmar=neondb")).toEqual({ simular: false, confirmar: "neondb" });
  });

  it("sem pendência não há o que fazer, em qualquer destino", () => {
    expect(planMigration(remote, [], args()).action).toBe("nada");
  });

  it("--simular nunca aplica", () => {
    expect(planMigration(local, pending, args("--simular")).action).toBe("simular");
    expect(planMigration(remote, pending, args("--simular", "--confirmar=neondb")).action).toBe("simular");
  });

  it("banco local aplica como sempre", () => {
    expect(planMigration(local, pending, args()).action).toBe("aplicar");
  });

  it("banco remoto exige confirmação com o nome certo do banco", () => {
    const sem = planMigration(remote, pending, args());
    expect(sem.action).toBe("recusar");
    expect(sem.message).toContain("--confirmar=neondb");
    expect(sem.message).not.toContain("Falsa@Senha9");
    expect(planMigration(remote, pending, args("--confirmar=outro")).action).toBe("recusar");
    expect(planMigration(remote, pending, args("--confirmar=neondb")).action).toBe("aplicar");
  });

  it("destino inválido é recusado", () => {
    expect(planMigration(describeDatabaseUrl(""), pending, args()).action).toBe("recusar");
  });
});
