import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Uma única pool de conexões por processo. Em desenvolvimento o Next recarrega
 * módulos a cada alteração, então a pool fica guardada em `globalThis` para não
 * abrir conexões novas a cada reload.
 */
const globalForDb = globalThis as unknown as { __lojaPool?: Pool };

function createPool(): Pool {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Hospedagem sem servidor abre muitas instâncias pequenas: poucas conexões por instância evitam estourar o limite do banco.
    // (variável em branco, como no .env.example, vale como "não definida")
    max: Number(process.env.DATABASE_POOL_MAX) || (process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL ? 3 : 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // Sem este handler, um erro em conexão ociosa derrubaria o processo inteiro.
  pool.on("error", (err) => {
    console.error("[db] erro em conexão ociosa da pool:", err.message);
  });
  return pool;
}

export const pool: Pool = globalForDb.__lojaPool ?? createPool();
if (process.env.NODE_ENV !== "production") {
  globalForDb.__lojaPool = pool;
}

export const db = drizzle(pool, { schema });

export type Database = typeof db;
/** Tipo da transação recebida dentro de `db.transaction(async (tx) => ...)`. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Aceita tanto o `db` quanto uma transação em andamento. */
export type DbOrTx = Database | Tx;

export * as schema from "./schema";
