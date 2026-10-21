import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Antes de todos os testes: recria o schema do banco de TESTE e aplica as migrations.
 * Trava de segurança: só roda se o nome do banco terminar em "_test", para nunca
 * apagar por engano o banco de desenvolvimento ou de produção.
 */
export default async function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgres://loja:loja_dev_pw@localhost:5432/loja_test";

  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(
      `Recusando apagar o banco "${dbName}": o banco de testes precisa terminar com "_test".`,
    );
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await migrate(drizzle(pool), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  } finally {
    await pool.end();
  }
}
