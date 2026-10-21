"use client";

import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { useActionForm } from "@/components/use-action-form";
import { createPasswordResetLinkAction } from "@/server/actions/admin";
import type { FormState } from "@/server/actions/shared";

/** Gera o link de nova senha de um cliente. O link aparece uma única vez, para você copiar e enviar por WhatsApp. */
export function CustomerResetLink({ userId, name, disabled }: { userId: string; name: string; disabled?: boolean }) {
  const { state, onSubmit, pending } = useActionForm<FormState>(createPasswordResetLinkAction, {});
  const [copied, setCopied] = useState(false);

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit}>
        <input type="hidden" name="userId" value={userId} />
        <button type="submit" className="btn btn-outline btn-sm" disabled={pending || disabled}>
          <KeyRound size={16} aria-hidden /> Link de nova senha
          <span className="sr-only"> para {name}</span>
        </button>
      </form>
      {state.message && !state.ok && <p className="field-error">{state.message}</p>}
      {state.ok && state.link && (
        <div className="mt-2 max-w-xs rounded border border-line bg-paper p-2 text-xs">
          <p className="font-semibold">{state.message}</p>
          <input readOnly value={state.link} aria-label={`Link de nova senha de ${name}`} className="input mt-1 !min-h-9 text-xs" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn btn-dark btn-sm mt-1" onClick={() => void copy(state.link as string)}>
            <Copy size={14} aria-hidden /> {copied ? "Copiado" : "Copiar link"}
          </button>
          <p className="mt-1 text-ink-soft">Envie só para essa pessoa. Quem tiver o link consegue trocar a senha.</p>
        </div>
      )}
    </div>
  );
}
