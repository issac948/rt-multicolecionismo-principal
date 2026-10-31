import { NextResponse } from "next/server";
import { assertRole } from "@/server/auth/authorize";
import { getCurrentUser } from "@/server/auth/current-user";
import { AuthError } from "@/server/errors";
import { isValidMonthKey } from "@/lib/events";
import { listAdminEventsInMonth } from "@/server/services/events";

export const dynamic = "force-dynamic";

/** Eventos de um mês para o calendário do painel (todos os status). Somente ADMIN; nunca é guardada em cache. */
export async function GET(request: Request) {
  try {
    assertRole(await getCurrentUser(), "ADMIN");
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
    throw error;
  }
  const month = new URL(request.url).searchParams.get("mes") ?? "";
  if (!isValidMonthKey(month)) return NextResponse.json({ error: "Mês inválido." }, { status: 400, headers: { "cache-control": "no-store" } });
  const events = await listAdminEventsInMonth(month);
  return NextResponse.json({ month, events }, { headers: { "cache-control": "no-store" } });
}
