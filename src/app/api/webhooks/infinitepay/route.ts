import { NextResponse } from "next/server";
import { processPaymentWebhook } from "@/server/services/payments";

export const dynamic = "force-dynamic";

/**
 * Endereço que o InfinitePay chama quando um pagamento é feito (o endereço completo, com o segredo, é enviado a cada pedido).
 * Formato de resposta pedido pelo InfinitePay: 200 {"success": true, "message": null}; erro temporário = 400 (ele tenta de novo).
 * O corpo não decide nada: o pagamento é conferido na API do InfinitePay antes de qualquer alteração.
 */
export async function POST(request: Request) {
  const result = await processPaymentWebhook({ headers: request.headers, url: new URL(request.url), body: await request.text() });
  if (result.status === 200) return NextResponse.json({ success: true, message: null });
  // 401/503 = segredo errado ou não configurado (não adianta tentar de novo); o resto é falha temporária: 400 faz o InfinitePay repetir.
  const status = result.status === 401 || result.status === 503 ? result.status : 400;
  return NextResponse.json({ success: false, message: result.outcome }, { status });
}
