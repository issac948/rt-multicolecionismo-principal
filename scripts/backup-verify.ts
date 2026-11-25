/**
 * Confere um backup (não usa o banco): arquivos presentes, SHA-256, contagens e JSON legível.
 *
 *   npm run backup:verify -- --pasta=backups\2026-11-26_180000
 */
import path from "node:path";
import { verifyBackup } from "./lib/backup";

async function main(): Promise<number> {
  const hit = process.argv.slice(2).find((a) => a.startsWith("--pasta="));
  if (!hit) {
    console.error("Informe a pasta do backup: npm run backup:verify -- --pasta=<pasta>");
    return 1;
  }
  const dir = path.resolve(hit.slice("--pasta=".length));
  const r = await verifyBackup(dir, { drizzleDir: path.resolve(process.cwd(), "drizzle") });
  if (r.manifest) {
    console.log(`Backup de ${r.manifest.criadoEm} · origem ${r.manifest.destino} · ${r.manifest.migracoes.length} migrações`);
    for (const [t, e] of Object.entries(r.manifest.tabelas)) console.log(`  ${t}: ${e.linhas} registro(s)`);
  }
  for (const a of r.avisos) console.log(`aviso: ${a}`);
  for (const e of r.erros) console.error(`ERRO: ${e}`);
  console.log(r.ok ? "Backup OK." : "Backup COM PROBLEMAS: não use.");
  return r.ok ? 0 : 1;
}

main().then((code) => process.exit(code));
