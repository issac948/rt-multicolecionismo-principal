import { z } from "zod";
import { EVENT_STATUSES, isValidIsoDate, TIME_RE } from "./events";
import { uuidSchema } from "./schemas";

/**
 * Validação dos dados de eventos e modelos (servidor). Todo texto é "limpo" (trim) e limitado;
 * horários são HH:MM; datas são AAAA-MM-DD reais.
 */

const optionalTime = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || TIME_RE.test(v), "Horário inválido (use HH:MM, por exemplo 09:00)");

const storageKeyField = z
  .string()
  .trim()
  .max(200)
  .nullish()
  .transform((v) => (v ? v : null));

const isoDate = z
  .string("Escolha a data")
  .trim()
  .refine((v) => isValidIsoDate(v), "Data inválida");

function timesInOrder<T extends { startTime: string | null; endTime: string | null }>(d: T): boolean {
  return d.startTime === null || d.endTime === null || d.endTime > d.startTime;
}

const TIMES_ORDER_MESSAGE = { message: "O horário final precisa ser depois do inicial", path: ["endTime"] as PropertyKey[] };

/** Dados de um modelo reutilizável. */
export const eventTemplateInputSchema = z
  .object({
    name: z.string().trim().min(2, "Dê um nome ao modelo (mínimo 2 letras)").max(120, "Nome muito longo (máx. 120)"),
    description: z.string().trim().max(2000, "Descrição muito longa (máx. 2000)").default(""),
    location: z.string().trim().max(300, "Local muito longo (máx. 300)").default(""),
    defaultStartTime: optionalTime,
    defaultEndTime: optionalTime,
    imageKey: storageKeyField,
  })
  .refine((d) => timesInOrder({ startTime: d.defaultStartTime, endTime: d.defaultEndTime }), { message: TIMES_ORDER_MESSAGE.message, path: ["defaultEndTime"] });
export type EventTemplateInput = z.output<typeof eventTemplateInputSchema>;

/** Campos de uma participação (o que o painel edita em cada data). */
const occurrenceFields = {
  title: z.string().trim().min(2, "Informe o nome do evento (mínimo 2 letras)").max(120, "Nome muito longo (máx. 120)"),
  description: z.string().trim().max(2000, "Descrição muito longa (máx. 2000)").default(""),
  location: z.string().trim().max(300, "Local muito longo (máx. 300)").default(""),
  startTime: optionalTime,
  endTime: optionalTime,
  imageKey: storageKeyField,
};

/** Criação: uma ou várias datas com os mesmos dados (cada data vira uma participação). */
export const eventCreateSchema = z
  .object({
    templateId: uuidSchema.nullish().transform((v) => v ?? null),
    dates: z
      .array(isoDate)
      .min(1, "Escolha pelo menos uma data")
      .max(40, "Escolha no máximo 40 datas de uma vez")
      .refine((list) => new Set(list).size === list.length, "Há datas repetidas na lista"),
    published: z.boolean().default(true),
    ...occurrenceFields,
  })
  .refine(timesInOrder, TIMES_ORDER_MESSAGE);
export type EventCreateInput = z.output<typeof eventCreateSchema>;

/** Edição de uma participação (só dela). */
export const eventUpdateSchema = z
  .object({
    date: isoDate,
    status: z.enum(EVENT_STATUSES, { error: "Situação inválida" }),
    ...occurrenceFields,
  })
  .refine(timesInOrder, TIMES_ORDER_MESSAGE);
export type EventUpdateInput = z.output<typeof eventUpdateSchema>;

/** Quais campos do modelo podem ser aplicados, de forma explícita, às próximas participações. */
export const TEMPLATE_APPLY_FIELDS = ["title", "description", "location", "times", "image"] as const;
export type TemplateApplyField = (typeof TEMPLATE_APPLY_FIELDS)[number];
export const TEMPLATE_APPLY_LABEL: Record<TemplateApplyField, string> = {
  title: "Nome",
  description: "Descrição",
  location: "Local",
  times: "Horários",
  image: "Foto",
};
export const templateApplySchema = z.object({
  templateId: uuidSchema,
  fields: z.array(z.enum(TEMPLATE_APPLY_FIELDS)).min(1, "Marque pelo menos um campo para aplicar"),
});
