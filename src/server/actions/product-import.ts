"use server";

import { revalidatePath } from "next/cache";
import { formBool, formString } from "@/lib/forms";
import { CSV_MAX_BYTES, decodeCsvBytes, type ImportRow } from "@/lib/product-csv";
import { requireAdminAction } from "../auth/current-user";
import { BusinessRuleError, ValidationError } from "../errors";
import { checkRateLimit } from "../security/rate-limit";
import { commitProductImport, previewProductImport } from "../services/product-import";
import { failure, type FormState } from "./shared";

export type ImportPreview = {
  fileName: string;
  fatal?: string;
  delimiter?: string;
  recognizedColumns: string[];
  ignoredColumns: string[];
  rows: ImportRow[];
  ok: number;
  failed: number;
  truncated: boolean;
};

export type ImportFormState = FormState & {
  preview?: ImportPreview;
  imported?: { created: number; skipped: number; published: boolean };
};

async function readFile(fd: FormData): Promise<{ text: string; name: string }> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ValidationError({ file: "Escolha o arquivo da planilha (.csv)." });
  if (file.size > CSV_MAX_BYTES) throw new ValidationError({ file: "A planilha é grande demais (máximo 1 MB). Divida em arquivos menores." });
  if (!/\.(csv|txt)$/i.test(file.name)) throw new ValidationError({ file: "Envie um arquivo .csv. No Excel: Salvar como > CSV UTF-8." });
  return { text: decodeCsvBytes(await file.arrayBuffer()), name: file.name };
}

async function buildPreview(text: string, fileName: string): Promise<ImportPreview> {
  const { inputs: _inputs, ...rest } = await previewProductImport(text);
  void _inputs;
  return { ...rest, fileName };
}

/**
 * Dois passos no mesmo formulário: "Conferir" (só lê e mostra a prévia, não grava nada) e "Importar"
 * (confere de novo no servidor e só então grava os produtos corretos). Somente ADMIN.
 */
export async function importProductsAction(_prev: ImportFormState, fd: FormData): Promise<ImportFormState> {
  try {
    const admin = await requireAdminAction();
    if (!checkRateLimit(`import:${admin.id}`, 20, 60_000).ok) throw new BusinessRuleError("Muitas tentativas seguidas. Aguarde um minuto.");
    const { text, name } = await readFile(fd);
    const intent = formString(fd, "intent");

    if (intent === "import") {
      // Se algo impedir a importação (falta de confirmação, planilha mudou...), a prévia volta junto,
      // para a pessoa corrigir sem perder a conferência.
      const withPreview = async (extra: ImportFormState): Promise<ImportFormState> => ({ ...extra, preview: await buildPreview(text, name) });
      if (!formBool(fd, "confirm")) return withPreview({ errors: { confirm: "Marque a caixa para confirmar a importação." }, message: "Falta a confirmação." });
      const expected = Number(formString(fd, "expectedCount"));
      if (!Number.isInteger(expected) || expected < 1) throw new BusinessRuleError("Confira a planilha antes de importar.");
      const publish = formBool(fd, "publish");
      let result;
      try {
        result = await commitProductImport(text, { publish, expectedCount: expected }, admin.id);
      } catch (error) {
        if (error instanceof BusinessRuleError || error instanceof ValidationError) return withPreview(failure(error));
        throw error;
      }
      revalidatePath("/admin/produtos");
      if (publish) {
        revalidatePath("/");
        revalidatePath("/produtos");
      }
      return {
        ok: true,
        message: `${result.created} produto(s) importado(s) ${publish ? "e publicado(s) na loja" : "como rascunho (ainda não aparecem na loja)"}.`,
        imported: { ...result, published: publish },
      };
    }

    return { preview: await buildPreview(text, name) };
  } catch (error) {
    return failure(error);
  }
}
