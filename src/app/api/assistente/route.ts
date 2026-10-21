import { NextResponse } from "next/server";
import { getAiProvider } from "@/server/ai";
import { MAX_HISTORY_TURNS, MAX_QUESTION_CHARS, askShopAssistant, type ChatTurn } from "@/server/ai/shop-assistant";
import { getEnv } from "@/server/env";
import { isSameOrigin } from "@/server/security/origin";
import { checkRateLimit, clientIpFromHeaders } from "@/server/security/rate-limit";
import { getSettings } from "@/server/services/settings";
import { fileUrl } from "@/server/storage";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;
const TEN_MINUTES = 10 * 60_000;
const ONE_DAY = 24 * 60 * 60_000;

function parseHistory(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  const turns: ChatTurn[] = [];
  for (const item of value.slice(-MAX_HISTORY_TURNS)) {
    const turn = item as { role?: unknown; text?: unknown };
    if ((turn.role === "user" || turn.role === "assistant") && typeof turn.text === "string") {
      turns.push({ role: turn.role, text: turn.text.slice(0, MAX_QUESTION_CHARS) });
    }
  }
  return turns;
}

/**
 * Assistente de compras da vitrine (cliente). Sem login, então as defesas são: mesma origem, limite por IP (ou global),
 * teto diário (protege o gasto com a IA), tamanho máximo de pergunta e histórico, e respostas só com dados reais do banco.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });

  const settings = await getSettings();
  const provider = getAiProvider();
  if (!settings.shopAssistantEnabled || !provider.isConfigured()) {
    return NextResponse.json({ error: "O assistente não está disponível no momento." }, { status: 404 });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: "Requisição muito grande." }, { status: 413 });

  let question = "";
  let history: ChatTurn[] = [];
  try {
    const body = (await request.json()) as { question?: unknown; history?: unknown };
    question = typeof body.question === "string" ? body.question.trim() : "";
    history = parseHistory(body.history);
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  if (!question) return NextResponse.json({ error: "Escreva a sua pergunta." }, { status: 400 });
  if (question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json({ error: `A pergunta é longa demais (máximo ${MAX_QUESTION_CHARS} caracteres).` }, { status: 400 });
  }

  const env = getEnv();
  const ip = clientIpFromHeaders(request.headers, env.trustProxy);
  const perVisitor = ip ? checkRateLimit(`assistente:ip:${ip}`, 12, TEN_MINUTES) : checkRateLimit("assistente:anon", 60, TEN_MINUTES);
  if (!perVisitor.ok) {
    return NextResponse.json(
      { error: "Muitas perguntas seguidas. Aguarde alguns minutos ou fale com a loja pelo WhatsApp." },
      { status: 429, headers: { "Retry-After": String(perVisitor.retryAfterSeconds) } },
    );
  }
  const daily = checkRateLimit("assistente:dia", env.ai.shopDailyLimit, ONE_DAY);
  if (!daily.ok) {
    return NextResponse.json({ error: "O assistente atingiu o limite de hoje. Fale com a loja pelo WhatsApp." }, { status: 429, headers: { "Retry-After": String(daily.retryAfterSeconds) } });
  }

  try {
    const reply = await askShopAssistant({ question, history }, { provider, settings });
    return NextResponse.json({
      answer: reply.answer,
      needsHuman: reply.needsHuman,
      products: reply.products.map((p) => ({
        slug: p.slug,
        name: p.name,
        priceText: p.priceText,
        availability: p.availability,
        href: `/produtos/${p.slug}`,
        imageUrl: fileUrl(p.imageThumbKey),
      })),
    });
  } catch (error) {
    // Detalhes técnicos (chave recusada, serviço fora do ar...) só no log; o cliente recebe uma frase simples.
    console.error("[assistente] erro ao responder:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "O assistente não conseguiu responder agora. Fale com a loja pelo WhatsApp.", needsHuman: true }, { status: 502 });
  }
}
