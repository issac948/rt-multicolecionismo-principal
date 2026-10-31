/**
 * Eventos (feiras, encontros, exposições em que a loja participa): constantes e funções puras,
 * sem banco e sem Next.js, para servirem ao servidor, ao navegador e aos testes.
 *
 * As datas dos eventos são "datas de calendário" (AAAA-MM-DD), sem fuso: um evento marcado para
 * 15/11 é 15/11 em qualquer lugar. O fuso de São Paulo só entra para saber qual é "hoje".
 */

export const EVENT_STATUSES = ["PUBLICADO", "RASCUNHO", "CANCELADO"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  PUBLICADO: "Publicado",
  RASCUNHO: "Rascunho",
  CANCELADO: "Cancelado",
};

export const EVENT_STATUS_TONE: Record<EventStatus, "success" | "neutral" | "danger"> = {
  PUBLICADO: "success",
  RASCUNHO: "neutral",
  CANCELADO: "danger",
};

export const EVENT_TIMEZONE = "America/Sao_Paulo";

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Quantos meses à frente o calendário público deixa navegar (evita crawlers/botões infinitos). */
export const CALENDAR_MAX_MONTHS_AHEAD = 24;
/** Quantos meses para trás (eventos antigos continuam visíveis para quem quiser ver o histórico). */
export const CALENDAR_MAX_MONTHS_BEHIND = 12;

/** Dado público de um evento, já pronto para a tela (sem campos internos). */
export type PublicEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  /** AAAA-MM-DD */
  date: string;
  /** HH:MM ou null */
  startTime: string | null;
  endTime: string | null;
  imageUrl: string | null;
};

/** Evento como o painel vê (inclui status e o modelo de origem). */
export type AdminEventItem = PublicEvent & {
  status: EventStatus;
  templateId: string | null;
  templateName: string | null;
};

/** Evento como o calendário recebe: no site público só os dados públicos; no painel também o status e o modelo. */
export type CalendarEvent = PublicEvent & Partial<Pick<AdminEventItem, "status" | "templateId" | "templateName">>;

/* ------------------------------ Datas ------------------------------ */

/** true para uma data real do calendário no formato AAAA-MM-DD (rejeita 2026-02-30). */
export function isValidIsoDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2200) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function isValidMonthKey(value: string): boolean {
  return MONTH_RE.test(value);
}

/** "Hoje" no fuso de São Paulo, como AAAA-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: EVENT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Soma (ou subtrai) dias a uma data AAAA-MM-DD. */
export function addDaysIso(iso: string, delta: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** "2026-11-15" -> "2026-11" */
export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Soma (ou subtrai) meses a uma chave "AAAA-MM". */
export function shiftMonth(key: string, delta: number): string {
  const m = MONTH_RE.exec(key);
  if (!m) throw new Error(`Mês inválido: ${key}`);
  const index = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function daysInMonth(key: string): number {
  const m = MONTH_RE.exec(key);
  if (!m) throw new Error(`Mês inválido: ${key}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
}

/** Primeiro e último dia do mês, como AAAA-MM-DD. */
export function monthRange(key: string): { start: string; end: string } {
  return { start: `${key}-01`, end: `${key}-${String(daysInMonth(key)).padStart(2, "0")}` };
}

/** O mês pedido está dentro da janela que o calendário público permite navegar? */
export function isMonthInPublicWindow(key: string, today: string = todayIso()): boolean {
  if (!isValidMonthKey(key)) return false;
  const current = monthKeyOf(today);
  return key >= shiftMonth(current, -CALENDAR_MAX_MONTHS_BEHIND) && key <= shiftMonth(current, CALENDAR_MAX_MONTHS_AHEAD);
}

export type CalendarCell = { iso: string; day: number; inMonth: boolean };

/**
 * Grade do mês em semanas (domingo a sábado). Sempre completa as semanas com dias dos meses vizinhos
 * (marcados com inMonth=false) para a grade ficar retangular.
 */
export function buildMonthGrid(key: string): CalendarCell[][] {
  const m = MONTH_RE.exec(key);
  if (!m) throw new Error(`Mês inválido: ${key}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = domingo
  const total = daysInMonth(key);
  const cells: CalendarCell[] = [];

  for (let i = firstWeekday; i > 0; i--) {
    const date = new Date(Date.UTC(year, month - 1, 1 - i));
    cells.push({ iso: date.toISOString().slice(0, 10), day: date.getUTCDate(), inMonth: false });
  }
  for (let d = 1; d <= total; d++) {
    cells.push({ iso: `${key}-${String(d).padStart(2, "0")}`, day: d, inMonth: true });
  }
  let extra = 1;
  while (cells.length % 7 !== 0) {
    const date = new Date(Date.UTC(year, month, extra++));
    cells.push({ iso: date.toISOString().slice(0, 10), day: date.getUTCDate(), inMonth: false });
  }

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;
export const WEEKDAY_NARROW = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-11" -> "novembro de 2026" */
export function formatMonthLabel(key: string): string {
  const m = MONTH_RE.exec(key);
  if (!m) return key;
  return `${MONTH_NAMES[Number(m[2]) - 1]} de ${m[1]}`;
}

const longDateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });

/** "2026-11-15" -> "domingo, 15 de novembro de 2026" */
export function formatEventDateLong(iso: string): string {
  if (!isValidIsoDate(iso)) return iso;
  return longDateFmt.format(new Date(`${iso}T00:00:00Z`));
}

/** "2026-11-15" -> "15/11/2026" */
export function formatEventDateShort(iso: string): string {
  if (!isValidIsoDate(iso)) return iso;
  return shortDateFmt.format(new Date(`${iso}T00:00:00Z`));
}

/** "2026-11-15" -> { weekday: "dom", day: 15, month: "nov" } (para etiquetas compactas) */
export function eventDateParts(iso: string): { weekday: string; day: number; month: string } {
  const date = new Date(`${iso}T00:00:00Z`);
  return {
    weekday: WEEKDAY_SHORT[date.getUTCDay()],
    day: date.getUTCDate(),
    month: MONTH_NAMES[date.getUTCMonth()].slice(0, 3),
  };
}

/* ------------------------------ Horários ------------------------------ */

/** "09:00" -> "9h", "14:30" -> "14h30" */
export function formatTime(value: string | null | undefined): string {
  if (!value || !TIME_RE.test(value)) return "";
  const [h, m] = value.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

/** "9h às 17h", "a partir das 9h", "até 17h" ou null quando não há horário. */
export function formatTimeRange(start: string | null | undefined, end: string | null | undefined): string | null {
  const s = formatTime(start);
  const e = formatTime(end);
  if (s && e) return `${s} às ${e}`;
  if (s) return `a partir das ${s}`;
  if (e) return `até ${e}`;
  return null;
}

/** Agrupa eventos por data (já ordenados por data e horário). */
export function groupEventsByDate<T extends { date: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.date);
    if (list) list.push(item);
    else map.set(item.date, [item]);
  }
  return map;
}

/** Ordem de exibição: data, depois horário de início (sem horário vem por último), depois título. */
export function compareEvents(a: { date: string; startTime: string | null; title: string }, b: { date: string; startTime: string | null; title: string }): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.startTime !== b.startTime) {
    if (a.startTime === null) return 1;
    if (b.startTime === null) return -1;
    return a.startTime < b.startTime ? -1 : 1;
  }
  return a.title.localeCompare(b.title, "pt-BR");
}
