/**
 * Conferência SOMENTE LEITURA do banco indicado por DATABASE_URL (nada é alterado).
 *
 *   npm run db:check
 *
 * Para conferir a PRODUÇÃO sem gravar a senha no histórico do PowerShell:
 *
 *   $env:DATABASE_URL = Read-Host "Cole a DATABASE_URL de PRODUCAO"
 *   npm.cmd run db:check
 *   Remove-Item Env:DATABASE_URL
 *
 * A saída mostra o servidor mascarado, nunca a senha, e pode ser colada no chat.
 * Código de saída 1 quando há algum [ERRO].
 */
import path from "node:path";
import { Client } from "pg";
import { collectDbReport, formatReport } from "./lib/db-report";
import { describeDatabaseUrl, redact } from "./lib/db-target";

async function main(): Promise<number> {
  const raw = process.env.DATABASE_URL;
  const target = describeDatabaseUrl(raw);
  if (!target.ok) {
    console.error(target.error);
    return 1;
  }
  const client = new Client({ connectionString: raw, connectionTimeoutMillis: 20_000, query_timeout: 30_000 });
  // Sem este handler, um erro de conexão derrubaria o processo mostrando o erro cru.
  client.on("error", () => {});
  try {
    await client.connect();
    const report = await collectDbReport(client, { target, drizzleDir: path.resolve(process.cwd(), "drizzle") });
    console.log(formatReport(report));
    return report.erros > 0 ? 1 : 0;
  } catch (error) {
    const msg = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.error(`Não consegui conferir o banco (${target.label}): ${redact(msg, target, raw)}`);
    return 1;
  } finally {
    await Promise.race([client.end().catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
  }
}

main().then((code) => process.exit(code));
