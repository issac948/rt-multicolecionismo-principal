"use client";

import { Ban, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, Field } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { EVENT_STATUS_LABEL, EVENT_STATUSES, type EventStatus } from "@/lib/events";
import { cancelEventAction, deleteEventAction, reactivateEventAction, updateEventAction } from "@/server/actions/events";
import type { FormState } from "@/server/actions/shared";
import { EventImageField } from "./event-image-field";

export type EventFormValues = {
  id: string;
  title: string;
  description: string;
  location: string;
  date: string;
  startTime: string;
  endTime: string;
  status: EventStatus;
  imageKey: string | null;
  imageUrl: string | null;
  templateName: string | null;
};

/** Edita UMA participação (nunca o modelo nem as outras datas), e permite cancelar, reativar ou excluir só ela. */
export function EventEditForm({ event }: { event: EventFormValues }) {
  const save = useActionForm<FormState>(updateEventAction, {});
  const cancel = useActionForm<FormState>(cancelEventAction, {});
  const reactivate = useActionForm<FormState>(reactivateEventAction, {});
  const remove = useActionForm<FormState>(deleteEventAction, {});
  const [confirming, setConfirming] = useState<null | "cancelar" | "excluir">(null);
  const [status, setStatus] = useState<EventStatus>(event.status);
  const [notice, setNotice] = useState<string | null>(null);
  const errors = save.state.errors ?? {};

  // Depois de cancelar/reativar, a página é atualizada pelo servidor: acompanha a nova situação e mantém o aviso na tela.
  useEffect(() => setStatus(event.status), [event.status]);
  useEffect(() => {
    if (cancel.state.ok && cancel.state.message) setNotice(cancel.state.message);
  }, [cancel.state]);
  useEffect(() => {
    if (reactivate.state.ok && reactivate.state.message) setNotice(reactivate.state.message);
  }, [reactivate.state]);
  useEffect(() => {
    if (cancel.state.ok || reactivate.state.ok) setConfirming(null);
  }, [cancel.state, reactivate.state]);
  const cancelled = event.status === "CANCELADO";

  return (
    <div className="space-y-6">
      {notice && <Alert tone="ok">{notice}</Alert>}
      <form onSubmit={save.onSubmit} noValidate className="panel grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="eventId" value={event.id} />
        {event.templateName && (
          <p className="text-sm text-ink-soft sm:col-span-2">
            Criado a partir do modelo &quot;{event.templateName}&quot;. O que você mudar aqui vale só para esta data.
          </p>
        )}
        <div className="sm:col-span-2">
          <Field label="Nome do evento" htmlFor="ed-title" error={errors.title}>
            <input id="ed-title" name="title" className="input" defaultValue={event.title} maxLength={120} required aria-invalid={Boolean(errors.title)} />
          </Field>
        </div>
        <Field label="Data" htmlFor="ed-date" error={errors.date}>
          <input id="ed-date" name="date" type="date" className="input" defaultValue={event.date} required />
        </Field>
        <Field label="Situação" htmlFor="ed-status" error={errors.status} hint="Rascunho e cancelado não aparecem no site.">
          <select id="ed-status" name="status" className="select" value={status} onChange={(e) => setStatus(e.target.value as EventStatus)}>
            {EVENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EVENT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Início" htmlFor="ed-start" error={errors.startTime}>
          <input id="ed-start" name="startTime" type="time" className="input" defaultValue={event.startTime} />
        </Field>
        <Field label="Término" htmlFor="ed-end" error={errors.endTime}>
          <input id="ed-end" name="endTime" type="time" className="input" defaultValue={event.endTime} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Local" htmlFor="ed-location" error={errors.location}>
            <input id="ed-location" name="location" className="input" defaultValue={event.location} maxLength={300} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Descrição" htmlFor="ed-description" error={errors.description}>
            <textarea id="ed-description" name="description" className="textarea" rows={4} defaultValue={event.description} maxLength={2000} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <EventImageField initialKey={event.imageKey} initialUrl={event.imageUrl} idPrefix="editar" />
          {errors.imageKey && <p className="field-error">{errors.imageKey}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" className="btn btn-dark" disabled={save.pending}>
            {save.pending ? "Salvando..." : "Salvar alterações"}
          </button>
          {save.state.message && <span className={save.state.ok ? "text-sm font-semibold text-ok" : "field-error !mt-0"}>{save.state.message}</span>}
        </div>
      </form>

      <section className="panel space-y-4" aria-labelledby="ed-acoes">
        <h2 id="ed-acoes" className="text-2xl">
          Cancelar ou excluir
        </h2>
        {cancelled ? (
          <form onSubmit={reactivate.onSubmit} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="eventId" value={event.id} />
            <p className="text-ink-soft">Este evento está cancelado e não aparece no site.</p>
            <button type="submit" className="btn btn-outline btn-sm" disabled={reactivate.pending}>
              <RotateCcw size={16} aria-hidden /> Reativar e publicar
            </button>
            {reactivate.state.message && <span className={reactivate.state.ok ? "text-sm font-semibold text-ok" : "field-error !mt-0"}>{reactivate.state.message}</span>}
          </form>
        ) : (
          <form onSubmit={cancel.onSubmit} className="space-y-3">
            <input type="hidden" name="eventId" value={event.id} />
            {confirming === "cancelar" ? (
              <>
                <Alert tone="warn">Cancelar esta participação? Ela some do site, mas continua no painel em &quot;Cancelados&quot; e pode ser reativada.</Alert>
                <div className="flex flex-wrap gap-3">
                  <button type="submit" className="btn btn-danger btn-sm" disabled={cancel.pending}>
                    {cancel.pending ? "Cancelando..." : "Sim, cancelar o evento"}
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirming(null)}>
                    Manter
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirming("cancelar")}>
                <Ban size={16} aria-hidden /> Cancelar este evento
              </button>
            )}
            {cancel.state.message && !cancel.state.ok && <Alert tone="error">{cancel.state.message}</Alert>}
          </form>
        )}

        <form onSubmit={remove.onSubmit} className="space-y-3 border-t border-line pt-4">
          <input type="hidden" name="eventId" value={event.id} />
          {confirming === "excluir" ? (
            <>
              <input type="hidden" name="confirm" value="sim" />
              <Alert tone="warn">Excluir de vez esta participação? Ela não poderá ser recuperada. Para só tirar do site, use &quot;Cancelar este evento&quot;.</Alert>
              <div className="flex flex-wrap gap-3">
                <button type="submit" className="btn btn-danger btn-sm" disabled={remove.pending}>
                  {remove.pending ? "Excluindo..." : "Sim, excluir"}
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirming(null)}>
                  Manter
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn-link inline-flex items-center gap-1 text-sm !text-enamel-deep" onClick={() => setConfirming("excluir")}>
              <Trash2 size={16} aria-hidden /> Excluir esta participação
            </button>
          )}
          {remove.state.message && !remove.state.ok && <Alert tone="error">{remove.state.message}</Alert>}
        </form>
      </section>
    </div>
  );
}
