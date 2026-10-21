import { NextResponse } from "next/server";
import { onlyDigits } from "@/lib/text";
import { getRequestCart } from "@/server/cart-session";
import { getEnv } from "@/server/env";
import { isSameOrigin } from "@/server/security/origin";
import { checkRateLimit, clientIpFromHeaders } from "@/server/security/rate-limit";
import { getShippingQuote } from "@/server/shipping";
import { cartToQuoteItems } from "@/server/shipping/cart-items";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;

/**
 * Cotação de frete pelo CEP para o carrinho da pessoa (visitante ou logada).
 * Recebe só o CEP; produtos, pesos e preços vêm do banco. Devolve apenas as opções de ENTREGA
 * (a retirada em mãos não depende de CEP e o checkout já a conhece).
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });

  // Limite por IP (quando o proxy é confiável) ou global; evita que alguém use a loja para martelar a SuperFrete.
  const ip = clientIpFromHeaders(request.headers, getEnv().trustProxy);
  const limit = ip ? checkRateLimit(`frete:ip:${ip}`, 30, 10 * 60_000) : checkRateLimit("frete:global", 300, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Muitas consultas seguidas. Aguarde alguns minutos." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: "Requisição muito grande." }, { status: 413 });

  let cep = "";
  try {
    const body = (await request.json()) as { cep?: unknown };
    cep = typeof body.cep === "string" ? onlyDigits(body.cep) : "";
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  if (cep.length !== 8) return NextResponse.json({ error: "CEP inválido. Digite os 8 números." }, { status: 400 });

  const cart = await getRequestCart();
  if (cart.lines.length === 0) return NextResponse.json({ error: "Seu carrinho está vazio." }, { status: 409 });

  const byCart = checkRateLimit(`frete:cart:${cart.cartId}`, 20, 10 * 60_000);
  if (!byCart.ok) {
    return NextResponse.json({ error: "Muitas consultas seguidas. Aguarde alguns minutos." }, { status: 429, headers: { "Retry-After": String(byCart.retryAfterSeconds) } });
  }

  try {
    const result = await getShippingQuote({ subtotalCents: cart.subtotalCents, destinationCep: cep, items: cartToQuoteItems(cart) });
    return NextResponse.json({
      options: result.options.filter((o) => o.requiresAddress),
      notice: result.notice,
      source: result.source,
    });
  } catch (error) {
    console.error("[frete] erro inesperado:", error);
    return NextResponse.json({ error: "Não foi possível calcular o frete agora." }, { status: 500 });
  }
}
