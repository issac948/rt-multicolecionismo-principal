/**
 * Aplica as migrations SQL da pasta /drizzle no banco indicado por DATABASE_URL.
 * É seguro rodar várias vezes: só aplica o que ainda não foi aplicado.
 *
 * Uso:
 *   npm run db:migrate                                  banco LOCAL: aplica o que falta (como sempre foi)
 *   npm run db:migrate -- --simular                     só mostra o destino e o que seria aplicado; não altera nada
 *   npm run db:migrate -- --confirmar=<nome do banco>   banco REMOTO (Neon...): só aplica com esta confirmação explícita
 *
 * Em banco remoto, faça o backup antes (veja DEPLOYMENT.md) e confira o destino mostrado na tela.
 */
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import {
  changedMigrations,
  describeDatabaseUrl,
  parseMigrateArgs,
  pendingMigrations,
  planMigration,
  readAppliedMigrations,
  readJournal,
  redact,
} from "./lib/db-target";

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  const target = describeDatabaseUrl(url);
  if (!target.ok) {
    console.error(`${target.error} Configure o arquivo .env primeiro.`);
    return 1;
  }
  const args = parseMigrateArgs(process.argv.slice(2));
  const drizzleDir = path.resolve(process.cwd(), "drizzle");

  console.log(`Destino: ${target.label} · ${target.isLocal ? "LOCAL" : "REMOTO"} · usuário ${target.userMasked}`);

  const pool = new Pool({ connectionString: url, max: 1 });
  pool.on("error", () => {});
  try {
    const journal = readJournal(drizzleDir);
    const { applied } = await readAppliedMigrations(pool);
    const pending = pendingMigrations(journal, applied);
    console.log(`Migrações no código: ${journal.length} · aplicadas no banco: ${journal.length - pending.length} · pendentes: ${pending.length}`);
    for (const p of pending) console.log(`  pendente: ${p.tag}`);
    for (const c of changedMigrations(drizzleDir, journal, applied)) {
      console.log(`  aviso: o arquivo ${c.tag}.sql mudou depois de aplicado (confira se foi só fim de linha)`);
    }

    const plan = planMigration(target, pending, args);
    console.log(plan.message);
    if (plan.action === "recusar") return 1;
    if (plan.action !== "aplicar") return 0;

    await migrate(drizzle(pool), { migrationsFolder: drizzleDir });
    const after = pendingMigrations(journal, (await readAppliedMigrations(pool)).applied);
    if (after.length > 0) {
      console.error(`Ainda pendentes depois de migrar: ${after.map((p) => p.tag).join(", ")}`);
      return 1;
    }
    console.log("Migrations aplicadas com sucesso.");
    return 0;
  } finally {
    await pool.end().catch(() => {});
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    const target = describeDatabaseUrl(process.env.DATABASE_URL);
    const msg = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.error("Falha ao aplicar migrations:", redact(msg, target, process.env.DATABASE_URL));
    process.exitCode = 1;
  });
