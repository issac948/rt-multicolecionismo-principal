/**
 * Aplica as migrations SQL da pasta /drizzle no banco indicado por DATABASE_URL.
 * É seguro rodar várias vezes: só aplica o que ainda não foi aplicado.
 *
 * Uso: npm run db:migrate
 */
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida. Configure o arquivo .env primeiro.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    console.log("Migrations aplicadas com sucesso.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Falha ao aplicar migrations:", error);
  process.exit(1);
});
