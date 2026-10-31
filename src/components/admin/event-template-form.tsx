"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert, Field } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { deleteEventTemplateAction, saveEventTemplateAction } from "@/server/actions/events";
import type { FormState } from "@/server/actions/shared";
import { EventImageField } from "./event-image-field";

export type TemplateFormValues = {
  id?: string;
  name: string;
  description: string;
  location: string;
  startTime: string;
  endTime: string;
  imageKey: string | null;
  imageUrl: string | null;
};

/** Cria ou edita um modelo de evento. Editar um modelo NÃO muda as participações já marcadas. */
export function EventTemplateForm({ template, totalEvents = 0 }: { template?: TemplateFormValues; totalEvents?: number }) {
  const save = useActionForm<FormState>(saveEventTemplateAction, {});
  const remove = useActionForm<FormState>(deleteEventTemplateAction, {});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const errors = save.state.errors ?? {};
  const isNew = !template?.id;

  return (
    <div className="space-y-6">
      <form onSubmit={save.onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        {template?.id && <input type="hidden" name="templateId" value={template.id} />}
        <div className="sm:col-span-2">
          <Field label="Nome do modelo (e do evento)" htmlFor="tpl-name" error={errors.name} hint="É o nome que aparece no site quando você marcar uma data. Ex.: nome da feira ou do encontro.">
            <input id="tpl-name" name="name" className="input" defaultValue={template?.name ?? ""} maxLength={120} required aria-invalid={Boolean(errors.name)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Local" htmlFor="tpl-location" error={errors.location} hint="Só escreva o que for real. Pode deixar em branco e informar em cada data.">
            <input id="tpl-location" name="location" className="input" defaultValue={template?.location ?? ""} maxLength={300} />
          </Field>
        </div>
        <Field label="Horário de início padrão" htmlFor="tpl-start" error={errors.startTime}>
          <input id="tpl-start" name="startTime" type="time" className="input" defaultValue={template?.startTime ?? ""} />
        </Field>
        <Field label="Horário de término padrão" htmlFor="tpl-end" error={errors.endTime}>
          <input id="tpl-end" name="endTime" type="time" className="input" defaultValue={template?.endTime ?? ""} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Descrição" htmlFor="tpl-description" error={errors.description} hint="O que o cliente deve saber sobre o evento.">
            <textarea id="tpl-description" name="description" className="textarea" rows={4} defaultValue={template?.description ?? ""} maxLength={2000} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <EventImageField initialKey={template?.imageKey ?? null} initialUrl={template?.imageUrl ?? null} idPrefix="modelo" />
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" className="btn btn-dark" disabled={save.pending}>
            {save.pending ? "Salvando..." : isNew ? "Criar modelo" : "Salvar modelo"}
          </button>
          {save.state.message && <span className={save.state.ok ? "text-sm font-semibold text-ok" : "field-error !mt-0"}>{save.state.message}</span>}
        </div>
        {!isNew && (
          <p className="text-sm text-ink-soft sm:col-span-2">
            Mudar o modelo vale só para as próximas datas que você criar. Os eventos já marcados continuam como estão, a não ser que você use &quot;Atualizar datas já marcadas&quot; abaixo.
          </p>
        )}
      </form>

      {template?.id && (
        <form onSubmit={remove.onSubmit} className="border-t border-line pt-4">
          <input type="hidden" name="templateId" value={template.id} />
          {!confirmDelete ? (
            <button type="button" className="btn-link inline-flex items-center gap-1 text-sm !text-enamel-deep" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={16} aria-hidden /> Excluir este modelo
            </button>
          ) : (
            <div className="space-y-3">
              <Alert tone="warn">
                Excluir o modelo &quot;{template.name}&quot;? {totalEvents > 0 ? `Os ${totalEvents} evento(s) já marcados continuam no calendário, só perdem a ligação com o modelo.` : "Nenhum evento usa este modelo."} Esta ação não pode ser desfeita.
              </Alert>
              <div className="flex flex-wrap gap-3">
                <input type="hidden" name="confirm" value="sim" />
                <button type="submit" className="btn btn-danger btn-sm" disabled={remove.pending}>
                  {remove.pending ? "Excluindo..." : "Sim, excluir o modelo"}
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmDelete(false)}>
                  Manter
                </button>
              </div>
            </div>
          )}
          {remove.state.message && !remove.state.ok && <Alert tone="error" className="mt-2">{remove.state.message}</Alert>}
        </form>
      )}
    </div>
  );
}
