"use client";

import { useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { uploadAdminImage } from "@/lib/client-upload";

/**
 * Foto do evento/modelo. A foto é reduzida no navegador, enviada na hora e só "vale" depois de salvar o formulário
 * (a chave vai num campo escondido `imageKey`). Trocar ou remover aqui não mexe em outros eventos que usam a mesma foto.
 */
export function EventImageField({
  initialKey,
  initialUrl,
  onChange,
  disabled,
  idPrefix = "evento",
}: {
  initialKey: string | null;
  initialUrl: string | null;
  /** Avisa o formulário quando a foto muda (para o aviso de "alterações não salvas", por exemplo). */
  onChange?: (key: string | null, url: string | null) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const [key, setKey] = useState(initialKey ?? "");
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const result = await uploadAdminImage<{ key?: string; url?: string }>(file, "event");
    if (!result.ok || !result.data.key || !result.data.url) {
      setError(result.ok ? "Não foi possível enviar a foto." : result.error);
    } else {
      setKey(result.data.key);
      setUrl(result.data.url);
      onChange?.(result.data.key, result.data.url);
    }
    setBusy(false);
  }

  return (
    <div>
      <input type="hidden" name="imageKey" value={key} />
      <p className="label" id={`${idPrefix}-foto-rotulo`}>
        Foto (opcional)
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-24 w-40 place-items-center overflow-hidden rounded border border-line bg-panel">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Foto escolhida para o evento" className="h-full w-full object-cover" />
          ) : (
            <span className="px-2 text-center text-sm text-ink-soft">Sem foto</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            id={`${idPrefix}-foto`}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            aria-labelledby={`${idPrefix}-foto-rotulo`}
            disabled={disabled || busy}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <label htmlFor={`${idPrefix}-foto`} className="btn btn-outline btn-sm cursor-pointer" aria-disabled={disabled || busy}>
            <ImagePlus size={16} aria-hidden /> {busy ? "Enviando..." : url ? "Trocar foto" : "Enviar foto"}
          </label>
          {url && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={disabled || busy}
              onClick={() => {
                setKey("");
                setUrl(null);
                onChange?.(null, null);
              }}
            >
              <Trash2 size={16} aria-hidden /> Remover foto
            </button>
          )}
        </div>
      </div>
      {error && <p className="field-error">{error}</p>}
      <p className="hint">A foto é reduzida automaticamente antes de enviar. Ela só vale depois de salvar.</p>
    </div>
  );
}
