/**
 * Datas e horas digitadas no painel são sempre horário de Brasília (UTC-3, sem horário de verão desde 2019),
 * mesmo com o servidor rodando em UTC (Netlify). O campo <input type="datetime-local"> manda "2026-11-27T00:00".
 */
const BR_OFFSET_HOURS = 3;
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "2026-11-27T00:00" (Brasília) → Date. Vazio → null. Inválido → undefined. */
export function parseBrLocal(value: string | null | undefined): Date | null | undefined {
  const v = (value ?? "").trim();
  if (!v) return null;
  const m = LOCAL_RE.exec(v);
  if (!m) return undefined;
  const [, y, mo, d, h, mi] = m.map(Number) as number[];
  const date = new Date(Date.UTC(y, mo - 1, d, h + BR_OFFSET_HOURS, mi));
  // Rejeita datas que o JavaScript "corrige" (31/02 etc.).
  const back = toBrLocalInput(date);
  return back === v ? date : undefined;
}

/** Date → "2026-11-27T00:00" no horário de Brasília (valor de <input type="datetime-local">). */
export function toBrLocalInput(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const shifted = new Date(d.getTime() - BR_OFFSET_HOURS * 3_600_000);
  return shifted.toISOString().slice(0, 16);
}

/** "27/11/2026 00:00" (Brasília). */
export function formatBr(date: Date | string | null | undefined): string {
  const v = toBrLocalInput(date);
  if (!v) return "";
  const [d, t] = v.split("T");
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y} ${t}`;
}
