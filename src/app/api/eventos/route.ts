import { NextResponse } from "next/server";
import { isMonthInPublicWindow, isValidMonthKey } from "@/lib/events";
import { listPublicEventsInMonth } from "@/server/services/events";

export const dynamic = "force-dynamic";

/**
 * Eventos publicados de um mês: GET /api/eventos?mes=AAAA-MM
 * Só devolve eventos PUBLICADOS (rascunhos e cancelados nunca saem daqui) e só meses dentro da janela do calendário.
 * O navegador e a rede de distribuição podem guardar a resposta por 30 s; por isso uma mudança no painel aparece em até ~1 minuto, sem publicar o site.
 */
export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("mes") ?? "";
  if (!isValidMonthKey(month) || !isMonthInPublicWindow(month)) {
    return NextResponse.json({ error: "Mês inválido." }, { status: 400, headers: { "cache-control": "public, max-age=60" } });
  }

  // Sem limite por IP de propósito: é uma consulta pequena, por índice, limitada a uma janela de meses e guardada em cache.
  // (Um limite em memória, por visitante, sem proxy confiável, acabaria bloqueando todo mundo junto.)
  const events = await listPublicEventsInMonth(month);
  const cache = "public, max-age=15, s-maxage=30, stale-while-revalidate=60";
  return NextResponse.json({ month, events }, { headers: { "cache-control": cache, "netlify-cdn-cache-control": "public, s-maxage=30, stale-while-revalidate=60" } });
}
