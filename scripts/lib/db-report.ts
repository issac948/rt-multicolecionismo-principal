/**
 * Conferência SOMENTE LEITURA do banco (usada por `npm run db:check`).
 *
 * - Tudo roda dentro de `BEGIN READ ONLY`: o próprio PostgreSQL recusa qualquer escrita.
 * - Só aceita consultas SELECT/WITH sem ponto e vírgula (defesa extra).
 * - Nada sensível sai no relatório: e-mails de administradores são mascarados, não há dados de clientes, senhas, tokens nem URL.
 */
import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import type { Client } from "pg";
import * as schema from "../../src/server/db/schema";
import {
  type DbTarget,
  changedMigrations,
  maskEmail,
  pendingMigrations,
  readAppliedMigrations,
  readJournal,
  redact,
} from "./db-target";

export type Level = "ok" | "info" | "aviso" | "erro";
export interface Line {
  level: Level;
  text: string;
}
export interface Section {
  title: string;
  lines: Line[];
}
export interface DbReport {
  generatedAt: string;
  target: { label: string; isLocal: boolean; isTestDatabase: boolean; sslmode: string; userMasked: string };
  sections: Section[];
  erros: number;
  avisos: number;
}

type Row = Record<string, unknown>;
export type Query = (sql: string) => Promise<Row[]>;

const READ_ONLY_SQL = /^\s*(select|with)\b/i;

/** Consulta única e somente leitura, dentro de um SAVEPOINT (um erro numa consulta não derruba as seguintes). */
export function makeReadOnlyQuery(client: Pick<Client, "query">): Query {
  return async (sql) => {
    if (!READ_ONLY_SQL.test(sql) || sql.includes(";")) throw new Error("db-check só aceita uma consulta SELECT.");
    try {
      const res = (await client.query(`SAVEPOINT chk; ${sql}; RELEASE SAVEPOINT chk`)) as unknown as Array<{ rows: Row[] }>;
      return res[1].rows;
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT chk").catch(() => {});
      throw error;
    }
  };
}

const num = (row: Row | undefined, key: string): number => Number(row?.[key] ?? 0);
const asDate = (v: unknown): Date | null => (v ? (v instanceof Date ? v : new Date(String(v))) : null);
const day = (v: unknown): string => asDate(v)?.toISOString().slice(0, 10) ?? "—";
const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

/** Tabelas e colunas que o código espera (vêm do schema Drizzle, a mesma fonte das migrações). */
export function expectedSchema(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const value of Object.values(schema)) {
    if (is(value, PgTable)) {
      const cfg = getTableConfig(value);
      out.set(cfg.name, cfg.columns.map((c) => c.name));
    }
  }
  return out;
}

const DEMO_SQL = "(sku ILIKE 'DEMO-%' OR short_description ILIKE 'produto de demonstra%')";
// Limites aproximados do plano grátis do Neon: confira o valor atual no painel do Neon.
const SIZE_WARN_BYTES = 700 * 1024 * 1024;
const SIZE_ERROR_BYTES = 950 * 1024 * 1024;

export async function collectDbReport(client: Client, opts: { target: DbTarget; drizzleDir: string }): Promise<DbReport> {
  const { target, drizzleDir } = opts;
  const q = makeReadOnlyQuery(client);
  const sections: Section[] = [];
  await client.query("BEGIN READ ONLY");
  try {
    const colRows = await q("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'");
    const existing = new Map<string, Set<string>>();
    for (const r of colRows) {
      const t = String(r.table_name);
      if (!existing.has(t)) existing.set(t, new Set());
      existing.get(t)!.add(String(r.column_name));
    }
    const has = (...tables: string[]) => tables.every((t) => existing.has(t));

    async function section(title: string, fn: (add: (level: Level, text: string) => void) => Promise<void>) {
      const lines: Line[] = [];
      const add = (level: Level, text: string) => lines.push({ level, text });
      try {
        await fn(add);
      } catch (error) {
        const msg = error instanceof Error ? error.message.split("\n")[0] : String(error);
        add("erro", `não consegui ler esta parte: ${redact(msg, target)}`);
      }
      sections.push({ title, lines });
    }

    await section("Servidor", async (add) => {
      const [s] = await q(
        "SELECT version() AS version, pg_database_size(current_database())::bigint AS size, current_setting('TimeZone') AS tz",
      );
      const version = String(s.version).split(" ").slice(0, 2).join(" ");
      const size = Number(s.size);
      add("info", `${version} · banco com ${mb(size)} · fuso ${String(s.tz)}`);
      if (size >= SIZE_ERROR_BYTES) add("erro", "banco perto do limite de armazenamento do plano grátis do Neon (confira o limite no painel)");
      else if (size >= SIZE_WARN_BYTES) add("aviso", "banco já passou de 700 MB: confira o limite de armazenamento no painel do Neon");
      if (target.isLocal) add("aviso", "o destino é um banco LOCAL desta máquina, não a produção");
      if (target.isTestDatabase) add("info", "banco de testes (nome termina em _test)");
    });

    await section("Migrações", async (add) => {
      const journal = readJournal(drizzleDir);
      const { controlTable, applied } = await readAppliedMigrations({ query: async (t) => ({ rows: await q(t) }) });
      if (!controlTable) add("erro", "o banco não tem controle de migrações (banco vazio ou nunca migrado)");
      const pending = pendingMigrations(journal, applied);
      const known = new Set(journal.map((e) => e.when));
      const unknown = applied.filter((a) => !known.has(a.createdAt)).length;
      add(pending.length === 0 ? "ok" : "erro", `${journal.length - pending.length} de ${journal.length} migrações do código aplicadas`);
      for (const p of pending) add("erro", `pendente: ${p.tag} (aplique com backup: npm.cmd run db:migrate)`);
      for (const c of changedMigrations(drizzleDir, journal, applied)) {
        add("aviso", `o arquivo ${c.tag}.sql mudou depois de aplicado (confira se foi só fim de linha)`);
      }
      if (unknown > 0) add("aviso", `${unknown} migração(ões) do banco não existem neste código (código mais antigo que o banco?)`);
    });

    await section("Esquema (código x banco)", async (add) => {
      const expected = expectedSchema();
      const missingTables: string[] = [];
      const missingColumns: string[] = [];
      let columns = 0;
      for (const [table, cols] of expected) {
        const found = existing.get(table);
        if (!found) {
          missingTables.push(table);
          continue;
        }
        for (const c of cols) {
          columns++;
          if (!found.has(c)) missingColumns.push(`${table}.${c}`);
        }
      }
      if (missingTables.length === 0 && missingColumns.length === 0) {
        add("ok", `${expected.size} tabelas e ${columns} colunas conferem com o código`);
      }
      if (missingTables.length) add("erro", `tabelas ausentes: ${missingTables.join(", ")}`);
      if (missingColumns.length) add("erro", `colunas ausentes: ${missingColumns.join(", ")}`);
    });

    await section("Contas", async (add) => {
      if (!has("users")) return add("aviso", "tabela users ausente: não verificado");
      const roles = await q("SELECT role::text AS role, active, count(*)::int AS n FROM users GROUP BY 1, 2");
      const clientes = roles.filter((r) => r.role !== "ADMIN").reduce((a, r) => a + num(r, "n"), 0);
      add("info", `clientes: ${clientes}`);
      const admins = await q("SELECT email, active, created_at FROM users WHERE role = 'ADMIN' ORDER BY created_at LIMIT 20");
      if (admins.length === 0) add("erro", "nenhum administrador cadastrado (crie com: npm.cmd run admin:create)");
      else add("info", `administradores: ${admins.length}`);
      for (const a of admins) {
        const email = String(a.email);
        const ativo = a.active === true;
        add("info", `  ${maskEmail(email)} · ${ativo ? "ativo" : "inativo"} · criado em ${day(a.created_at)}`);
        if (email.toLowerCase() === "admin@loja.local") {
          add(ativo ? "erro" : "aviso", "existe o administrador padrão do seed (admin@loja.local): troque/remova antes de vender");
        } else if (/@(example\.(com|org)|[^@]*\.(local|test|example))$/i.test(email)) {
          add("aviso", `administrador com e-mail de teste (${maskEmail(email)})`);
        }
      }
    });

    await section("Catálogo", async (add) => {
      if (!has("products")) return add("aviso", "tabela products ausente: não verificado");
      const [p] = await q(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE active)::int AS ativos,
        count(*) FILTER (WHERE active AND stock = 0)::int AS ativos_sem_estoque,
        count(*) FILTER (WHERE active AND ${DEMO_SQL})::int AS demo_publicados,
        count(*) FILTER (WHERE ${DEMO_SQL})::int AS demo,
        count(*) FILTER (WHERE active AND price_cents = 0)::int AS ativos_preco_zero,
        count(*) FILTER (WHERE active AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = products.id))::int AS ativos_sem_foto
        FROM products`);
      add("info", `produtos: ${num(p, "total")} (${num(p, "ativos")} publicados, ${num(p, "ativos_sem_estoque")} deles sem estoque)`);
      if (num(p, "demo") > 0) {
        add(num(p, "demo_publicados") > 0 ? "aviso" : "info", `produtos de demonstração: ${num(p, "demo")} (${num(p, "demo_publicados")} publicados): remova no painel, em Resumo`);
      }
      if (num(p, "ativos_sem_foto") > 0) add("aviso", `${num(p, "ativos_sem_foto")} produto(s) publicado(s) sem foto`);
      if (num(p, "ativos_preco_zero") > 0) add("aviso", `${num(p, "ativos_preco_zero")} produto(s) publicado(s) com preço zero`);
      if (has("categories")) add("info", `categorias: ${num((await q("SELECT count(*)::int AS n FROM categories"))[0], "n")}`);
      if (has("events")) add("info", `eventos cadastrados: ${num((await q("SELECT count(*)::int AS n FROM events"))[0], "n")}`);
    });

    await section("Fotos", async (add) => {
      if (!has("product_images")) return add("aviso", "tabela product_images ausente: não verificado");
      const [img] = await q("SELECT count(*)::int AS n FROM product_images");
      add("info", `fotos de produtos cadastradas: ${num(img, "n")}`);
      if (has("stored_files")) {
        const [f] = await q("SELECT count(*)::int AS n, coalesce(sum(size), 0)::bigint AS bytes FROM stored_files");
        add("info", `arquivos guardados no banco: ${num(f, "n")} (${mb(num(f, "bytes"))})`);
        const [m] = await q(
          "SELECT count(*)::int AS n FROM product_images i WHERE NOT EXISTS (SELECT 1 FROM stored_files f WHERE f.key = i.storage_key)",
        );
        if (num(m, "n") > 0) add("info", `${num(m, "n")} foto(s) de produto não estão no banco (normal se ficam no R2 ou em disco)`);
      }
    });

    await section("Pedidos", async (add) => {
      if (!has("orders")) return add("aviso", "tabela orders ausente: não verificado");
      const byStatus = await q("SELECT status::text AS status, count(*)::int AS n FROM orders GROUP BY 1 ORDER BY 1");
      add("info", byStatus.length ? `por status: ${byStatus.map((r) => `${r.status} ${num(r, "n")}`).join(" · ")}` : "nenhum pedido ainda");
      const [last] = await q("SELECT max(created_at) AS ultimo FROM orders");
      if (last?.ultimo) add("info", `último pedido em ${day(last.ultimo)}`);
      const [o] = await q(`SELECT count(*)::int AS n, min(expires_at) AS mais_antigo,
        extract(epoch FROM (now() - min(expires_at)))::bigint AS segundos
        FROM orders WHERE status IN ('PENDENTE', 'PAGAMENTO_PENDENTE') AND expires_at IS NOT NULL AND expires_at < now()`);
      if (num(o, "n") > 0) {
        const horas = Math.floor(num(o, "segundos") / 3600);
        add(
          horas >= 6 ? "erro" : "aviso",
          `${num(o, "n")} pedido(s) não pago(s) com prazo vencido ainda segurando estoque (o mais antigo há ${horas} h): a manutenção não está rodando?`,
        );
      } else add("ok", "nenhum pedido não pago vencido segurando estoque");
      const [c] = await q("SELECT count(*)::int AS n FROM orders WHERE status = 'CANCELADO' AND stock_released_at IS NULL");
      if (num(c, "n") > 0) add("aviso", `${num(c, "n")} pedido(s) cancelado(s) sem registro de devolução de estoque`);
      const [e] = await q("SELECT count(*)::int AS n FROM orders WHERE status IN ('PENDENTE', 'PAGAMENTO_PENDENTE') AND expires_at IS NULL");
      if (num(e, "n") > 0) add("info", `${num(e, "n")} pedido(s) não pago(s) sem prazo de pagamento (nunca vencem sozinhos)`);
    });

    await section("Pagamentos e avisos dos provedores", async (add) => {
      if (has("payments")) {
        const pays = await q("SELECT provider, status::text AS status, count(*)::int AS n FROM payments GROUP BY 1, 2 ORDER BY 1, 2");
        add("info", pays.length ? `pagamentos: ${pays.map((r) => `${r.provider}/${r.status} ${num(r, "n")}`).join(" · ")}` : "nenhum pagamento registrado");
      }
      if (has("webhook_events")) {
        const hooks = await q(`SELECT provider, count(*)::int AS total, count(*) FILTER (WHERE NOT signature_valid)::int AS invalidos,
          count(*) FILTER (WHERE NOT signature_valid AND created_at > now() - interval '7 days')::int AS invalidos_7d, max(created_at) AS ultimo
          FROM webhook_events GROUP BY provider ORDER BY provider`);
        if (hooks.length === 0) add("info", "nenhum aviso de pagamento (webhook) recebido ainda");
        for (const h of hooks) {
          add("info", `webhook ${h.provider}: ${num(h, "total")} recebido(s), ${num(h, "invalidos")} recusado(s), último em ${day(h.ultimo)}`);
          if (num(h, "invalidos_7d") > 0) add("aviso", `webhook ${h.provider}: ${num(h, "invalidos_7d")} recusado(s) nos últimos 7 dias (assinatura/token errado?)`);
        }
      }
    });

    await section("Carrinhos e sessões", async (add) => {
      if (has("carts", "cart_items")) {
        const [c] = await q("SELECT (SELECT count(*) FROM carts)::int AS carrinhos, (SELECT count(DISTINCT cart_id) FROM cart_items)::int AS com_itens");
        add("info", `carrinhos: ${num(c, "carrinhos")} (${num(c, "com_itens")} com itens)`);
      }
      if (has("sessions")) {
        const [s] = await q("SELECT count(*) FILTER (WHERE expires_at > now())::int AS ativas, count(*) FILTER (WHERE expires_at <= now())::int AS vencidas FROM sessions");
        add("info", `sessões de login: ${num(s, "ativas")} ativas, ${num(s, "vencidas")} vencidas ainda não limpas`);
      }
    });

    await section("Manutenção e configurações", async (add) => {
      if (!has("settings")) return add("aviso", "tabela settings ausente: não verificado");
      const [m] = await q("SELECT value ->> 'lastRunAt' AS ultimo, value ->> 'source' AS origem FROM settings WHERE key = 'maintenance'");
      const last = asDate(m?.ultimo);
      if (!last) add("aviso", "a manutenção ainda não registrou nenhuma execução (agendador da Netlify configurado?)");
      else {
        const horas = Math.floor((Date.now() - last.getTime()) / 3_600_000);
        add(horas >= 3 ? "aviso" : "ok", `última manutenção: ${last.toISOString().slice(0, 16).replace("T", " ")} UTC (origem: ${String(m.origem)}), há ${horas} h`);
      }
      const [s] = await q(`SELECT value #>> '{payment,windowMinutes}' AS janela, value #>> '{shipping,mode}' AS frete,
        value #>> '{shipping,deliveryEnabled}' AS entrega, value #>> '{shipping,pickupEnabled}' AS retirada,
        value #>> '{shipping,freeAboveCents}' AS gratis FROM settings WHERE key = 'store'`);
      if (!s) add("info", "configurações da loja nunca foram salvas (vale o padrão do código)");
      else {
        add("info", `prazo para pagar: ${s.janela ?? "padrão do código"} min · frete: ${s.frete ?? "padrão"} (entrega ${s.entrega ?? "?"}, retirada ${s.retirada ?? "?"}) · frete grátis acima de: ${s.gratis ? `${s.gratis} centavos` : "não definido"}`);
      }
    });

    const all = sections.flatMap((s) => s.lines);
    return {
      generatedAt: new Date().toISOString(),
      target: {
        label: target.label,
        isLocal: target.isLocal,
        isTestDatabase: target.isTestDatabase,
        sslmode: target.sslmode,
        userMasked: target.userMasked,
      },
      sections,
      erros: all.filter((l) => l.level === "erro").length,
      avisos: all.filter((l) => l.level === "aviso").length,
    };
  } finally {
    await client.query("ROLLBACK").catch(() => {});
  }
}

const TAGS: Record<Level, string> = { ok: "[OK]    ", info: "[INFO]  ", aviso: "[AVISO] ", erro: "[ERRO]  " };

export function formatReport(report: DbReport): string {
  const t = report.target;
  const out = [
    "RT Multicolecionismo — conferência do banco (SOMENTE LEITURA)",
    `Gerado em: ${report.generatedAt}`,
    `Destino: ${t.label} · ${t.isLocal ? "LOCAL" : "REMOTO"} · ssl=${t.sslmode || "não informado"} · usuário ${t.userMasked}`,
  ];
  for (const s of report.sections) {
    out.push("", `[${s.title}]`);
    for (const l of s.lines) out.push(`  ${TAGS[l.level]}${l.text}`);
  }
  out.push("", `Resumo: ${report.erros} erro(s) · ${report.avisos} aviso(s)`);
  return out.join("\n");
}
