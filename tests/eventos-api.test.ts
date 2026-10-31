import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { GET as adminEventsGet } from "@/app/api/admin/eventos/route";
import { GET as publicEventsGet } from "@/app/api/eventos/route";
import { addDaysIso, monthKeyOf, shiftMonth, todayIso } from "@/lib/events";
import { createSession } from "@/server/auth/session";
import { events } from "@/server/db/schema";
import { cancelEvent, createEvents } from "@/server/services/events";
import { eventCreateSchema } from "@/lib/event-schemas";
import { eq } from "drizzle-orm";
import { createAdmin, createUser, db, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  browser.token = null;
});
afterEach(() => vi.restoreAllMocks());

const today = todayIso();
const month = monthKeyOf(today);
const inMonth = (n: number) => `${month}-${String(n).padStart(2, "0")}`;

async function seed(title: string, date: string, published = true) {
  const [row] = await createEvents(eventCreateSchema.parse({ dates: [date], title, description: "d", location: "Local", startTime: "09:00", endTime: "12:00", published }));
  return row;
}

const call = (handler: (r: Request) => Promise<Response>, mes?: string) =>
  handler(new Request(`http://localhost:3000/api/eventos${mes === undefined ? "" : `?mes=${mes}`}`));

describe("addDaysIso", () => {
  it("soma e subtrai dias atravessando mês e ano", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysIso("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysIso("2026-10-24", 7)).toBe("2026-10-31");
  });
});

describe("GET /api/eventos (público)", () => {
  it("devolve só eventos PUBLICADOS do mês, sem campos internos", async () => {
    await seed("Publicado", inMonth(10));
    await seed("Rascunho", inMonth(11), false);
    const cancelled = await seed("Cancelado", inMonth(12));
    await cancelEvent(cancelled.id);

    const response = await call(publicEventsGet, month);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { month: string; events: Array<Record<string, unknown>> };
    expect(body.month).toBe(month);
    expect(body.events.map((e) => e.title)).toEqual(["Publicado"]);
    expect(Object.keys(body.events[0]).sort()).toEqual(["date", "description", "endTime", "id", "imageUrl", "location", "startTime", "title"]);
    expect(JSON.stringify(body)).not.toMatch(/RASCUNHO|CANCELADO|status|templateId/);
  });

  it("rejeita mês inválido ou fora da janela do calendário (nada de varredura infinita)", async () => {
    for (const bad of [undefined, "", "2026-13", "abc", "2026-1", "1999-01", shiftMonth(month, 25), shiftMonth(month, -13), "2026-10'; DROP TABLE events;--"]) {
      const response = await call(publicEventsGet, bad);
      expect(response.status, String(bad)).toBe(400);
    }
    expect((await call(publicEventsGet, shiftMonth(month, 24))).status).toBe(200);
    expect((await call(publicEventsGet, shiftMonth(month, -12))).status).toBe(200);
  });

  it("deixa a rede guardar a resposta por pouco tempo (a mudança no painel aparece em ~1 minuto, sem novo deploy)", async () => {
    const response = await call(publicEventsGet, month);
    expect(response.headers.get("cache-control")).toMatch(/s-maxage=30/);
    expect(response.headers.get("netlify-cdn-cache-control")).toMatch(/s-maxage=30/);
  });

  it("evento novo e evento cancelado aparecem/somem na próxima consulta, sem nada além do banco", async () => {
    expect(((await (await call(publicEventsGet, month)).json()) as { events: unknown[] }).events).toHaveLength(0);
    const row = await seed("Novo", inMonth(15));
    expect(((await (await call(publicEventsGet, month)).json()) as { events: unknown[] }).events).toHaveLength(1);
    await cancelEvent(row.id);
    expect(((await (await call(publicEventsGet, month)).json()) as { events: unknown[] }).events).toHaveLength(0);
    await db.update(events).set({ status: "PUBLICADO" }).where(eq(events.id, row.id));
    expect(((await (await call(publicEventsGet, month)).json()) as { events: unknown[] }).events).toHaveLength(1);
  });
});

describe("GET /api/admin/eventos (somente ADMIN)", () => {
  it("visitante recebe 401 e cliente 403, sem cache", async () => {
    await seed("Rascunho secreto", inMonth(10), false);
    const anon = await call(adminEventsGet, month);
    expect(anon.status).toBe(401);
    expect(anon.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await anon.json())).not.toContain("secreto");

    browser.token = (await createSession((await createUser()).id, "CLIENTE")).token;
    const customer = await call(adminEventsGet, month);
    expect(customer.status).toBe(403);
    expect(JSON.stringify(await customer.json())).not.toContain("secreto");
  });

  it("administrador vê todos os status do mês, incluindo rascunho e cancelado", async () => {
    await seed("Publicado", inMonth(10));
    await seed("Rascunho", inMonth(11), false);
    await cancelEvent((await seed("Cancelado", inMonth(12))).id);
    browser.token = (await createSession((await createAdmin()).id, "ADMIN")).token;

    const response = await call(adminEventsGet, month);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { events: Array<{ title: string; status: string }> };
    expect(body.events.map((e) => `${e.title}:${e.status}`)).toEqual(["Publicado:PUBLICADO", "Rascunho:RASCUNHO", "Cancelado:CANCELADO"]);
    expect((await call(adminEventsGet, "lixo")).status).toBe(400);
  });
});
