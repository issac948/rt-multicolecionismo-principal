/**
 * Vitrines de miniaturas de carros da página inicial: Destaques, Novidades e as demais.
 * Um produto aparece em UMA delas só (sem cartões repetidos na mesma página).
 *  - `featured`: os marcados como destaque pelo dono;
 *  - `recent`: os mais recentes (candidatos a "Novidades");
 *  - `pool`: os demais, na ordem padrão da loja.
 */
export function splitCarShowcases<T extends { id: string }>(
  input: { featured: T[]; recent: T[]; pool: T[] },
  limits: { novidades: number; miniaturas: number } = { novidades: 4, miniaturas: 8 },
): { destaques: T[]; novidades: T[]; miniaturas: T[] } {
  const shown = new Set(input.featured.map((p) => p.id));
  const novidades = input.recent.filter((p) => !shown.has(p.id)).slice(0, limits.novidades);
  for (const p of novidades) shown.add(p.id);
  const miniaturas = input.pool.filter((p) => !shown.has(p.id)).slice(0, limits.miniaturas);
  return { destaques: input.featured, novidades, miniaturas };
}
