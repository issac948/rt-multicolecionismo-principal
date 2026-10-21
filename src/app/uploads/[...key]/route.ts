import { getStorage, isValidStorageKey } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Serve as imagens enviadas pelo painel. Só chaves no formato esperado são aceitas. */
export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await context.params;
  const key = segments.join("/");

  if (!isValidStorageKey(key)) return new Response("Não encontrado", { status: 404 });

  const file = await getStorage().get(key);
  if (!file) return new Response("Não encontrado", { status: 404 });

  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      // O nome do arquivo é um UUID: o conteúdo nunca muda, então pode ficar em cache por muito tempo.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
