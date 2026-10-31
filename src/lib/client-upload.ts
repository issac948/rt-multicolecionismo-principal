import { ImagePrepareError, prepareImageForUpload } from "./client-image";

export type UploadKind = "product" | "logo" | "event";

/** Envia uma foto ao painel (reduzindo antes) e devolve o JSON da resposta ou uma mensagem de erro em português. */
export async function uploadAdminImage<T extends object>(file: File, kind: UploadKind): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  let prepared: File;
  try {
    prepared = await prepareImageForUpload(file);
  } catch (error) {
    return { ok: false, error: error instanceof ImagePrepareError ? error.message : "Não foi possível preparar a foto." };
  }

  try {
    const body = new FormData();
    body.append("file", prepared);
    const response = await fetch(kind === "product" ? "/api/admin/upload" : `/api/admin/upload?kind=${kind}`, { method: "POST", body });
    if (response.status === 413) return { ok: false, error: "A foto é grande demais para o servidor. Use uma foto menor." };
    const json = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response.ok || !json) return { ok: false, error: json?.error ?? "Não foi possível enviar a foto." };
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: "Falha de conexão ao enviar a foto. Confira a internet e tente de novo." };
  }
}
