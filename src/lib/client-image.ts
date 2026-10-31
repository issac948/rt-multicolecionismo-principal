/**
 * Preparação de fotos NO NAVEGADOR antes de enviar. Fotos de celular têm 3 a 10 MB; hospedagens como o Netlify
 * recusam envios acima de ~4,5 MB e, além disso, enviar menos dados é bem mais rápido em rede móvel.
 * O servidor continua validando e reprocessando tudo: isto é só uma economia de banda, nunca uma garantia de segurança.
 */

/** Maior lado (em pixels) enviado ao servidor. O servidor reduz de novo para o tamanho final. */
export const CLIENT_MAX_SIDE = 2000;
/** Tamanho-alvo do arquivo enviado. */
export const CLIENT_TARGET_BYTES = 2 * 1024 * 1024;
/** Acima disto, mesmo sem conseguir reduzir, o arquivo é recusado antes do envio (limite da hospedagem). */
export const CLIENT_HARD_LIMIT_BYTES = 4 * 1024 * 1024;
/** Arquivos pequenos e já leves seguem como estão. */
const SKIP_BELOW_BYTES = 800 * 1024;

/** Calcula o tamanho reduzido mantendo a proporção. Nunca aumenta a imagem. */
export function computeTargetSize(width: number, height: number, maxSide: number = CLIENT_MAX_SIDE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Qualidades JPEG tentadas, da melhor para a mais leve, até caber no tamanho-alvo. */
export const QUALITY_STEPS = [0.86, 0.78, 0.7, 0.6] as const;

export class ImagePrepareError extends Error {}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Devolve o arquivo reduzido (JPEG) quando necessário. Se o navegador não conseguir ler a foto (ex.: formato raro),
 * envia a original quando couber no limite da hospedagem, ou explica o problema.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  const isAnimatedCandidate = file.type === "image/gif";
  if (isAnimatedCandidate || file.size <= SKIP_BELOW_BYTES) {
    if (file.size > CLIENT_HARD_LIMIT_BYTES) throw new ImagePrepareError("A foto é grande demais. Reduza-a e tente de novo.");
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = computeTargetSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("sem canvas");
    // Fundo branco: PNG com transparência viraria preto ao salvar em JPEG.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    let best: Blob | null = null;
    for (const quality of QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, quality);
      if (!blob) break;
      best = blob;
      if (blob.size <= CLIENT_TARGET_BYTES) break;
    }
    if (best && best.size < file.size) {
      if (best.size > CLIENT_HARD_LIMIT_BYTES) throw new ImagePrepareError("A foto continua grande demais mesmo reduzida. Use outra foto.");
      const name = file.name.replace(/\.[^.]+$/, "") || "foto";
      return new File([best], `${name}.jpg`, { type: "image/jpeg" });
    }
  } catch (error) {
    if (error instanceof ImagePrepareError) throw error;
    // Navegador sem suporte ou foto ilegível: tenta enviar a original.
  }

  if (file.size > CLIENT_HARD_LIMIT_BYTES) {
    throw new ImagePrepareError("Não foi possível reduzir esta foto. Use uma foto menor (JPG ou PNG) e tente de novo.");
  }
  return file;
}
