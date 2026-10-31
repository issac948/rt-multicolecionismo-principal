/**
 * Copia as fotos de um lugar para outro, de acordo com o STORAGE_DRIVER do ambiente de DESTINO
 * (database = PostgreSQL da loja; s3 = Cloudflare R2, Neon Object Storage etc.). Só copia fotos que o banco realmente usa
 * (produtos, logo, eventos e modelos); nunca apaga nada na origem; nunca sobrescreve foto que já existe no destino.
 *
 *   Simulação (não grava nada):               npm run storage:migrate
 *   Copiar de verdade, de uma pasta:          npm run storage:migrate -- --aplicar
 *   Outra pasta de origem:                    npm run storage:migrate -- --de=C:\caminho\uploads
 *   Origem = fotos que estão no PostgreSQL:   npm run storage:migrate -- --de-banco --aplicar
 *       (use quando for passar do banco para um serviço externo: defina STORAGE_DRIVER=s3 e as variáveis S3_* só neste comando)
 *
 * Use com o DATABASE_URL e o STORAGE_DRIVER do ambiente de destino. Pensado para ser rodado pelo dono, uma vez,
 * no computador que tem a pasta das fotos (ou com acesso ao banco). Depois de copiar, o endereço das fotos NÃO muda
 * (/uploads/...): basta trocar STORAGE_DRIVER no Netlify e publicar. As fotos que ficaram no banco continuam lá até você apagá-las.
 */
import path from "node:path";
import { getEnv } from "../src/server/env";
import { pool } from "../src/server/db";
import { DatabaseStorage, getStorage, LocalDiskStorage } from "../src/server/storage";
import { copyFiles } from "../src/server/storage/transfer";

const args = process.argv.slice(2);
const apply = args.includes("--aplicar");
const fromDatabase = args.includes("--de-banco");
const fromArg = args.find((a) => a.startsWith("--de="))?.slice(5);

async function referencedKeys(): Promise<string[]> {
  const rows = await pool.query<{ key: string | null }>(`
    SELECT storage_key AS key FROM product_images
    UNION SELECT thumb_key FROM product_images
    UNION SELECT image_key FROM events
    UNION SELECT image_key FROM event_templates
    UNION SELECT value->>'logoKey' FROM settings WHERE key = 'store'
  `);
  return rows.rows.map((r) => r.key).filter((k): k is string => Boolean(k));
}

async function main() {
  const env = getEnv();
  if (fromDatabase && fromArg) {
    console.error("Use só uma origem: --de-banco OU --de=PASTA.");
    process.exitCode = 1;
    return;
  }

  let source;
  let sourceLabel: string;
  if (fromDatabase) {
    if (env.storage.driver === "database") {
      console.error("O destino é o próprio banco. Defina STORAGE_DRIVER=s3 (e as variáveis S3_*) ou local no ambiente de destino e rode de novo.");
      process.exitCode = 1;
      return;
    }
    source = new DatabaseStorage();
    sourceLabel = "PostgreSQL da loja (tabela stored_files)";
  } else {
    const fromDir = path.resolve(fromArg ?? env.uploadDir);
    if (env.storage.driver === "local" && path.resolve(env.uploadDir) === fromDir) {
      console.error("O destino é a própria pasta de origem. Defina STORAGE_DRIVER=database (ou s3) no ambiente de destino e rode de novo.");
      process.exitCode = 1;
      return;
    }
    source = new LocalDiskStorage(fromDir);
    sourceLabel = fromDir;
  }

  const target = getStorage();
  const keys = [...new Set(await referencedKeys())];
  console.log(`${apply ? "COPIANDO" : "SIMULAÇÃO (nada será gravado; use --aplicar para copiar)"}: ${keys.length} foto(s) usadas pelo banco.`);
  console.log(`  Origem: ${sourceLabel}\n  Destino: ${env.storage.driver}`);

  const { copied, copiedBytes, already, missing, failed } = await copyFiles(source, target, keys, apply);

  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1).replace(".", ",");
  console.log(`\n${apply ? "Copiadas" : "A copiar"}: ${copied} (${mb(copiedBytes)} MB). Já estavam no destino: ${already}.`);
  if (missing.length > 0) console.log(`Usadas pelo banco mas SEM arquivo na origem (precisam ser enviadas de novo pelo painel): ${missing.length}\n  ${missing.slice(0, 20).join("\n  ")}${missing.length > 20 ? "\n  ..." : ""}`);
  if (failed.length > 0) {
    console.log(`Falharam: ${failed.length}\n  ${failed.slice(0, 10).join("\n  ")}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Falha:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
