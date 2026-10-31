import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { monthKeyOf, todayIso } from "@/lib/events";
import { db } from "@/server/db";
import { isUndefinedTableError } from "@/server/db/errors";
import { getPublicEvent, hasUpcomingPublicEvents, listPublicEventsInMonth, listUpcomingPublicEvents } from "@/server/services/events";

/**
 * Site novo publicado ANTES de aplicar a migração 0005: a vitrine (página inicial, /eventos e /api/eventos) tem de continuar
 * abrindo, só sem eventos. Só o erro "tabela não existe" é tolerado; qualquer outro erro continua sendo um erro.
 */
describe("tabela de eventos ainda não migrada", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reconhece o erro 42P01 do PostgreSQL, mesmo embrulhado pelo drizzle", () => {
    expect(isUndefinedTableError({ code: "42P01" })).toBe(true);
    expect(isUndefinedTableError(new Error("Failed query", { cause: { code: "42P01" } }))).toBe(true);
    expect(isUndefinedTableError(new Error("a", { cause: new Error("b", { cause: { code: "42P01" } }) }))).toBe(true);
  });

  it("não confunde com outros erros", () => {
    expect(isUndefinedTableError({ code: "23505" })).toBe(false);
    expect(isUndefinedTableError(new Error("boom"))).toBe(false);
    expect(isUndefinedTableError(null)).toBe(false);
    expect(isUndefinedTableError("42P01")).toBe(false);
    const loop: { cause?: unknown } = {};
    loop.cause = loop;
    expect(isUndefinedTableError(loop)).toBe(false);
  });

  it("sem a tabela de eventos, as consultas públicas devolvem vazio em vez de falhar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await db.execute(sql`ALTER TABLE events RENAME TO events_fora_do_ar`);
    try {
      expect(await listUpcomingPublicEvents(4)).toEqual([]);
      expect(await listPublicEventsInMonth(monthKeyOf(todayIso()))).toEqual([]);
      expect(await hasUpcomingPublicEvents()).toBe(false);
      expect(await getPublicEvent("00000000-0000-4000-8000-000000000000")).toBeNull();
    } finally {
      await db.execute(sql`ALTER TABLE events_fora_do_ar RENAME TO events`);
    }
    // com a tabela de volta, tudo funciona normalmente
    expect(await listUpcomingPublicEvents(4)).toEqual([]);
  });
});
