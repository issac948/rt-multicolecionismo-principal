import { NextResponse } from "next/server";
import { UUID_RE } from "@/lib/schemas";
import { getEnv } from "@/server/env";
import { confirmPaymentOnReturn } from "@/server/services/payments";

export const dynamic = "force-dynamic";

/**
 * Para onde o PayPal (ou o InfinitePay) devolve o cliente depois do pagamento.
 * Aqui a LOJA pede a cobrança e consulta o resultado direto no PayPal; só então o pedido pode virar "pago".
 * Ter chegado nesta página não prova pagamento nenhum.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = getEnv().siteUrl;
  if (!UUID_RE.test(id)) return NextResponse.redirect(new URL("/meus-pedidos", base));

  let outcome: string;
  try {
    outcome = await confirmPaymentOnReturn(id, new URL(request.url).searchParams);
  } catch (error) {
    console.error("[retorno] erro ao confirmar pagamento:", error instanceof Error ? error.message : error);
    outcome = "unavailable";
  }
  return NextResponse.redirect(new URL(`/pedido/${id}?retorno=${encodeURIComponent(outcome)}`, base));
}
