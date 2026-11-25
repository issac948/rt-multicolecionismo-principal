/**
 * Funções puras (sem abrir conexão) usadas por `npm run db:migrate` e `npm run db:check`:
 * descrever o banco de destino SEM mostrar segredos, mascarar e-mails, comparar migrações e decidir se uma migração pode rodar.
 *
 * Regra de ouro: nenhuma função daqui devolve a senha nem a URL completa. Mensagens de erro passam por `redact`.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export interface DbTarget {
  ok: boolean;
  /** Motivo quando `ok` é falso (nunca contém a URL). */
  error?: string;
  host: string;
  port: number;
  database: string;
  user: string;
  /** Valor de `sslmode` da URL (ex.: "require"), ou "" se não informado. */
  sslmode: string;
  /** Servidor da própria máquina (localhost, 127.0.0.1, ::1). */
  isLocal: boolean;
  /** Nome do banco termina com "_test". */
  isTestDatabase: boolean;
  /** Servidor mascarado, ex.: "ep-coo…neon.tech". */
  hostMasked: string;
  /** Usuário mascarado, ex.: "n***". */
  userMasked: string;
  /** Texto curto para mostrar na tela: "ep-coo…neon.tech:5432/neondb". Sem senha, sem usuário. */
  label: string;
  /** A senha da URL (nunca imprimir; existe só para `redact`). */
  secret: string;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/** "abcdefghij" → "abc…" (mantém só o começo). */
export function maskStart(value: string, keep = 3): string {
  if (value.length <= keep) return value.length ? `${value[0]}***` : "";
  return `${value.slice(0, keep)}…`;
}

/** Servidor: mantém o começo do 1º trecho e os dois últimos (o provedor). Servidor local não é mascarado. */
export function maskHost(host: string): string {
  const h = host.replace(/^\[|\]$/g, "");
  if (!h) return "";
  if (LOCAL_HOSTS.has(host) || LOCAL_HOSTS.has(h)) return h;
  const parts = h.split(".");
  if (parts.length < 3) return maskStart(h, 3);
  return `${parts[0].slice(0, 6)}…${parts.slice(-2).join(".")}`;
}

export function maskUser(user: string): string {
  return user ? `${user[0]}***` : "";
}

/** "isaac@gmail.com" → "i***@gmail.com". O domínio fica visível para reconhecer contas de teste (ex.: "@loja.local"). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return maskStart(email, 1);
  return `${email[0]}***${email.slice(at)}`;
}

export function describeDatabaseUrl(raw: string | undefined | null): DbTarget {
  const empty: DbTarget = {
    ok: false,
    host: "",
    port: 0,
    database: "",
    user: "",
    sslmode: "",
    isLocal: false,
    isTestDatabase: false,
    hostMasked: "",
    userMasked: "",
    label: "",
    secret: "",
  };
  const text = (raw ?? "").trim();
  if (!text) return { ...empty, error: "DATABASE_URL não está definida." };

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    // Não repetir o texto: pode conter a senha.
    return { ...empty, error: "DATABASE_URL não é uma URL válida (esperado: postgres://usuario:senha@servidor/banco)." };
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return { ...empty, error: "DATABASE_URL deve começar com postgres:// ou postgresql://." };
  }

  const host = decodeURIComponent(url.hostname);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const port = url.port ? Number(url.port) : 5432;
  const user = decodeURIComponent(url.username);
  const hostMasked = maskHost(host);
  if (!host) return { ...empty, error: "DATABASE_URL sem servidor (host)." };
  if (!database) return { ...empty, error: "DATABASE_URL sem nome do banco (depois da barra final)." };

  return {
    ok: true,
    host,
    port,
    database,
    user,
    sslmode: url.searchParams.get("sslmode") ?? "",
    isLocal: LOCAL_HOSTS.has(host) || LOCAL_HOSTS.has(`[${host}]`),
    isTestDatabase: database.endsWith("_test"),
    hostMasked,
    userMasked: maskUser(user),
    label: `${hostMasked}:${port}/${database}`,
    secret: decodeURIComponent(url.password),
  };
}

/** Tira de um texto qualquer a senha, o usuário e a URL completa (para mensagens de erro de conexão). */
export function redact(text: string, target?: Pick<DbTarget, "secret" | "user"> & Partial<Pick<DbTarget, "host" | "hostMasked">>, rawUrl?: string): string {
  let out = text;
  if (rawUrl) out = out.split(rawUrl).join("[URL]");
  if (target?.secret) out = out.split(target.secret).join("***");
  if (target?.host && target.hostMasked && target.host !== target.hostMasked) out = out.split(target.host).join(target.hostMasked);
  if (target?.user && target.user.length >= 3) out = out.split(target.user).join(maskUser(target.user));
  // Qualquer "postgres://...@" que sobrar.
  return out.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[URL]");
}

/* ------------------------------------------------------------------ */
/* Migrações                                                           */
/* ------------------------------------------------------------------ */

export interface JournalEntry {
  idx: number;
  tag: string;
  /** Carimbo de tempo da migração (é com ele que o Drizzle decide o que falta aplicar). */
  when: number;
}

export interface AppliedMigration {
  /** `created_at` gravado em `drizzle.__drizzle_migrations` (= `when` da migração aplicada). */
  createdAt: number;
  hash: string;
}

export function readJournal(drizzleDir: string): JournalEntry[] {
  const file = path.join(drizzleDir, "meta", "_journal.json");
  const json = JSON.parse(readFileSync(file, "utf8")) as { entries?: JournalEntry[] };
  return (json.entries ?? []).map((e) => ({ idx: e.idx, tag: e.tag, when: Number(e.when) }));
}

/**
 * Mesma regra do Drizzle (migrador do PostgreSQL): aplica as migrações cujo carimbo é MAIOR que o da última aplicada.
 * Sem nenhuma aplicada (banco vazio ou sem a tabela de controle), todas estão pendentes.
 */
export function pendingMigrations(journal: JournalEntry[], applied: AppliedMigration[]): JournalEntry[] {
  const last = applied.reduce((max, m) => Math.max(max, m.createdAt), -Infinity);
  return journal.filter((e) => e.when > last);
}

/** Qualquer coisa com `query(texto)`: `pg.Pool`, `pg.Client` ou um adaptador. */
export interface Queryable {
  query(text: string): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** Lê `drizzle.__drizzle_migrations` (somente leitura). Banco sem essa tabela = nenhuma migração aplicada. */
export async function readAppliedMigrations(db: Queryable): Promise<{ controlTable: boolean; applied: AppliedMigration[] }> {
  const exists = await db.query("SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS ok");
  if (!exists.rows[0]?.ok) return { controlTable: false, applied: [] };
  const res = await db.query("SELECT hash, created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY created_at");
  return {
    controlTable: true,
    applied: res.rows.map((r) => ({ createdAt: Number(r.created_at), hash: String(r.hash) })),
  };
}

/** SHA-256 do arquivo da migração, como o Drizzle grava; testa também o texto com fim de linha trocado (Windows x Linux). */
export function migrationHashes(drizzleDir: string, tag: string): string[] {
  const text = readFileSync(path.join(drizzleDir, `${tag}.sql`), "utf8");
  const variants = new Set([text, text.replace(/\r\n/g, "\n"), text.replace(/\r?\n/g, "\r\n")]);
  return [...variants].map((v) => createHash("sha256").update(v).digest("hex"));
}

/** Migrações aplicadas cujo arquivo hoje tem conteúdo diferente do que foi aplicado (arquivo editado depois). */
export function changedMigrations(drizzleDir: string, journal: JournalEntry[], applied: AppliedMigration[]): JournalEntry[] {
  const byTime = new Map(applied.map((a) => [a.createdAt, a.hash]));
  return journal.filter((e) => {
    const dbHash = byTime.get(e.when);
    if (!dbHash) return false;
    try {
      return !migrationHashes(drizzleDir, e.tag).includes(dbHash);
    } catch {
      return false; // arquivo ausente: o `check:repo` e o erro de migração tratam disso
    }
  });
}

/* ------------------------------------------------------------------ */
/* Decisão da migração                                                 */
/* ------------------------------------------------------------------ */

export interface MigrateArgs {
  simular: boolean;
  /** Valor de --confirmar=<nome do banco>, ou null. */
  confirmar: string | null;
}

export function parseMigrateArgs(argv: string[]): MigrateArgs {
  let simular = false;
  let confirmar: string | null = null;
  for (const arg of argv) {
    if (arg === "--simular") simular = true;
    else if (arg.startsWith("--confirmar=")) confirmar = arg.slice("--confirmar=".length).trim();
  }
  return { simular, confirmar };
}

export type MigratePlan =
  | { action: "nada"; message: string }
  | { action: "simular"; message: string }
  | { action: "aplicar"; message: string }
  | { action: "recusar"; message: string };

/**
 * - sem migração pendente: nada a fazer (qualquer destino);
 * - `--simular`: só mostra;
 * - banco da própria máquina: aplica (como sempre foi);
 * - banco REMOTO (Neon, por exemplo): só aplica com `--confirmar=<nome do banco>` igual ao nome do banco do destino.
 */
export function planMigration(target: DbTarget, pending: JournalEntry[], args: MigrateArgs): MigratePlan {
  if (!target.ok) return { action: "recusar", message: target.error ?? "Destino inválido." };
  if (pending.length === 0) return { action: "nada", message: "Nenhuma migração pendente: nada a aplicar." };
  if (args.simular) return { action: "simular", message: "Simulação: nada foi alterado." };
  if (target.isLocal) return { action: "aplicar", message: "Banco local: aplicando." };

  if (args.confirmar === null) {
    return {
      action: "recusar",
      message:
        `Destino REMOTO (${target.label}). Por segurança, nada foi aplicado.\n` +
        `Se este é mesmo o banco certo e o backup já foi feito, confirme digitando o nome do banco:\n` +
        `  npm.cmd run db:migrate -- --confirmar=${target.database}`,
    };
  }
  if (args.confirmar !== target.database) {
    return {
      action: "recusar",
      message: `O nome informado em --confirmar não é o do banco de destino (${target.database}). Nada foi aplicado.`,
    };
  }
  return { action: "aplicar", message: "Destino remoto confirmado: aplicando." };
}
