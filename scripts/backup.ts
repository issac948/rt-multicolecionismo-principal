/**
 * Backup do banco indicado por DATABASE_URL em arquivos legíveis. SOMENTE LEITURA no banco.
 *
 *   npm run backup                          pasta backups/AAAA-MM-DD_HHMMSS dentro do projeto (ignorada pelo Git)
 *   npm run backup -- --saida=D:\Backups    pasta de sua escolha (recomendado: fora do projeto)
 *   npm run backup -- --sem-fotos           não inclui as fotos guardadas no banco (backup bem menor)
 *
 * Depois: npm run backup:verify -- --pasta=<pasta>. Contém dados pessoais e hashes de senha: guarde com cuidado.
 */
import path from "node:path";
import { Client } from "pg";
import { backupSize, createBackup, verifyBackup } from "./lib/backup";
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
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19).replace(/-(\d\d)-(\d\d)-(\d\d)$/, "_$1$2$3");
  const dir = path.resolve(arg("saida") ?? path.join("backups", stamp));
  const drizzleDir = path.resolve(process.cwd(), "drizzle");
  const client = new Client({ connectionString: raw, connectionTimeoutMillis: 20_000 });
  client.on("error", () => {});
  console.log(`Destino: ${target.label} · ${target.isLocal ? "LOCAL" : "REMOTO"} · usuário ${target.userMasked}`);
  try {
    await client.connect();
    const manifest = await createBackup(client, { dir, target, drizzleDir, includePhotos: !process.argv.includes("--sem-fotos") });
    const check = await verifyBackup(dir, { drizzleDir });
    for (const [t, e] of Object.entries(manifest.tabelas)) console.log(`  ${t}: ${e.linhas} registro(s)`);
    console.log(`Backup gravado em ${dir} (${(await backupSize(dir) / 1024 / 1024).toFixed(1).replace(".", ",")} MB).`);
    for (const a of check.avisos) console.log(`  aviso: ${a}`);
    if (!check.ok) {
      console.error(`ERRO na verificação: ${check.erros.join("; ")}`);
      return 1;
    }
    console.log("Verificação: OK (arquivos legíveis, contagens e SHA-256 conferem).");
    console.log("Guarde esta pasta fora do projeto: ela tem dados pessoais e hashes de senha.");
    return 0;
  } catch (error) {
    const msg = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.error(`Falha no backup: ${redact(msg, target, raw)}`);
    return 1;
  } finally {
    await Promise.race([client.end().catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
  }
}

main().then((code) => process.exit(code));
