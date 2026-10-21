import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getEnv } from "@/server/env";
import { runMaintenance } from "@/server/services/maintenance";

export const dynamic = "force-dynamic";

function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: Request) {
  const { cronSecret } = getEnv();
  // Sem segredo configurado a rota fica desligada (nunca aberta ao público).
  if (cronSecret.length < 16) {
    return NextResponse.json({ error: "CRON_SECRET não configurado." }, { status: 503 });
  }
  if (!authorized(request, cronSecret)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, report: await runMaintenance() });
}

export const GET = handle;
export const POST = handle;
