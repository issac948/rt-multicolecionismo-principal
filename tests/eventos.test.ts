import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const browser = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "loja_session" && browser.token ? { name, value: browser.token } : undefined),
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
// redirect() do Next lança um erro especial; aqui só registramos o destino.
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));

import {
  buildMonthGrid,
  CALENDAR_MAX_MONTHS_AHEAD,
  compareEvents,
  daysInMonth,
  eventDateParts,
  formatEventDateLong,
  formatMonthLabel,
  formatTimeRange,
  isMonthInPublicWindow,
  isValidIsoDate,
  monthKeyOf,
  monthRange,
  shiftMonth,
  todayIso,
} from "@/lib/events";
import { eventCreateSchema, eventTemplateInputSchema } from "@/lib/event-schemas";
import {
  applyTemplateAction,
  cancelEventAction,
  createEventsAction,
  deleteEventAction,
  deleteEventTemplateAction,
  reactivateEventAction,
  saveEventTemplateAction,
  updateEventAction,
} from "@/server/actions/events";
import { createSession } from "@/server/auth/session";
import { events, eventTemplates } from "@/server/db/schema";
import {
  applyTemplateToUpcoming,
  cancelEvent,
  cleanupOrphanEventImages,
  countAdminEventsByScope,
  createEvents,
  createTemplate,
  deleteEvent,
  deleteEventImageIfUnreferenced,
  deleteTemplate,
  getAdminEvent,
  hasUpcomingPublicEvents,
  listAdminEvents,
  listAdminEventsInMonth,
  listPublicEventsInMonth,
  listTemplates,
  listUpcomingPublicEvents,
  reactivateEvent,
  updateEvent,
  updateTemplate,
} from "@/server/services/events";
import { DatabaseStorage } from "@/server/storage";
import { createAdmin, createUser, db, resetDb } from "./helpers";

const SAVED_DRIVER = process.env.STORAGE_DRIVER;
beforeEach(async () => {
  process.env.STORAGE_DRIVER = "database";
  await resetDb();
  browser.token = null;
});
afterEach(() => {
  if (SAVED_DRIVER === undefined) delete process.env.STORAGE_DRIVER;
  else process.env.STORAGE_DRIVER = SAVED_DRIVER;
});

/** Datas relativas a "hoje" para os testes não envelhecerem. */
const today = todayIso();
const thisMonth = monthKeyOf(today);
const nextMonth = shiftMonth(thisMonth, 1);
const day = (month: string, d: number) => `${month}-${String(d).padStart(2, "0")}`;
const futureDay = (offset: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const templateInput: { name: string; description: string; location: string; defaultStartTime: string; defaultEndTime: string; imageKey: string | null } = {
  name: "Feira de Colecionadores",
  description: "Miniaturas e colecionáveis.",
  location: "Parque Barigui, Curitiba",
  defaultStartTime: "09:00",
  defaultEndTime: "17:00",
  imageKey: null,
};

async function newTemplate(over: Partial<typeof templateInput> = {}) {
  return createTemplate(eventTemplateInputSchema.parse({ ...templateInput, ...over }));
}

function eventInput(over: Record<string, unknown> = {}) {
  return eventCreateSchema.parse({
    templateId: null,
    dates: [futureDay(10)],
    published: true,
    title: "Encontro de Colecionadores",
    description: "",
    location: "Curitiba",
    startTime: "10:00",
    endTime: "16:00",
    imageKey: null,
    ...over,
  });
}

describe("datas e calendário (funções puras)", () => {
  it("valida datas reais do calendário", () => {
    expect(isValidIsoDate("2026-11-15")).toBe(true);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "2026-00-10", "26-11-15", "2026-1-5", "", "2026-11-15T10:00", "abcd-ef-gh"]) expect(isValidIsoDate(bad), bad).toBe(false);
  });

  it("'hoje' usa o fuso de São Paulo (23h de 21/10 em SP já é 22/10 em UTC)", () => {
    expect(todayIso(new Date("2026-10-22T02:30:00Z"))).toBe("2026-10-21");
    expect(todayIso(new Date("2026-10-22T03:00:00Z"))).toBe("2026-10-22");
  });

  it("navega entre meses, inclusive virada de ano", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-10", 14)).toBe("2027-12");
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(monthRange("2026-11")).toEqual({ start: "2026-11-01", end: "2026-11-30" });
    expect(() => shiftMonth("2026-13", 1)).toThrow();
  });

  it("monta a grade do mês em semanas completas (domingo a sábado)", () => {
    const grid = buildMonthGrid("2026-11"); // 1/11/2026 é domingo
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0][0]).toEqual({ iso: "2026-11-01", day: 1, inMonth: true });
    expect(grid.flat().filter((c) => c.inMonth)).toHaveLength(30);
    const oct = buildMonthGrid("2026-10"); // 1/10/2026 é quinta
    expect(oct[0].slice(0, 4).every((c) => !c.inMonth)).toBe(true);
    expect(oct[0][4]).toEqual({ iso: "2026-10-01", day: 1, inMonth: true });
    expect(oct[0][3].iso).toBe("2026-09-30");
    expect(oct.flat().at(-1)!.iso >= "2026-10-31").toBe(true);
    expect(buildMonthGrid("2027-02").flat().filter((c) => c.inMonth)).toHaveLength(28);
  });

  it("formata datas e horários em português", () => {
    expect(formatEventDateLong("2026-11-15")).toBe("domingo, 15 de novembro de 2026");
    expect(formatMonthLabel("2026-03")).toBe("março de 2026");
    expect(eventDateParts("2026-11-15")).toEqual({ weekday: "dom", day: 15, month: "nov" });
    expect(formatTimeRange("09:00", "17:30")).toBe("9h às 17h30");
    expect(formatTimeRange("09:00", null)).toBe("a partir das 9h");
    expect(formatTimeRange(null, "18:00")).toBe("até 18h");
    expect(formatTimeRange(null, null)).toBeNull();
  });

  it("ordena por data, depois horário (sem horário por último), depois título", () => {
    const list = [
      { date: "2026-11-02", startTime: null, title: "B" },
      { date: "2026-11-02", startTime: "14:00", title: "C" },
      { date: "2026-11-01", startTime: "18:00", title: "Z" },
      { date: "2026-11-02", startTime: "09:00", title: "A" },
    ];
    expect([...list].sort(compareEvents).map((e) => e.title)).toEqual(["Z", "A", "C", "B"]);
  });

  it("janela pública: limita meses navegáveis", () => {
    expect(isMonthInPublicWindow(thisMonth)).toBe(true);
    expect(isMonthInPublicWindow(shiftMonth(thisMonth, CALENDAR_MAX_MONTHS_AHEAD))).toBe(true);
    expect(isMonthInPublicWindow(shiftMonth(thisMonth, CALENDAR_MAX_MONTHS_AHEAD + 1))).toBe(false);
    expect(isMonthInPublicWindow("2001-01")).toBe(false);
    expect(isMonthInPublicWindow("lixo")).toBe(false);
  });
});

describe("validação dos dados de eventos", () => {
  it("modelo: nome obrigatório, horários HH:MM e fim depois do início", () => {
    expect(eventTemplateInputSchema.safeParse({ ...templateInput, name: "A" }).success).toBe(false);
    expect(eventTemplateInputSchema.safeParse({ ...templateInput, defaultStartTime: "9h" }).success).toBe(false);
    expect(eventTemplateInputSchema.safeParse({ ...templateInput, defaultStartTime: "25:00" }).success).toBe(false);
    expect(eventTemplateInputSchema.safeParse({ ...templateInput, defaultStartTime: "17:00", defaultEndTime: "09:00" }).success).toBe(false);
    expect(eventTemplateInputSchema.safeParse({ ...templateInput, defaultStartTime: "", defaultEndTime: "" }).success).toBe(true);
    expect(eventTemplateInputSchema.safeParse({ ...templateInput, description: "x".repeat(2001) }).success).toBe(false);
  });

  it("participação: pelo menos uma data real, sem repetidas, no máximo 40", () => {
    const base = { title: "Encontro", dates: ["2026-11-15"], published: true };
    expect(eventCreateSchema.safeParse(base).success).toBe(true);
    expect(eventCreateSchema.safeParse({ ...base, dates: [] }).success).toBe(false);
    expect(eventCreateSchema.safeParse({ ...base, dates: ["2026-02-30"] }).success).toBe(false);
    expect(eventCreateSchema.safeParse({ ...base, dates: ["2026-11-15", "2026-11-15"] }).success).toBe(false);
    expect(eventCreateSchema.safeParse({ ...base, dates: Array.from({ length: 41 }, (_, i) => futureDay(i)) }).success).toBe(false);
  });
});

describe("participações a partir de um modelo", () => {
  it("cria uma participação por data, copiando os dados do modelo, sem alterar o modelo", async () => {
    const template = await newTemplate();
    const created = await createEvents(
      eventInput({
        templateId: template.id,
        dates: [futureDay(7), futureDay(14), futureDay(21)],
        title: template.name,
        description: template.description,
        location: template.location,
        startTime: template.defaultStartTime,
        endTime: template.defaultEndTime,
      }),
    );
    expect(created).toHaveLength(3);
    expect(created.every((e) => e.templateId === template.id && e.title === "Feira de Colecionadores" && e.startTime === "09:00")).toBe(true);
    expect((await listTemplates())[0]).toMatchObject({ name: "Feira de Colecionadores", upcomingCount: 3, totalCount: 3 });
  });

  it("ajustar horário/local/descrição de UMA data não muda o modelo nem as outras datas", async () => {
    const template = await newTemplate();
    const [a, b] = await createEvents(eventInput({ templateId: template.id, dates: [futureDay(7), futureDay(14)], title: template.name, location: template.location, startTime: "09:00", endTime: "17:00" }));
    await updateEvent(a.id, { date: a.eventDate, status: "PUBLICADO", title: "Feira de Colecionadores (edição especial)", description: "Só nesta data: convidados.", location: "Shopping Estação", startTime: "13:00", endTime: "20:00", imageKey: null });

    const after = await getAdminEvent(a.id);
    expect(after).toMatchObject({ title: "Feira de Colecionadores (edição especial)", location: "Shopping Estação", startTime: "13:00" });
    const other = await getAdminEvent(b.id);
    expect(other).toMatchObject({ title: "Feira de Colecionadores", location: "Parque Barigui, Curitiba", startTime: "09:00", endTime: "17:00" });
    const [tpl] = await db.select().from(eventTemplates);
    expect(tpl).toMatchObject({ name: "Feira de Colecionadores", location: "Parque Barigui, Curitiba", defaultStartTime: "09:00", description: "Miniaturas e colecionáveis." });
  });

  it("editar o MODELO não altera participações já agendadas (nem silenciosamente)", async () => {
    const template = await newTemplate();
    const [ev] = await createEvents(eventInput({ templateId: template.id, title: template.name, location: template.location, startTime: "09:00", endTime: "17:00" }));
    await updateTemplate(template.id, eventTemplateInputSchema.parse({ ...templateInput, name: "Nome Novo", location: "Local Novo", defaultStartTime: "11:00", defaultEndTime: "15:00" }));
    expect(await getAdminEvent(ev.id)).toMatchObject({ title: "Feira de Colecionadores", location: "Parque Barigui, Curitiba", startTime: "09:00", endTime: "17:00" });
  });

  it("evento único (sem modelo) funciona", async () => {
    const [ev] = await createEvents(eventInput({ templateId: null, title: "Exposição única" }));
    expect(ev.templateId).toBeNull();
    expect(await getAdminEvent(ev.id)).toMatchObject({ templateName: null, title: "Exposição única" });
  });

  it("modelo inexistente é recusado", async () => {
    await expect(createEvents(eventInput({ templateId: "00000000-0000-4000-8000-000000000000" }))).rejects.toThrow(/modelo/i);
    expect(await db.select().from(events)).toHaveLength(0);
  });

  it("não cria duplicado (mesmo nome no mesmo dia) e nada é gravado se UMA das datas conflita", async () => {
    await createEvents(eventInput({ dates: [futureDay(7)], title: "Feira X" }));
    await expect(createEvents(eventInput({ dates: [futureDay(3), futureDay(7)], title: "feira x" }))).rejects.toThrow(/Já existe/);
    expect(await db.select().from(events)).toHaveLength(1);
    // Cancelado não bloqueia uma nova participação na mesma data.
    const [only] = await db.select().from(events);
    await cancelEvent(only.id);
    await expect(createEvents(eventInput({ dates: [futureDay(7)], title: "Feira X" }))).resolves.toHaveLength(1);
  });

  it("vários eventos no mesmo dia são permitidos (nomes diferentes)", async () => {
    await createEvents(eventInput({ dates: [futureDay(5)], title: "Feira A", startTime: "14:00" }));
    await createEvents(eventInput({ dates: [futureDay(5)], title: "Feira B", startTime: "09:00" }));
    const month = monthKeyOf(futureDay(5));
    const list = (await listAdminEventsInMonth(month)).filter((e) => e.date === futureDay(5));
    expect(list.map((e) => e.title)).toEqual(["Feira B", "Feira A"]);
  });
});

describe("o que o público vê", () => {
  it("só eventos PUBLICADOS: rascunho e cancelado nunca aparecem", async () => {
    const date = day(nextMonth, 10);
    await createEvents(eventInput({ dates: [date], title: "Publicado", published: true }));
    await createEvents(eventInput({ dates: [date], title: "Rascunho", published: false }));
    const [toCancel] = await createEvents(eventInput({ dates: [date], title: "Cancelado" }));
    await cancelEvent(toCancel.id);

    expect((await listPublicEventsInMonth(nextMonth)).map((e) => e.title)).toEqual(["Publicado"]);
    expect((await listUpcomingPublicEvents(10)).map((e) => e.title)).toEqual(["Publicado"]);
    // O painel vê os três.
    expect((await listAdminEventsInMonth(nextMonth)).map((e) => e.status).sort()).toEqual(["CANCELADO", "PUBLICADO", "RASCUNHO"]);
  });

  it("filtra por mês, ordena por data/horário e não vaza campos internos", async () => {
    await createEvents(eventInput({ dates: [day(nextMonth, 20)], title: "Dia 20" }));
    await createEvents(eventInput({ dates: [day(nextMonth, 5)], title: "Dia 5" }));
    await createEvents(eventInput({ dates: [day(shiftMonth(nextMonth, 1), 1)], title: "Mês seguinte" }));
    const list = await listPublicEventsInMonth(nextMonth);
    expect(list.map((e) => e.title)).toEqual(["Dia 5", "Dia 20"]);
    expect(Object.keys(list[0]).sort()).toEqual(["date", "description", "endTime", "id", "imageUrl", "location", "startTime", "title"]);
  });

  it("evento passado não entra em 'próximos'; evento de hoje entra", async () => {
    await createEvents(eventInput({ dates: [futureDay(-3)], title: "Passado" }));
    await createEvents(eventInput({ dates: [today], title: "Hoje" }));
    expect((await listUpcomingPublicEvents(10)).map((e) => e.title)).toEqual(["Hoje"]);
    expect(await hasUpcomingPublicEvents()).toBe(true);
  });

  it("sem eventos futuros, a seção some (hasUpcoming = false)", async () => {
    expect(await hasUpcomingPublicEvents()).toBe(false);
    await createEvents(eventInput({ dates: [futureDay(-3)] }));
    expect(await hasUpcomingPublicEvents()).toBe(false);
  });

  it("mês fora da janela ou inválido devolve vazio (sem consulta pesada)", async () => {
    expect(await listPublicEventsInMonth("2001-01")).toEqual([]);
    expect(await listPublicEventsInMonth("nada")).toEqual([]);
    expect(await listPublicEventsInMonth(shiftMonth(thisMonth, 60))).toEqual([]);
  });
});

describe("cancelar, reativar e excluir", () => {
  it("cancelar tira do site mas mantém o registro; reativar volta", async () => {
    const [ev] = await createEvents(eventInput({ dates: [futureDay(9)] }));
    await cancelEvent(ev.id);
    expect(await getAdminEvent(ev.id)).toMatchObject({ status: "CANCELADO" });
    expect(await listUpcomingPublicEvents(10)).toHaveLength(0);
    expect(await countAdminEventsByScope()).toMatchObject({ proximos: 0, cancelados: 1 });
    await cancelEvent(ev.id); // repetir não dá erro
    await reactivateEvent(ev.id);
    expect(await listUpcomingPublicEvents(10)).toHaveLength(1);
    await expect(reactivateEvent(ev.id)).rejects.toThrow(/cancelado/); // só reativa cancelado
  });

  it("excluir apaga só aquela participação (as outras e o modelo ficam)", async () => {
    const template = await newTemplate();
    const [a, b] = await createEvents(eventInput({ templateId: template.id, dates: [futureDay(7), futureDay(14)], title: template.name }));
    await deleteEvent(a.id);
    expect(await getAdminEvent(a.id)).toBeNull();
    expect(await getAdminEvent(b.id)).not.toBeNull();
    expect(await listTemplates()).toHaveLength(1);
    await expect(deleteEvent(a.id)).rejects.toThrow(/não encontrado/i);
  });

  it("agenda do painel separa próximos, passados e cancelados", async () => {
    await createEvents(eventInput({ dates: [futureDay(5)], title: "Futuro" }));
    await createEvents(eventInput({ dates: [futureDay(-5)], title: "Passado" }));
    const [c] = await createEvents(eventInput({ dates: [futureDay(8)], title: "Cancelado" }));
    await cancelEvent(c.id);
    expect((await listAdminEvents("proximos")).map((e) => e.title)).toEqual(["Futuro"]);
    expect((await listAdminEvents("passados")).map((e) => e.title)).toEqual(["Passado"]);
    expect((await listAdminEvents("cancelados")).map((e) => e.title)).toEqual(["Cancelado"]);
    expect(await countAdminEventsByScope()).toEqual({ proximos: 1, passados: 1, cancelados: 1 });
  });

  it("excluir o modelo mantém as participações (só perdem a ligação)", async () => {
    const template = await newTemplate();
    const [ev] = await createEvents(eventInput({ templateId: template.id, title: template.name }));
    expect(await deleteTemplate(template.id)).toEqual({ keptEvents: 1 });
    expect(await getAdminEvent(ev.id)).toMatchObject({ templateId: null, title: "Feira de Colecionadores" });
  });
});

describe("aplicar o modelo às próximas datas (passo explícito e seguro)", () => {
  async function setup() {
    const template = await newTemplate();
    const mk = (d: string, over: Record<string, unknown> = {}) =>
      createEvents(eventInput({ templateId: template.id, dates: [d], title: template.name, description: "antiga", location: "Local antigo", startTime: "08:00", endTime: "12:00", ...over }));
    const [future1] = await mk(futureDay(7));
    const [future2] = await mk(futureDay(14));
    const [past] = await mk(futureDay(-7));
    const [cancelled] = await mk(futureDay(21));
    await cancelEvent(cancelled.id);
    await updateTemplate(template.id, eventTemplateInputSchema.parse({ ...templateInput, name: "Nome Novo", description: "Descrição nova", location: "Local novo", defaultStartTime: "10:00", defaultEndTime: "18:00" }));
    return { template, future1, future2, past, cancelled };
  }

  it("só os campos marcados, só nas próximas datas não canceladas", async () => {
    const { template, future1, future2, past, cancelled } = await setup();
    const result = await applyTemplateToUpcoming(template.id, ["location", "times"], 2);
    expect(result.updated).toBe(2);
    for (const id of [future1.id, future2.id]) {
      expect(await getAdminEvent(id)).toMatchObject({ location: "Local novo", startTime: "10:00", endTime: "18:00", title: "Feira de Colecionadores", description: "antiga" });
    }
    expect(await getAdminEvent(past.id)).toMatchObject({ location: "Local antigo", startTime: "08:00" });
    expect(await getAdminEvent(cancelled.id)).toMatchObject({ location: "Local antigo", startTime: "08:00" });
  });

  it("recusa se a lista mudou desde a conferência (nada é alterado)", async () => {
    const { template, future1 } = await setup();
    await expect(applyTemplateToUpcoming(template.id, ["title"], 5)).rejects.toThrow(/mudou/);
    expect(await getAdminEvent(future1.id)).toMatchObject({ title: "Feira de Colecionadores" });
  });

  it("a ação exige confirmação marcada e pelo menos um campo", async () => {
    const admin = await createAdmin();
    browser.token = (await createSession(admin.id, "ADMIN")).token;
    const { template, future1 } = await setup();
    const fd = (extra: Record<string, string | string[]>) => {
      const f = new FormData();
      f.set("templateId", template.id);
      f.set("expectedCount", "2");
      for (const [k, v] of Object.entries(extra)) for (const item of Array.isArray(v) ? v : [v]) f.append(k, item);
      return f;
    };
    expect((await applyTemplateAction({}, fd({ fields: ["title"] }))).ok).toBeFalsy(); // sem confirmar
    expect((await applyTemplateAction({}, fd({ confirm: "on" }))).ok).toBeFalsy(); // sem campos
    expect(await getAdminEvent(future1.id)).toMatchObject({ title: "Feira de Colecionadores" });
    const ok = await applyTemplateAction({}, fd({ confirm: "on", fields: ["title", "description"] }));
    expect(ok.ok).toBe(true);
    expect(await getAdminEvent(future1.id)).toMatchObject({ title: "Nome Novo", description: "Descrição nova", location: "Local antigo" });
  });
});

describe("fotos de eventos", () => {
  const put = (key: string) => new DatabaseStorage().put(key, Buffer.from("x"), "image/webp");
  const has = async (key: string) => (await new DatabaseStorage().get(key)) !== null;

  it("só aceita foto de evento (nunca a foto de produto ou o logo) e chave válida", async () => {
    await expect(createEvents(eventInput({ imageKey: "products/abc.webp" }))).rejects.toThrow(/Foto inválida/);
    await expect(createEvents(eventInput({ imageKey: "branding/abc.webp" }))).rejects.toThrow();
    await expect(createEvents(eventInput({ imageKey: "events/../x.webp" }))).rejects.toThrow();
    await expect(createTemplate(eventTemplateInputSchema.parse({ ...templateInput, imageKey: "products/a.webp" }))).rejects.toThrow();
  });

  it("modelo e participação compartilham a foto: ela só é apagada quando ninguém mais a usa", async () => {
    await put("events/compartilhada.webp");
    const template = await newTemplate({ imageKey: "events/compartilhada.webp" });
    const [ev] = await createEvents(eventInput({ templateId: template.id, imageKey: "events/compartilhada.webp" }));

    await deleteEvent(ev.id);
    expect(await has("events/compartilhada.webp")).toBe(true); // o modelo ainda usa
    await deleteTemplate(template.id);
    expect(await has("events/compartilhada.webp")).toBe(false);
  });

  it("trocar a foto de uma data não apaga a foto do modelo", async () => {
    await put("events/modelo.webp");
    await put("events/so-desta-data.webp");
    const template = await newTemplate({ imageKey: "events/modelo.webp" });
    const [ev] = await createEvents(eventInput({ templateId: template.id, imageKey: "events/modelo.webp" }));
    await updateEvent(ev.id, { date: ev.eventDate, status: "PUBLICADO", title: ev.title, description: "", location: "", startTime: null, endTime: null, imageKey: "events/so-desta-data.webp" });
    expect(await has("events/modelo.webp")).toBe(true);
    // Voltando ao padrão do modelo, a foto exclusiva da data é limpa.
    await updateEvent(ev.id, { date: ev.eventDate, status: "PUBLICADO", title: ev.title, description: "", location: "", startTime: null, endTime: null, imageKey: "events/modelo.webp" });
    expect(await has("events/so-desta-data.webp")).toBe(false);
  });

  it("limpeza: fotos enviadas e abandonadas há mais de 24 h somem; as em uso ficam", async () => {
    await put("events/em-uso.webp");
    await put("events/abandonada.webp");
    await put("events/recente.webp");
    await createEvents(eventInput({ imageKey: "events/em-uso.webp" }));
    const old = new Date(Date.now() - 48 * 3600_000);
    const { storedFiles } = await import("@/server/db/schema");
    await db.update(storedFiles).set({ createdAt: old }).where(eq(storedFiles.key, "events/em-uso.webp"));
    await db.update(storedFiles).set({ createdAt: old }).where(eq(storedFiles.key, "events/abandonada.webp"));
    expect(await cleanupOrphanEventImages(24)).toBe(1);
    expect(await has("events/abandonada.webp")).toBe(false);
    expect(await has("events/em-uso.webp")).toBe(true);
    expect(await has("events/recente.webp")).toBe(true);
    expect(await deleteEventImageIfUnreferenced("products/a.webp")).toBe(false); // nunca mexe em fotos de outros tipos
  });
});

describe("permissões das ações de eventos (todas exigem ADMIN)", () => {
  const form = (fields: Record<string, string | string[]>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
    return fd;
  };

  async function allCalls(eventId: string, templateId: string) {
    const results = [
      await saveEventTemplateAction({}, form({ name: "Hack" })),
      await deleteEventTemplateAction({}, form({ templateId, confirm: "sim" })),
      await createEventsAction({}, form({ title: "Hack", dates: [futureDay(40)], published: "on" })),
      await updateEventAction({}, form({ eventId, date: futureDay(40), status: "PUBLICADO", title: "Hack" })),
      await cancelEventAction({}, form({ eventId })),
      await reactivateEventAction({}, form({ eventId })),
      await deleteEventAction({}, form({ eventId, confirm: "sim" })),
      await applyTemplateAction({}, form({ templateId, expectedCount: "0", confirm: "on", fields: ["title"] })),
    ];
    return results;
  }

  it("visitante e cliente são recusados em TODAS e nada muda no banco", async () => {
    const template = await newTemplate();
    const [ev] = await createEvents(eventInput({ templateId: template.id, title: template.name }));
    for (const who of ["visitante", "cliente"] as const) {
      browser.token = who === "cliente" ? (await createSession((await createUser()).id, "CLIENTE")).token : null;
      const results = await allCalls(ev.id, template.id);
      for (const r of results) expect(r.ok, who).toBeFalsy();
      expect(results.every((r) => /login|permissão/i.test(r.message ?? "")), who).toBe(true);
    }
    expect(await db.select().from(events)).toHaveLength(1);
    expect(await listTemplates()).toHaveLength(1);
    expect(await getAdminEvent(ev.id)).toMatchObject({ status: "PUBLICADO", title: "Feira de Colecionadores" });
  });

  it("administrador cria modelo e participações pelos formulários; valida entradas; exclusão exige confirmação", async () => {
    browser.token = (await createSession((await createAdmin()).id, "ADMIN")).token;

    // Modelo inválido: erros por campo, nada gravado.
    const bad = await saveEventTemplateAction({}, form({ name: "A", startTime: "17:00", endTime: "09:00" }));
    expect(bad.errors).toMatchObject({ name: expect.any(String), endTime: expect.any(String) });
    expect(await listTemplates()).toHaveLength(0);

    // Modelo válido: redireciona para a página do modelo.
    let redirected = "";
    try {
      await saveEventTemplateAction({}, form({ name: "Feira do Parque", description: "d", location: "Parque", startTime: "09:00", endTime: "17:00" }));
    } catch (error) {
      redirected = String((error as { digest?: string }).digest);
    }
    expect(redirected).toContain("/admin/eventos/modelos/");
    const [template] = await listTemplates();
    expect(template).toMatchObject({ name: "Feira do Parque", defaultStartTime: "09:00" });

    // Duas datas de uma vez a partir do modelo.
    try {
      await createEventsAction({}, form({ templateId: template.id, title: "Feira do Parque", description: "d", location: "Parque", startTime: "09:00", endTime: "17:00", dates: [futureDay(7), futureDay(14), ""], published: "on" }));
    } catch (error) {
      redirected = String((error as { digest?: string }).digest);
    }
    expect(redirected).toContain("/admin/eventos?criado=2");
    expect(await db.select().from(events)).toHaveLength(2);

    // Data inválida e sem data: erro no campo "dates".
    const noDate = await createEventsAction({}, form({ title: "Sem data", dates: [""], published: "on" }));
    expect(noDate.errors?.dates).toBeTruthy();
    const badDate = await createEventsAction({}, form({ title: "Data ruim", dates: ["2026-02-30"], published: "on" }));
    expect(badDate.errors?.dates).toBeTruthy();

    // Excluir sem confirmar não apaga.
    const [ev] = await db.select().from(events).orderBy(events.eventDate);
    expect((await deleteEventAction({}, form({ eventId: ev.id }))).ok).toBeFalsy();
    expect(await db.select().from(events)).toHaveLength(2);
    redirected = "";
    try {
      await deleteEventAction({}, form({ eventId: ev.id, confirm: "sim" }));
    } catch (error) {
      redirected = String((error as { digest?: string }).digest);
    }
    expect(redirected).toContain("/admin/eventos?excluido=1");
    expect(await db.select().from(events)).toHaveLength(1);

    // Excluir modelo exige confirmação e preserva as participações.
    expect((await deleteEventTemplateAction({}, form({ templateId: template.id }))).ok).toBeFalsy();
    try {
      await deleteEventTemplateAction({}, form({ templateId: template.id, confirm: "sim" }));
    } catch (error) {
      redirected = String((error as { digest?: string }).digest);
    }
    expect(redirected).toContain("/admin/eventos/modelos?excluido=1");
    expect(await db.select().from(events)).toHaveLength(1);
    expect(await listTemplates()).toHaveLength(0);
  });

  it("identificadores malformados são recusados com mensagem segura (sem erro técnico)", async () => {
    browser.token = (await createSession((await createAdmin()).id, "ADMIN")).token;
    const r = await cancelEventAction({}, form({ eventId: "'; DROP TABLE events; --" }));
    expect(r.ok).toBeFalsy();
    expect(r.message).toBe("Evento inválido.");
  });
});
