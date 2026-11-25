/**
 * Backup, verificação e restauração do banco em arquivos legíveis (uma linha JSON por registro).
 *
 * - Exportação: uma única transação SOMENTE LEITURA com foto consistente (REPEATABLE READ); nada é alterado no banco.
 * - Cada tabela vira `<tabela>.jsonl`; o `manifest.json` guarda contagens e SHA-256 de cada arquivo.
 * - Fora do backup: `sessions` (logins ativos) e `password_reset_tokens` (links de redefinição de senha).
 * - ATENÇÃO: o backup contém dados pessoais de clientes e os hashes de senha. Guarde fora do projeto e fora de pastas públicas.
 * - Restauração: só em banco migrado e VAZIO (nunca sobrescreve dados), tudo numa transação.
 */
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Client } from "pg";
import { expectedSchema } from "./db-report";
import { type DbTarget, readJournal } from "./db-target";

export const BACKUP_EXCLUDED = ["sessions", "password_reset_tokens"] as const;
const PREFERRED_ORDER = [
  "users",
  "categories",
  "products",
  "price_history",
  "product_images",
  "addresses",
  "carts",
  "cart_items",
  "orders",
  "order_items",
  "payments",
  "coupons",
  "coupon_redemptions",
  "webhook_events",
  "stock_movements",
  "settings",
  "stored_files",
  "event_templates",
  "events",
];

export interface TableEntry {
  linhas: number;
  bytes: number;
  sha256: string;
}
export interface Manifest {
  versao: 1;
  criadoEm: string;
  destino: string;
  migracoes: Array<{ tag: string; when: number }>;
  fotosIncluidas: boolean;
  excluidas: string[];
  tabelas: Record<string, TableEntry>;
}

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Ordem de inserção que respeita as chaves estrangeiras (o resto é resolvido por novas tentativas). */
export function orderedTables(names: string[]): string[] {
  const known = PREFERRED_ORDER.filter((n) => names.includes(n));
  return [...known, ...names.filter((n) => !PREFERRED_ORDER.includes(n)).sort()];
}

export async function createBackup(
  client: Client,
  opts: { dir: string; target: DbTarget; drizzleDir: string; includePhotos?: boolean },
): Promise<Manifest> {
  const includePhotos = opts.includePhotos !== false;
  const excluded = [...BACKUP_EXCLUDED, ...(includePhotos ? [] : ["stored_files"])];
  const tables = orderedTables([...expectedSchema().keys()].filter((t) => !excluded.includes(t)));

  await mkdir(opts.dir, { recursive: true });
  if ((await readdir(opts.dir)).length > 0) throw new Error("A pasta do backup já tem arquivos: use uma pasta nova.");

  const manifest: Manifest = {
    versao: 1,
    criadoEm: new Date().toISOString(),
    destino: opts.target.label,
    migracoes: readJournal(opts.drizzleDir).map((e) => ({ tag: e.tag, when: e.when })),
    fotosIncluidas: includePhotos,
    excluidas: excluded,
    tabelas: {},
  };

  await client.query("BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ");
  try {
    for (const table of tables) {
      const file = path.join(opts.dir, `${table}.jsonl`);
      await writeFile(file, "");
      const hash = createHash("sha256");
      let linhas = 0;
      let bytes = 0;
      await client.query(`DECLARE bk NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS j FROM ${q(table)} t`);
      for (;;) {
        const res = await client.query<{ j: string }>("FETCH 200 FROM bk");
        if (res.rows.length === 0) break;
        const chunk = res.rows.map((r) => `${r.j}\n`).join("");
        hash.update(chunk);
        bytes += Buffer.byteLength(chunk);
        linhas += res.rows.length;
        await appendFile(file, chunk);
      }
      await client.query("CLOSE bk");
      manifest.tabelas[table] = { linhas, bytes, sha256: hash.digest("hex") };
    }
  } finally {
    await client.query("ROLLBACK").catch(() => {});
  }
  await writeFile(path.join(opts.dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(
    path.join(opts.dir, "LEIA-ME.txt"),
    "Backup da loja RT Multicolecionismo (um arquivo .jsonl por tabela + manifest.json com contagens e SHA-256).\n" +
      "Contém dados pessoais de clientes e hashes de senha: guarde fora do projeto e não envie a ninguém.\n" +
      "Conferir:  npm.cmd run backup:verify -- --pasta=<esta pasta>\n" +
      "Restaurar (só em banco migrado e vazio):  npm.cmd run backup:restore -- --pasta=<esta pasta>\n",
  );
  return manifest;
}

export interface VerifyResult {
  ok: boolean;
  erros: string[];
  avisos: string[];
  manifest: Manifest | null;
}

export async function verifyBackup(dir: string, opts: { drizzleDir?: string } = {}): Promise<VerifyResult> {
  const erros: string[] = [];
  const avisos: string[] = [];
  let manifest: Manifest | null = null;
  try {
    manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")) as Manifest;
  } catch {
    return { ok: false, erros: ["manifest.json ausente ou ilegível"], avisos, manifest: null };
  }
  if (manifest.versao !== 1) erros.push(`versão de backup desconhecida: ${String(manifest.versao)}`);

  for (const [table, entry] of Object.entries(manifest.tabelas ?? {})) {
    const file = path.join(dir, `${table}.jsonl`);
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch {
      erros.push(`${table}: arquivo ausente`);
      continue;
    }
    if (createHash("sha256").update(text).digest("hex") !== entry.sha256) erros.push(`${table}: o conteúdo mudou desde o backup (SHA-256 diferente)`);
    const lines = text.split("\n").filter((l) => l.length > 0);
    if (lines.length !== entry.linhas) erros.push(`${table}: ${lines.length} registros no arquivo, ${entry.linhas} no manifesto`);
    let bad = 0;
    for (const l of lines) {
      try {
        const v = JSON.parse(l);
        if (v === null || typeof v !== "object" || Array.isArray(v)) bad++;
      } catch {
        bad++;
      }
    }
    if (bad > 0) erros.push(`${table}: ${bad} linha(s) que não são um registro JSON válido`);
  }

  const expected = [...expectedSchema().keys()];
  for (const t of expected) {
    if (!(t in manifest.tabelas) && !manifest.excluidas.includes(t)) erros.push(`${t}: tabela esperada não está no backup`);
  }
  for (const t of Object.keys(manifest.tabelas)) {
    if (!expected.includes(t)) avisos.push(`${t}: tabela que este código não conhece`);
  }
  if (!manifest.fotosIncluidas) avisos.push("backup sem as fotos guardadas no banco (stored_files)");
  if (opts.drizzleDir) {
    const now = readJournal(opts.drizzleDir).length;
    if (manifest.migracoes.length !== now) avisos.push(`backup feito com ${manifest.migracoes.length} migrações; este código tem ${now}`);
  }
  return { ok: erros.length === 0, erros, avisos, manifest };
}

export interface RestoreResult {
  tabelas: Record<string, number>;
}

/** Restaura num banco já migrado e VAZIO, em uma transação (se algo falhar, nada fica gravado). */
export async function restoreBackup(client: Client, dir: string, opts: { drizzleDir?: string } = {}): Promise<RestoreResult> {
  const check = await verifyBackup(dir, opts);
  if (!check.ok || !check.manifest) throw new Error(`Backup inválido: ${check.erros.join("; ")}`);
  const manifest = check.manifest;
  const tables = orderedTables(Object.keys(manifest.tabelas));

  await client.query("BEGIN");
  try {
    for (const t of tables) {
      const exists = await client.query("SELECT to_regclass($1) IS NOT NULL AS ok", [`public.${q(t)}`]);
      if (!exists.rows[0].ok) throw new Error(`O banco de destino não tem a tabela ${t} (aplique as migrações antes).`);
      const n = await client.query(`SELECT count(*)::int AS n FROM ${q(t)}`);
      if (n.rows[0].n > 0) throw new Error(`A tabela ${t} do destino não está vazia: a restauração só roda em banco vazio.`);
    }

    // O gatilho de histórico de preços gravaria linhas duplicadas durante a restauração (o histórico vem do próprio backup).
    const hasPriceTrigger = tables.includes("products") && tables.includes("price_history");
    if (hasPriceTrigger) await client.query('ALTER TABLE "products" DISABLE TRIGGER "products_price_history"');

    const restored: Record<string, number> = {};
    for (const t of tables) {
      const lines = (await readFile(path.join(dir, `${t}.jsonl`), "utf8")).split("\n").filter((l) => l.length > 0);
      let pending = lines;
      while (pending.length > 0) {
        const retry: string[] = [];
        for (const line of pending) {
          await client.query("SAVEPOINT r");
          try {
            await client.query(`INSERT INTO ${q(t)} OVERRIDING SYSTEM VALUE SELECT * FROM json_populate_record(NULL::${q(t)}, $1::json)`, [line]);
            await client.query("RELEASE SAVEPOINT r");
          } catch (error) {
            await client.query("ROLLBACK TO SAVEPOINT r");
            if ((error as { code?: string }).code === "23503") retry.push(line); // depende de outro registro ainda não inserido
            else throw new Error(`${t}: não consegui inserir um registro (${(error as { code?: string }).code ?? "erro"}: ${(error as Error).message.split("\n")[0]})`);
          }
        }
        if (retry.length === pending.length) throw new Error(`${t}: ${retry.length} registro(s) apontam para dados que não existem no backup`);
        pending = retry;
      }
      restored[t] = lines.length;
    }

    if (hasPriceTrigger) await client.query('ALTER TABLE "products" ENABLE TRIGGER "products_price_history"');

    // Contadores de identidade (número do pedido) continuam depois do maior valor restaurado.
    const ids = await client.query<{ table_name: string; column_name: string }>(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND is_identity = 'YES'",
    );
    for (const { table_name, column_name } of ids.rows) {
      if (!tables.includes(table_name)) continue;
      await client.query(
        `SELECT setval(pg_get_serial_sequence($1, $2), m.v) FROM (SELECT max(${q(column_name)}) AS v FROM ${q(table_name)}) m WHERE m.v IS NOT NULL`,
        [`public.${q(table_name)}`, column_name],
      );
    }

    for (const t of tables) {
      const n = await client.query(`SELECT count(*)::int AS n FROM ${q(t)}`);
      if (n.rows[0].n !== manifest.tabelas[t].linhas) throw new Error(`${t}: ${n.rows[0].n} registros restaurados, esperado ${manifest.tabelas[t].linhas}`);
    }
    await client.query("COMMIT");
    return { tabelas: restored };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

/** Tamanho total dos arquivos do backup (para mostrar na tela). */
export async function backupSize(dir: string): Promise<number> {
  let total = 0;
  for (const f of await readdir(dir)) total += (await stat(path.join(dir, f))).size;
  return total;
}
