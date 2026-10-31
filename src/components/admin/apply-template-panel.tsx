"use client";

import { Alert } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { TEMPLATE_APPLY_FIELDS, TEMPLATE_APPLY_LABEL } from "@/lib/event-schemas";
import { formatEventDateShort } from "@/lib/events";
import { applyTemplateAction } from "@/server/actions/events";
import type { FormState } from "@/server/actions/shared";

/**
 * Passo EXPLÍCITO para refletir o modelo nas próximas datas já marcadas: mostra quais datas serão alteradas,
 * deixa escolher os campos e exige confirmação. Datas passadas e canceladas nunca entram.
 */
export function ApplyTemplatePanel({ templateId, dates }: { templateId: string; dates: Array<{ id: string; date: string; title: string }> }) {
  const apply = useActionForm<FormState>(applyTemplateAction, {});
  const errors = apply.state.errors ?? {};

  if (dates.length === 0) {
    return <p className="text-ink-soft">Não há datas futuras ligadas a este modelo. Quando houver, você poderá atualizá-las daqui, escolhendo o que mudar.</p>;
  }

  return (
    <form onSubmit={apply.onSubmit} noValidate className="space-y-4">
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="expectedCount" value={dates.length} />
      <p>
        Estas <strong>{dates.length}</strong> data(s) futura(s) seriam atualizadas com os dados <strong>atuais do modelo</strong> (salve o modelo antes, se acabou de editar):
      </p>
      <ul className="flex flex-wrap gap-2" aria-label="Datas que seriam atualizadas">
        {dates.map((d) => (
          <li key={d.id} className="badge badge-neutral">
            {formatEventDateShort(d.date)}
          </li>
        ))}
      </ul>
      <fieldset>
        <legend className="label">O que atualizar</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TEMPLATE_APPLY_FIELDS.map((field) => (
            <label key={field} className="flex items-center gap-3 min-h-11">
              <input type="checkbox" className="checkbox" name="fields" value={field} />
              <span>{TEMPLATE_APPLY_LABEL[field]}</span>
            </label>
          ))}
        </div>
        {errors.fields && <p className="field-error">{errors.fields}</p>}
        <p className="hint">Os campos que você não marcar ficam como estão em cada data (inclusive ajustes feitos só naquela data).</p>
      </fieldset>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="checkbox mt-1" name="confirm" />
        <span>Entendo que isso troca os campos marcados em todas as datas acima.</span>
      </label>
      {errors.confirm && <p className="field-error">{errors.confirm}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-dark" disabled={apply.pending}>
          {apply.pending ? "Atualizando..." : "Atualizar datas já marcadas"}
        </button>
      </div>
      {apply.state.message && <Alert tone={apply.state.ok ? "ok" : "error"}>{apply.state.message}</Alert>}
    </form>
  );
}
