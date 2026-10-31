import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/current-user";
import { assertRole } from "@/server/auth/authorize";
import { AppError, AuthError } from "@/server/errors";
import { isSameOrigin } from "@/server/security/origin";
import { checkRateLimit } from "@/server/security/rate-limit";
import { MAX_UPLOAD_BYTES, saveEventImage, saveLogoImage, saveProductImage } from "@/server/storage/images";

export const dynamic = "force-dynamic";

/** Upload de imagens pelo painel (fotos de produto, de evento e logo). Somente ADMIN. */
export async function POST(request: Request) {
  try {
    // Proteção CSRF: a requisição precisa vir do próprio site.
    if (!isSameOrigin(request)) throw new AuthError(403, "Origem não permitida.");
    const admin = assertRole(await getCurrentUser(), "ADMIN");

    const limit = checkRateLimit(`upload:${admin.id}`, 60, 60_000);
    if (!limit.ok) return NextResponse.json({ error: "Muitos envios seguidos. Aguarde um minuto." }, { status: 429 });

    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES + 1024 * 1024) {
      return NextResponse.json({ error: "A imagem é muito grande (máximo 8 MB)." }, { status: 413 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "A imagem é muito grande (máximo 8 MB)." }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const kind = new URL(request.url).searchParams.get("kind");
    if (kind === "logo") {
      const logo = await saveLogoImage(buffer);
      return NextResponse.json({ key: logo.key, url: logo.url });
    }
    if (kind === "event") {
      const photo = await saveEventImage(buffer);
      return NextResponse.json({ key: photo.key, url: photo.url });
    }

    const image = await saveProductImage(buffer);
    return NextResponse.json(image);
  } catch (error) {
    if (error instanceof AppError) {
      const message = "fieldErrors" in error ? Object.values((error as { fieldErrors: Record<string, string> }).fieldErrors)[0] : error.message;
      return NextResponse.json({ error: message ?? error.message }, { status: error.status });
    }
    console.error("[upload] erro inesperado:", error);
    return NextResponse.json({ error: "Não foi possível enviar a imagem." }, { status: 500 });
  }
}
