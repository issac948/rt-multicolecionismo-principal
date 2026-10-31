import { NextResponse } from "next/server";
import { csvTemplate } from "@/lib/product-csv";
import { assertRole } from "@/server/auth/authorize";
import { getCurrentUser } from "@/server/auth/current-user";
import { AuthError } from "@/server/errors";

export const dynamic = "force-dynamic";

/** Planilha modelo: só a linha de títulos, nenhum produto de exemplo. Somente ADMIN. */
export async function GET() {
  try {
    assertRole(await getCurrentUser(), "ADMIN");
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  return new NextResponse(csvTemplate(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="modelo-produtos.csv"',
      "cache-control": "no-store",
    },
  });
}
