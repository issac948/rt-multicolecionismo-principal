import { NextResponse } from "next/server";
import { processPaymentWebhook } from "@/server/services/payments";

export const dynamic = "force-dynamic";

/**
 * Endereço que o Mercado Pago chama quando um pagamento muda de estado.
 * A assinatura é verificada e o pagamento é consultado na API do Mercado Pago antes de
 * qualquer alteração (ver services/payments.ts). O conteúdo do corpo não é usado para decidir nada.
 */
export async function POST(request: Request) {
  const result = await processPaymentWebhook({ headers: request.headers, url: new URL(request.url), body: await request.text() });
  return NextResponse.json({ ok: result.status === 200, outcome: result.outcome }, { status: result.status });
}
