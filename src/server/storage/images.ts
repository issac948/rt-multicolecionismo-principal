import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db";
import { productImages } from "../db/schema";
import { ValidationError } from "../errors";
import { getStorage } from "./index";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);

type Processed = { large: Buffer; thumb: Buffer; width: number; height: number };

/**
 * Valida e reprocessa a imagem. O arquivo enviado NUNCA é guardado como veio:
 * ele é decodificado e regravado como WebP, o que descarta metadados (EXIF/GPS) e
 * qualquer conteúdo que não seja realmente uma imagem.
 */
async function processImage(input: Buffer, largeSide: number, thumbSide: number): Promise<Processed> {
  if (input.length === 0) throw new ValidationError({ file: "Arquivo vazio." });
  if (input.length > MAX_UPLOAD_BYTES) {
    throw new ValidationError({ file: "A imagem é muito grande (máximo 8 MB)." });
  }

  try {
    const base = sharp(input, { limitInputPixels: 40_000_000, failOn: "error" }).rotate();
    const meta = await base.metadata();
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
      throw new ValidationError({ file: "Formato não suportado. Envie JPG, PNG, WebP ou GIF." });
    }

    const large = await base
      .clone()
      .resize({ width: largeSide, height: largeSide, fit: "inside", withoutEnlargement: true })
      // smartSubsample mantém o contraste de cor nas bordas (vermelho/branco das pinturas), custa ~5% a mais de espaço.
      .webp({ quality: 80, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
    const thumb = await base
      .clone()
      .resize({ width: thumbSide, height: thumbSide, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 76, smartSubsample: true })
      .toBuffer();

    return { large: large.data, thumb, width: large.info.width, height: large.info.height };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError({ file: "Não foi possível ler esta imagem. Envie outro arquivo." });
  }
}

export type SavedProductImage = { id: string; url: string; thumbUrl: string; width: number; height: number };

/** Salva uma foto de produto. Ela fica "solta" (sem produto) até o formulário ser salvo. */
export async function saveProductImage(input: Buffer): Promise<SavedProductImage> {
  const { large, thumb, width, height } = await processImage(input, 1400, 560);
  const storage = getStorage();
  const id = randomUUID();
  const storageKey = `products/${id}.webp`;
  const thumbKey = `products/${id}-thumb.webp`;

  // Se QUALQUER passo falhar (espaço esgotado na segunda foto, erro no banco), nada fica pela metade guardado.
  try {
    await storage.put(storageKey, large, "image/webp");
    await storage.put(thumbKey, thumb, "image/webp");
    await db.insert(productImages).values({ id, storageKey, thumbKey, width, height, position: 0 });
  } catch (error) {
    await Promise.allSettled([storage.delete(storageKey), storage.delete(thumbKey)]);
    throw error;
  }

  return { id, url: storage.publicUrl(storageKey), thumbUrl: storage.publicUrl(thumbKey), width, height };
}

/** Salva o logo da loja e devolve a chave do arquivo (guardada nas configurações). */
export async function saveLogoImage(input: Buffer): Promise<{ key: string; url: string }> {
  const { large } = await processImage(input, 600, 200);
  const storage = getStorage();
  const key = `branding/${randomUUID()}.webp`;
  await storage.put(key, large, "image/webp");
  return { key, url: storage.publicUrl(key) };
}

/** Salva a foto de um evento/modelo e devolve só a chave (guardada na própria linha do evento). */
export async function saveEventImage(input: Buffer): Promise<{ key: string; url: string; width: number; height: number }> {
  const { large, width, height } = await processImage(input, 1200, 480);
  const storage = getStorage();
  const key = `events/${randomUUID()}.webp`;
  await storage.put(key, large, "image/webp");
  return { key, url: storage.publicUrl(key), width, height };
}

/** Apaga os arquivos de imagens (usado depois que as linhas do banco já foram removidas). */
export async function deleteImageFiles(images: Array<{ storageKey: string; thumbKey: string }>): Promise<void> {
  const storage = getStorage();
  await Promise.allSettled(images.flatMap((img) => [storage.delete(img.storageKey), storage.delete(img.thumbKey)]));
}

/** Remove fotos enviadas há mais de `olderThanHours` horas que nunca foram ligadas a um produto. */
export async function cleanupOrphanImages(olderThanHours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const rows = await db.query.productImages.findMany({
    where: (t, { and, isNull, lt }) => and(isNull(t.productId), lt(t.createdAt, cutoff)),
  });
  for (const row of rows) {
    await db.delete(productImages).where(eq(productImages.id, row.id));
  }
  await deleteImageFiles(rows);
  return rows.length;
}
