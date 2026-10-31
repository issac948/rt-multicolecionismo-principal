"use client";

import { FileUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, Badge } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { formatBRL } from "@/lib/money";
import { importProductsAction, type ImportFormState } from "@/server/actions/product-import";

const fileKey = (f: File | undefined) => (f ? `${f.name}|${f.size}|${f.lastModified}` : null);

/**
 * Importação em dois passos: "Conferir planilha" mostra a prévia (nada é gravado);
 * "Importar" só fica disponível para a MESMA planilha que acabou de ser conferida e exige confirmação.
 */
export function ProductImportForm() {
  const action = useActionForm<ImportFormState>(importProductsAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [verifiedKey, setVerifiedKey] = useState<string | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const pendingKey = useRef<string | null>(null);

  const { state } = action;
  // A prévia nova chega pelo estado da ação: marca como "conferida" o arquivo que foi enviado nesse clique.
  useEffect(() => {
    if (state.preview) setVerifiedKey(pendingKey.current);
  }, [state.preview]);
  const preview = state.preview;
  const imported = state.ok ? state.imported : undefined;
  const readyToImport = Boolean(preview && !preview.fatal && preview.ok > 0 && currentKey !== null && currentKey === verifiedKey && !imported);
  const errors = state.errors ?? {};
  const shownRows = preview ? (onlyErrors ? preview.rows.filter((r) => r.status === "erro") : preview.rows) : [];

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.value === "preview") pendingKey.current = fileKey(fileRef.current?.files?.[0]);
        action.onSubmit(event);
      }}
      className="space-y-5"
    >
      <div>
        <label htmlFor="csv-file" className="label">
          Arquivo da planilha (.csv)
        </label>
        <input
          id="csv-file"
          ref={fileRef}
          name="file"
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="input !py-2"
          onChange={(e) => setCurrentKey(fileKey(e.target.files?.[0]))}
          aria-describedby={errors.file ? "csv-file-error" : undefined}
        />
        {errors.file && (
          <p className="field-error" id="csv-file-error">
            {errors.file}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" name="intent" value="preview" className="btn btn-dark" disabled={action.pending || !currentKey}>
          <FileUp size={18} aria-hidden /> {action.pending ? "Lendo a planilha..." : "Conferir planilha"}
        </button>
        {!currentKey && <span className="text-sm text-ink-soft">Escolha um arquivo para conferir.</span>}
      </div>

      {state.message && !state.ok && !state.preview && <Alert tone="error">{state.message}</Alert>}

      {imported && (
        <Alert tone="ok">
          <strong>{state.message}</strong>
          {imported.skipped > 0 && ` ${imported.skipped} linha(s) com erro ficaram de fora: corrija na planilha e importe só elas.`}{" "}
          <a href="/admin/produtos">Ver produtos</a>
        </Alert>
      )}

      {preview?.fatal && <Alert tone="error">{preview.fatal}</Alert>}

      {preview && !preview.fatal && (
        <section className="space-y-4" aria-label="Prévia da importação" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="success">{preview.ok} pronto(s) para importar</Badge>
            <Badge tone={preview.failed > 0 ? "danger" : "neutral"}>{preview.failed} com erro</Badge>
            <span className="text-sm text-ink-soft">Arquivo: {preview.fileName}</span>
          </div>
          {preview.truncated && <Alert tone="warn">A planilha tem mais de 500 linhas. Só as primeiras 500 foram conferidas; importe o resto em outro arquivo.</Alert>}
          {preview.ignoredColumns.length > 0 && <p className="text-sm text-ink-soft">Colunas não reconhecidas (ignoradas): {preview.ignoredColumns.join(", ")}.</p>}
          {preview.failed > 0 && (
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" className="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />
              <span>Mostrar só as linhas com erro</span>
            </label>
          )}

          <div className="table-wrap">
            <table className="table table-cards">
              <caption className="sr-only">Linhas da planilha e o resultado da conferência</caption>
              <thead>
                <tr>
                  <th scope="col">Linha</th>
                  <th scope="col">Produto</th>
                  <th scope="col">Preço</th>
                  <th scope="col">Estoque</th>
                  <th scope="col">Categoria</th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {shownRows.map((row) => (
                  <tr key={row.line} className={row.status === "erro" ? "bg-enamel-soft/50" : undefined}>
                    <td data-label="Linha">{row.line}</td>
                    <td data-primary className="min-w-48">{row.name || <span className="text-ink-soft">(sem nome)</span>}</td>
                    <td data-label="Preço" className="whitespace-nowrap">{row.priceCents !== null ? formatBRL(row.priceCents) : "—"}</td>
                    <td data-label="Estoque">{row.stock ?? "—"}</td>
                    <td data-label="Categoria">{row.categoryLabel || <span className="text-ink-soft">sem categoria</span>}</td>
                    <td data-label="Resultado" className="min-w-64">
                      {row.status === "ok" ? (
                        <Badge tone="success">Pronto</Badge>
                      ) : (
                        <ul className="list-disc space-y-0.5 pl-4 text-sm text-enamel-deep">
                          {row.errors.map((e) => (
                            <li key={e}>{e}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.ok > 0 && (
            <div className="panel space-y-3">
              <h2 className="text-2xl">Importar</h2>
              <input type="hidden" name="expectedCount" value={preview.ok} />
              <label className="flex items-start gap-3">
                <input type="checkbox" className="checkbox mt-1" name="publish" />
                <span>
                  Publicar na loja ao importar
                  <span className="block text-sm text-ink-soft">Desmarcado (recomendado): os produtos entram como rascunho, para você colocar as fotos e conferir antes de publicar.</span>
                </span>
              </label>
              <label className="flex items-start gap-3">
                <input type="checkbox" className="checkbox mt-1" name="confirm" />
                <span>
                  Confirmo: criar {preview.ok} produto(s) novo(s). Produtos que já existem não são alterados.
                  {preview.failed > 0 && ` As ${preview.failed} linha(s) com erro não serão importadas.`}
                </span>
              </label>
              {errors.confirm && <p className="field-error">{errors.confirm}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" name="intent" value="import" className="btn btn-primary" disabled={action.pending || !readyToImport}>
                  {action.pending ? "Importando..." : `Importar ${preview.ok} produto(s)`}
                </button>
                {!readyToImport && !imported && <span className="text-sm text-ink-soft">Você trocou o arquivo: confira a planilha de novo para importar.</span>}
              </div>
              {state.message && !state.ok && state.preview && <Alert tone="error">{state.message}</Alert>}
            </div>
          )}
        </section>
      )}
    </form>
  );
}
