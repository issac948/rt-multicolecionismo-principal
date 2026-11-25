/**
 * Restaura um backup em um banco JÁ MIGRADO e VAZIO (nunca sobrescreve dados). Tudo numa transação.
 *
 *   npm run backup:restore -- --pasta=<pasta>                       banco local (ensaio: use um banco de teste)
 *   npm run backup:restore -- --pasta=<pasta> --confirmar=<banco>   banco remoto: confirme o nome do banco
 *
 * Ensaio recomendado: crie um banco novo (ex.: loja_restauro_test), rode `npm run db:migrate` nele e restaure.
 */
import path from "node:path";
import { Client } from "pg";
import { restoreBackup } from "./lib/backup";
import { describeDatabaseUrl, redact } from "./lib/db-target";

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main(): Promise<number> {
  const raw = process.env.DATABASE_URL;
  const target = describeDatabaseUrl(raw);
  if (!target.ok) {
    console.error(target.error);
    return 1;
  }
  const pasta = arg("pasta");
  if (!pasta) {
    console.error("Informe a pasta do backup: npm run backup:restore -- --pasta=<pasta>");
    return 1;
  }
  console.log(`Destino: ${target.label} · ${target.isLocal ? "LOCAL" : "REMOTO"} · usuário ${target.userMasked}`);
  if (!target.isLocal && arg("confirmar") !== target.database) {
    console.error(`Destino REMOTO: nada foi feito. Para continuar, confirme o nome do banco: --confirmar=${target.database}`);
    return 1;
  }
  const client = new Client({ connectionString: raw, connectionTimeoutMillis: 20_000 });
  client.on("error", () => {});
  try {
    await client.connect();
    const r = await restoreBackup(client, path.resolve(pasta), { drizzleDir: path.resolve(process.cwd(), "drizzle") });
    for (const [t, n] of Object.entries(r.tabelas)) console.log(`  ${t}: ${n} registro(s)`);
    console.log("Restauração concluída e conferida (contagens iguais às do backup).");
    return 0;
  } catch (error) {
    const msg = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.error(`Nada foi restaurado: ${redact(msg, target, raw)}`);
    return 1;
  } finally {
    await Promise.race([client.end().catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
  }
}

main().then((code) => process.exit(code));
