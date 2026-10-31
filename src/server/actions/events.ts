"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formBool, formString } from "@/lib/forms";
import {
  eventCreateSchema,
  eventTemplateInputSchema,
  eventUpdateSchema,
  templateApplySchema,
} from "@/lib/event-schemas";
import { uuidSchema, zodFieldErrors } from "@/lib/schemas";
import { requireAdminAction } from "../auth/current-user";
import { BusinessRuleError } from "../errors";
import {
  applyTemplateToUpcoming,
  cancelEvent,
  createEvents,
  createTemplate,
  deleteEvent,
  deleteTemplate,
  reactivateEvent,
  updateEvent,
  updateTemplate,
} from "../services/events";
import { failure, type FormState } from "./shared";

/** Atualiza as telas que mostram eventos. O calendário público lê o banco a cada visita: não é preciso publicar o site de novo. */
function refreshEventPages() {
  revalidatePath("/");
  revalidatePath("/eventos");
  revalidatePath("/admin/eventos", "layout");
}

const id = (fd: FormData, key: string, label: string) => {
  const parsed = uuidSchema.safeParse(formString(fd, key));
  if (!parsed.success) throw new BusinessRuleError(`${label} inválido.`);
  return parsed.data;
};

/** Campos de texto comuns aos formulários (a foto vem como chave, enviada antes pelo painel). */
function readCommon(fd: FormData) {
  return {
    description: formString(fd, "description") ?? "",
    location: formString(fd, "location") ?? "",
    imageKey: formString(fd, "imageKey")?.trim() || null,
  };
}

/* ------------------------------ Modelos ------------------------------ */

export async function saveEventTemplateAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let destination: string | null = null;
  try {
    await requireAdminAction();
    const parsed = eventTemplateInputSchema.safeParse({
      name: formString(fd, "name") ?? "",
      defaultStartTime: formString(fd, "startTime"),
      defaultEndTime: formString(fd, "endTime"),
      ...readCommon(fd),
    });
    if (!parsed.success) {
      const errors = zodFieldErrors(parsed.error);
      // O formulário usa startTime/endTime; o schema usa defaultStartTime/defaultEndTime.
      if (errors.defaultStartTime) errors.startTime = errors.defaultStartTime;
      if (errors.defaultEndTime) errors.endTime = errors.defaultEndTime;
      return { errors, message: "Confira os campos destacados." };
    }

    const templateId = formString(fd, "templateId");
    if (templateId) {
      await updateTemplate(id(fd, "templateId", "Modelo"), parsed.data);
      refreshEventPages();
      return { ok: true, message: "Modelo salvo. As participações já marcadas NÃO foram alteradas." };
    }
    const created = await createTemplate(parsed.data);
    refreshEventPages();
    destination = `/admin/eventos/modelos/${created.id}?criado=1`;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

export async function deleteEventTemplateAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireAdminAction();
    if (formString(fd, "confirm") !== "sim") throw new BusinessRuleError("Confirme a exclusão.");
    await deleteTemplate(id(fd, "templateId", "Modelo"));
    refreshEventPages();
  } catch (error) {
    return failure(error);
  }
  redirect("/admin/eventos/modelos?excluido=1");
}

/** Aplica o modelo às próximas datas. Só funciona com confirmação explícita e com a mesma lista que o dono conferiu. */
export async function applyTemplateAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireAdminAction();
    if (!formBool(fd, "confirm")) return { errors: { confirm: "Marque a caixa para confirmar." }, message: "Falta a confirmação." };
    const parsed = templateApplySchema.safeParse({ templateId: formString(fd, "templateId"), fields: fd.getAll("fields").map(String) });
    if (!parsed.success) return { errors: zodFieldErrors(parsed.error), message: "Marque pelo menos um campo para aplicar." };
    const expected = Number(formString(fd, "expectedCount"));
    if (!Number.isInteger(expected) || expected < 0) throw new BusinessRuleError("Dados inválidos.");

    const result = await applyTemplateToUpcoming(parsed.data.templateId, parsed.data.fields, expected);
    refreshEventPages();
    return { ok: true, message: result.updated === 0 ? "Não havia próximas participações para atualizar." : `${result.updated} participação(ões) atualizada(s).` };
  } catch (error) {
    return failure(error);
  }
}

/* ------------------------------ Participações ------------------------------ */

export async function createEventsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let destination: string;
  try {
    await requireAdminAction();
    const dates = fd
      .getAll("dates")
      .map((d) => String(d).trim())
      .filter(Boolean);
    const parsed = eventCreateSchema.safeParse({
      templateId: formString(fd, "templateId") || null,
      dates,
      published: formBool(fd, "published"),
      title: formString(fd, "title") ?? "",
      startTime: formString(fd, "startTime"),
      endTime: formString(fd, "endTime"),
      ...readCommon(fd),
    });
    if (!parsed.success) {
      const raw = zodFieldErrors(parsed.error);
      const errors: Record<string, string> = {};
      for (const [key, message] of Object.entries(raw)) errors[key.startsWith("dates") ? "dates" : key] = message;
      return { errors, message: "Confira os campos destacados." };
    }
    const created = await createEvents(parsed.data);
    refreshEventPages();
    destination = `/admin/eventos?criado=${created.length}`;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

export async function updateEventAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireAdminAction();
    const eventId = id(fd, "eventId", "Evento");
    const parsed = eventUpdateSchema.safeParse({
      date: formString(fd, "date") ?? "",
      status: formString(fd, "status") ?? "",
      title: formString(fd, "title") ?? "",
      startTime: formString(fd, "startTime"),
      endTime: formString(fd, "endTime"),
      ...readCommon(fd),
    });
    if (!parsed.success) return { errors: zodFieldErrors(parsed.error), message: "Confira os campos destacados." };
    await updateEvent(eventId, parsed.data);
    refreshEventPages();
    return { ok: true, message: "Participação salva." };
  } catch (error) {
    return failure(error);
  }
}

/** Cancelar mantém o registro (aparece em "Cancelados") mas some do site. */
export async function cancelEventAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireAdminAction();
    await cancelEvent(id(fd, "eventId", "Evento"));
    refreshEventPages();
    return { ok: true, message: "Evento cancelado. Ele não aparece mais no site." };
  } catch (error) {
    return failure(error);
  }
}

export async function reactivateEventAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireAdminAction();
    await reactivateEvent(id(fd, "eventId", "Evento"));
    refreshEventPages();
    return { ok: true, message: "Evento reativado e publicado no site." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteEventAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireAdminAction();
    // O formulário exige a confirmação pelo navegador; o servidor também exige o campo, para ninguém apagar por engano via chamada direta.
    if (formString(fd, "confirm") !== "sim") throw new BusinessRuleError("Confirme a exclusão.");
    await deleteEvent(id(fd, "eventId", "Evento"));
    refreshEventPages();
  } catch (error) {
    return failure(error);
  }
  redirect("/admin/eventos?excluido=1");
}

