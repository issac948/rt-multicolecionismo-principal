import { getStorage, isValidStorageKey } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Cabeçalhos comuns: o nome do arquivo é um UUID e o conteúdo nunca muda, então pode ficar em cache por muito tempo. */
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
  // Pede à rede de distribuição do Netlify para guardar a foto: assim ela não precisa abrir a função (nem ler o banco) a cada visita.
  "Netlify-CDN-Cache-Control": "public, durable, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
};

/** Serve as imagens enviadas pelo painel. Só chaves no formato esperado são aceitas. */
export async function GET(request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await context.params;
  const key = segments.join("/");

  if (!isValidStorageKey(key)) return new Response("Não encontrado", { status: 404 });

  // O conteúdo de uma chave nunca muda: se o navegador já tem a foto, responde 304 sem ler o armazenamento.
  const etag = `"${key}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, ...CACHE_HEADERS } });
  }

  const file = await getStorage().get(key);
  if (!file) return new Response("Não encontrado", { status: 404, headers: { "Cache-Control": "public, max-age=30" } });

  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.data.length),
      ETag: etag,
      ...CACHE_HEADERS,
    },
  });
}
