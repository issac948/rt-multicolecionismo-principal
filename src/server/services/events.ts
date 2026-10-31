import { and, asc, desc, eq, gte, inArray, lt, lte, ne, sql } from "drizzle-orm";
import {
  isMonthInPublicWindow,
  isValidMonthKey,
  monthRange,
  todayIso,
  type AdminEventItem,
  type EventStatus,
  type PublicEvent,
} from "@/lib/events";
import type { EventCreateInput, EventTemplateInput, EventUpdateInput, TemplateApplyField } from "@/lib/event-schemas";
import { db } from "../db";
import { isUndefinedTableError } from "../db/errors";
import { eventTemplates, events, type EventRow, type EventTemplate } from "../db/schema";
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "../errors";
import { fileUrl, getStorage, isValidStorageKey } from "../storage";

/* -------------------------------------------------------------------------- */
/* Regras de fotos                                                             */
/* -------------------------------------------------------------------------- */

const EVENT_IMAGE_PREFIX = "events/";

/** A foto de um evento só pode ser uma foto enviada para eventos (nunca a de um produto ou o logo). */
export function assertEventImageKey(key: string | null): string | null {
  if (key === null) return null;
  if (!key.startsWith(EVENT_IMAGE_PREFIX) || !isValidStorageKey(key)) {
    throw new ValidationError({ imageKey: "Foto inválida. Envie a foto de novo." });
  }
  return key;
}

/** Apaga o arquivo da foto só se nenhum evento nem modelo ainda a usa (modelo e participações podem compartilhar a mesma foto). */
export async function deleteEventImageIfUnreferenced(key: string | null | undefined): Promise<boolean> {
  if (!key || !key.startsWith(EVENT_IMAGE_PREFIX)) return false;
  const [usedByEvent] = await db.select({ id: events.id }).from(events).where(eq(events.imageKey, key)).limit(1);
  if (usedByEvent) return false;
  const [usedByTemplate] = await db.select({ id: eventTemplates.id }).from(eventTemplates).where(eq(eventTemplates.imageKey, key)).limit(1);
  if (usedByTemplate) return false;
  await getStorage().delete(key);
  return true;
}

/** Remove fotos de eventos enviadas há mais de `olderThanHours` horas e que nenhum evento/modelo usa (o dono enviou e desistiu). */
export async function cleanupOrphanEventImages(olderThanHours = 24): Promise<number> {
  const storage = getStorage();
  if (!storage.listOlderThan) return 0;
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const keys = await storage.listOlderThan(EVENT_IMAGE_PREFIX, cutoff);
  let removed = 0;
  for (const key of keys) {
    if (await deleteEventImageIfUnreferenced(key)) removed++;
  }
  return removed;
}

/* -------------------------------------------------------------------------- */
/* Conversões                                                                  */
/* -------------------------------------------------------------------------- */

function toPublic(row: EventRow): PublicEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    date: row.eventDate,
    startTime: row.startTime,
    endTime: row.endTime,
    imageUrl: fileUrl(row.imageKey),
  };
}

function toAdmin(row: EventRow, templateName: string | null): AdminEventItem {
  return { ...toPublic(row), status: row.status, templateId: row.templateId, templateName };
}

const ORDER = [asc(events.eventDate), sql`${events.startTime} ASC NULLS LAST`, asc(events.title)] as const;

/* -------------------------------------------------------------------------- */
/* Consultas PÚBLICAS: só eventos publicados e não cancelados                  */
/* -------------------------------------------------------------------------- */

let warnedMissingTable = false;

/**
 * Se o site novo for publicado ANTES da migração 0005 (tabela `events` ainda inexistente), a vitrine continua abrindo,
 * só sem a seção de eventos, em vez de dar erro na página inicial. Só o erro "tabela não existe" é tolerado:
 * qualquer outro erro do banco continua subindo normalmente. O painel (/admin/eventos) não usa isto: lá o erro aparece.
 */
async function emptyIfNotMigrated<T>(query: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (!isUndefinedTableError(error)) throw error;
    if (!warnedMissingTable) {
      warnedMissingTable = true;
      console.error("[eventos] a tabela de eventos ainda não existe neste banco: aplique a migração 0005 (npm run db:migrate). Até lá a loja abre sem a seção de eventos.");
    }
    return empty;
  }
}

/** Eventos publicados de um mês ("AAAA-MM"). Mês fora da janela do calendário devolve lista vazia. */
export async function listPublicEventsInMonth(monthKey: string): Promise<PublicEvent[]> {
  if (!isValidMonthKey(monthKey) || !isMonthInPublicWindow(monthKey)) return [];
  const { start, end } = monthRange(monthKey);
  return emptyIfNotMigrated(async () => {
    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.status, "PUBLICADO"), gte(events.eventDate, start), lte(events.eventDate, end)))
      .orderBy(...ORDER);
    return rows.map(toPublic);
  }, []);
}

/** Próximos eventos publicados (a partir de hoje). */
export async function listUpcomingPublicEvents(limit = 6, today: string = todayIso()): Promise<PublicEvent[]> {
  return emptyIfNotMigrated(async () => {
    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.status, "PUBLICADO"), gte(events.eventDate, today)))
      .orderBy(...ORDER)
      .limit(Math.max(1, Math.min(50, limit)));
    return rows.map(toPublic);
  }, []);
}

/** Existe algum evento publicado de hoje em diante? (decide se a seção aparece na home) */
export async function hasUpcomingPublicEvents(today: string = todayIso()): Promise<boolean> {
  return emptyIfNotMigrated(async () => {
    const [row] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.status, "PUBLICADO"), gte(events.eventDate, today)))
      .limit(1);
    return Boolean(row);
  }, false);
}

export async function getPublicEvent(id: string): Promise<PublicEvent | null> {
  return emptyIfNotMigrated(async () => {
    const [row] = await db.select().from(events).where(and(eq(events.id, id), eq(events.status, "PUBLICADO"))).limit(1);
    return row ? toPublic(row) : null;
  }, null);
}

/* -------------------------------------------------------------------------- */
/* Consultas do PAINEL                                                         */
/* -------------------------------------------------------------------------- */

export async function listAdminEventsInMonth(monthKey: string): Promise<AdminEventItem[]> {
  if (!isValidMonthKey(monthKey)) return [];
  const { start, end } = monthRange(monthKey);
  const rows = await db
    .select({ event: events, templateName: eventTemplates.name })
    .from(events)
    .leftJoin(eventTemplates, eq(eventTemplates.id, events.templateId))
    .where(and(gte(events.eventDate, start), lte(events.eventDate, end)))
    .orderBy(...ORDER);
  return rows.map((r) => toAdmin(r.event, r.templateName));
}

export type AdminEventScope = "proximos" | "passados" | "cancelados";

/** Lista de participações para a agenda do painel. "proximos" = de hoje em diante e não canceladas. */
export async function listAdminEvents(scope: AdminEventScope, today: string = todayIso(), limit = 200): Promise<AdminEventItem[]> {
  const where =
    scope === "proximos"
      ? and(gte(events.eventDate, today), ne(events.status, "CANCELADO"))
      : scope === "passados"
        ? and(lt(events.eventDate, today), ne(events.status, "CANCELADO"))
        : eq(events.status, "CANCELADO");
  const rows = await db
    .select({ event: events, templateName: eventTemplates.name })
    .from(events)
    .leftJoin(eventTemplates, eq(eventTemplates.id, events.templateId))
    .where(where)
    .orderBy(...(scope === "proximos" ? ORDER : [desc(events.eventDate), asc(events.title)]))
    .limit(limit);
  return rows.map((r) => toAdmin(r.event, r.templateName));
}

export async function countAdminEventsByScope(today: string = todayIso()): Promise<Record<AdminEventScope, number>> {
  const [row] = await db
    .select({
      proximos: sql<number>`count(*) FILTER (WHERE ${events.eventDate} >= ${today} AND ${events.status} <> 'CANCELADO')::int`,
      passados: sql<number>`count(*) FILTER (WHERE ${events.eventDate} < ${today} AND ${events.status} <> 'CANCELADO')::int`,
      cancelados: sql<number>`count(*) FILTER (WHERE ${events.status} = 'CANCELADO')::int`,
    })
    .from(events);
  return row ?? { proximos: 0, passados: 0, cancelados: 0 };
}

export async function getAdminEvent(id: string): Promise<(AdminEventItem & { imageKey: string | null }) | null> {
  const [row] = await db
    .select({ event: events, templateName: eventTemplates.name })
    .from(events)
    .leftJoin(eventTemplates, eq(eventTemplates.id, events.templateId))
    .where(eq(events.id, id))
    .limit(1);
  return row ? { ...toAdmin(row.event, row.templateName), imageKey: row.event.imageKey } : null;
}

/* -------------------------------------------------------------------------- */
/* Participações: criar, editar, cancelar, excluir                             */
/* -------------------------------------------------------------------------- */

/** Cria uma participação para cada data. Os dados vêm do formulário (que já veio preenchido pelo modelo): o modelo nunca é alterado aqui. */
export async function createEvents(input: EventCreateInput): Promise<EventRow[]> {
  assertEventImageKey(input.imageKey);

  if (input.templateId) {
    const [template] = await db.select({ id: eventTemplates.id }).from(eventTemplates).where(eq(eventTemplates.id, input.templateId)).limit(1);
    if (!template) throw new NotFoundError("O modelo escolhido não existe mais.");
  }

  // Evita cadastrar duas vezes o mesmo evento no mesmo dia (clique duplo, formulário reenviado).
  const clashes = await db
    .select({ eventDate: events.eventDate })
    .from(events)
    .where(and(inArray(events.eventDate, input.dates), ne(events.status, "CANCELADO"), sql`lower(${events.title}) = lower(${input.title})`));
  if (clashes.length > 0) {
    const days = clashes.map((c) => c.eventDate.split("-").reverse().join("/")).join(", ");
    throw new ConflictError(`Já existe "${input.title}" em: ${days}. Edite a participação existente ou escolha outra data.`);
  }

  return db
    .insert(events)
    .values(
      input.dates.map((date) => ({
        templateId: input.templateId,
        title: input.title,
        description: input.description,
        location: input.location,
        eventDate: date,
        startTime: input.startTime,
        endTime: input.endTime,
        imageKey: input.imageKey,
        status: (input.published ? "PUBLICADO" : "RASCUNHO") as EventStatus,
      })),
    )
    .returning();
}

/** Edita SÓ esta participação (nunca o modelo nem as outras datas). */
export async function updateEvent(id: string, input: EventUpdateInput): Promise<EventRow> {
  assertEventImageKey(input.imageKey);
  const [current] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!current) throw new NotFoundError("Evento não encontrado.");

  const clash = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.eventDate, input.date),
        ne(events.id, id),
        ne(events.status, "CANCELADO"),
        sql`lower(${events.title}) = lower(${input.title})`,
      ),
    )
    .limit(1);
  if (clash.length > 0 && input.status !== "CANCELADO") {
    throw new ConflictError(`Já existe "${input.title}" nesta data. Escolha outra data ou outro nome.`);
  }

  const [updated] = await db
    .update(events)
    .set({
      title: input.title,
      description: input.description,
      location: input.location,
      eventDate: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      imageKey: input.imageKey,
      status: input.status,
      cancelledAt: input.status === "CANCELADO" ? (current.cancelledAt ?? new Date()) : null,
    })
    .where(eq(events.id, id))
    .returning();

  if (current.imageKey && current.imageKey !== input.imageKey) await deleteEventImageIfUnreferenced(current.imageKey);
  return updated;
}

export async function cancelEvent(id: string): Promise<void> {
  const rows = await db.update(events).set({ status: "CANCELADO", cancelledAt: new Date() }).where(and(eq(events.id, id), ne(events.status, "CANCELADO"))).returning({ id: events.id });
  if (rows.length === 0) {
    const [exists] = await db.select({ id: events.id }).from(events).where(eq(events.id, id)).limit(1);
    if (!exists) throw new NotFoundError("Evento não encontrado.");
    // Já estava cancelado: nada a fazer.
  }
}

/** Volta uma participação cancelada para "Publicado" (o dono pode ter cancelado sem querer). */
export async function reactivateEvent(id: string): Promise<void> {
  const rows = await db.update(events).set({ status: "PUBLICADO", cancelledAt: null }).where(and(eq(events.id, id), eq(events.status, "CANCELADO"))).returning({ id: events.id });
  if (rows.length === 0) throw new BusinessRuleError("Só é possível reativar um evento cancelado.");
}

export async function deleteEvent(id: string): Promise<void> {
  const [row] = await db.delete(events).where(eq(events.id, id)).returning({ imageKey: events.imageKey });
  if (!row) throw new NotFoundError("Evento não encontrado.");
  await deleteEventImageIfUnreferenced(row.imageKey);
}

/* -------------------------------------------------------------------------- */
/* Modelos                                                                     */
/* -------------------------------------------------------------------------- */

export type TemplateListItem = EventTemplate & { upcomingCount: number; totalCount: number };

export async function listTemplates(today: string = todayIso()): Promise<TemplateListItem[]> {
  const rows = await db
    .select({
      template: eventTemplates,
      upcomingCount: sql<number>`count(${events.id}) FILTER (WHERE ${events.eventDate} >= ${today} AND ${events.status} <> 'CANCELADO')::int`,
      totalCount: sql<number>`count(${events.id})::int`,
    })
    .from(eventTemplates)
    .leftJoin(events, eq(events.templateId, eventTemplates.id))
    .groupBy(eventTemplates.id)
    .orderBy(asc(eventTemplates.name));
  return rows.map((r) => ({ ...r.template, upcomingCount: r.upcomingCount, totalCount: r.totalCount }));
}

export async function getTemplate(id: string): Promise<EventTemplate | null> {
  const [row] = await db.select().from(eventTemplates).where(eq(eventTemplates.id, id)).limit(1);
  return row ?? null;
}

export async function createTemplate(input: EventTemplateInput): Promise<EventTemplate> {
  assertEventImageKey(input.imageKey);
  const [row] = await db
    .insert(eventTemplates)
    .values({
      name: input.name,
      description: input.description,
      location: input.location,
      defaultStartTime: input.defaultStartTime,
      defaultEndTime: input.defaultEndTime,
      imageKey: input.imageKey,
    })
    .returning();
  return row;
}

/**
 * Edita o modelo. NÃO altera nenhuma participação já marcada: elas guardam a própria cópia dos dados.
 * Para refletir a mudança nas próximas datas existe `applyTemplateToUpcoming`, que é um passo explícito.
 */
export async function updateTemplate(id: string, input: EventTemplateInput): Promise<EventTemplate> {
  assertEventImageKey(input.imageKey);
  const current = await getTemplate(id);
  if (!current) throw new NotFoundError("Modelo não encontrado.");
  const [row] = await db
    .update(eventTemplates)
    .set({
      name: input.name,
      description: input.description,
      location: input.location,
      defaultStartTime: input.defaultStartTime,
      defaultEndTime: input.defaultEndTime,
      imageKey: input.imageKey,
    })
    .where(eq(eventTemplates.id, id))
    .returning();
  if (current.imageKey && current.imageKey !== input.imageKey) await deleteEventImageIfUnreferenced(current.imageKey);
  return row;
}

/** Exclui o modelo. As participações já marcadas continuam como estão (só perdem a ligação com o modelo). */
export async function deleteTemplate(id: string): Promise<{ keptEvents: number }> {
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(events).where(eq(events.templateId, id));
  const [row] = await db.delete(eventTemplates).where(eq(eventTemplates.id, id)).returning({ imageKey: eventTemplates.imageKey });
  if (!row) throw new NotFoundError("Modelo não encontrado.");
  await deleteEventImageIfUnreferenced(row.imageKey);
  return { keptEvents: count?.n ?? 0 };
}

/** Participações futuras (hoje em diante, não canceladas) ligadas ao modelo: as que o dono pode escolher atualizar. */
export async function listUpcomingForTemplate(templateId: string, today: string = todayIso()): Promise<EventRow[]> {
  return db
    .select()
    .from(events)
    .where(and(eq(events.templateId, templateId), gte(events.eventDate, today), ne(events.status, "CANCELADO")))
    .orderBy(...ORDER);
}

/**
 * Aplica, de forma EXPLÍCITA, os dados atuais do modelo às próximas participações (de hoje em diante, não canceladas).
 * Só os campos escolhidos são trocados. `expectedCount` é o número que o dono viu na tela de confirmação:
 * se mudou nesse meio-tempo, nada é alterado.
 */
export async function applyTemplateToUpcoming(
  templateId: string,
  fields: TemplateApplyField[],
  expectedCount: number,
  today: string = todayIso(),
): Promise<{ updated: number }> {
  const template = await getTemplate(templateId);
  if (!template) throw new NotFoundError("Modelo não encontrado.");

  const targets = await listUpcomingForTemplate(templateId, today);
  if (targets.length !== expectedCount) {
    throw new BusinessRuleError("A lista de datas mudou desde que você a conferiu. Veja a lista de novo antes de confirmar.");
  }
  if (targets.length === 0) return { updated: 0 };

  const set: Partial<typeof events.$inferInsert> = {};
  if (fields.includes("title")) set.title = template.name;
  if (fields.includes("description")) set.description = template.description;
  if (fields.includes("location")) set.location = template.location;
  if (fields.includes("times")) {
    set.startTime = template.defaultStartTime;
    set.endTime = template.defaultEndTime;
  }
  if (fields.includes("image")) set.imageKey = template.imageKey;

  const oldKeys = fields.includes("image") ? [...new Set(targets.map((t) => t.imageKey).filter((k): k is string => Boolean(k) && k !== template.imageKey))] : [];

  await db.update(events).set(set).where(inArray(events.id, targets.map((t) => t.id)));
  for (const key of oldKeys) await deleteEventImageIfUnreferenced(key);
  return { updated: targets.length };
}
