/**
 * Reconhece o erro "a tabela não existe" do PostgreSQL (código 42P01).
 * O drizzle embrulha o erro do driver em `cause`, por isso o código é procurado em toda a cadeia.
 */
export function isUndefinedTableError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current !== null && typeof current === "object"; depth++) {
    if ((current as { code?: unknown }).code === "42P01") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
