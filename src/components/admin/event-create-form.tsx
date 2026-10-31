"use client";

import { CalendarPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert, Field } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { formatEventDateShort } from "@/lib/events";
import { createEventsAction } from "@/server/actions/events";
import type { FormState } from "@/server/actions/shared";
import { EventImageField } from "./event-image-field";

export type TemplateOption = {
  id: string;
  name: string;
  description: string;
  location: string;
  startTime: string;
  endTime: string;
  imageKey: string | null;
  imageUrl: string | null;
};

const MAX_DATES = 40;

/**
 * Cadastro de participações. Escolher um modelo preenche os campos; o que for ajustado aqui vale só para as datas
 * desta tela e nunca altera o modelo. Sem modelo, cria um evento avulso.
 */
export function EventCreateForm({
  templates,
  initialTemplateId = "",
  initialDate = "",
  today,
}: {
  templates: TemplateOption[];
  initialTemplateId?: string;
  initialDate?: string;
  today: string;
}) {
  const create = useActionForm<FormState>(createEventsAction, {});
  const errors = create.state.errors ?? {};
  const initialTemplate = templates.find((t) => t.id === initialTemplateId) ?? null;

  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? "");
  const [values, setValues] = useState({
    title: initialTemplate?.name ?? "",
    description: initialTemplate?.description ?? "",
    location: initialTemplate?.location ?? "",
    startTime: initialTemplate?.startTime ?? "",
    endTime: initialTemplate?.endTime ?? "",
  });
  const [photo, setPhoto] = useState<{ key: string | null; url: string | null }>({ key: initialTemplate?.imageKey ?? null, url: initialTemplate?.imageUrl ?? null });
  const [dates, setDates] = useState<string[]>(initialDate ? [initialDate] : []);
  const [pendingDate, setPendingDate] = useState("");
  const [dateNote, setDateNote] = useState<string | null>(null);
  const template = useMemo(() => templates.find((t) => t.id === templateId) ?? null, [templates, templateId]);

  function chooseTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return; // "Evento avulso": mantém o que já foi digitado
    setValues({ title: t.name, description: t.description, location: t.location, startTime: t.startTime, endTime: t.endTime });
    setPhoto({ key: t.imageKey, url: t.imageUrl });
  }

  function addDate() {
    setDateNote(null);
    if (!pendingDate) return setDateNote("Escolha uma data no campo ao lado antes de adicionar.");
    if (dates.includes(pendingDate)) return setDateNote("Essa data já está na lista.");
    if (dates.length >= MAX_DATES) return setDateNote(`No máximo ${MAX_DATES} datas de uma vez.`);
    setDates((current) => [...current, pendingDate].sort());
    setPendingDate("");
  }

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  return (
    <form onSubmit={create.onSubmit} noValidate className="space-y-6">
      {templateId && <input type="hidden" name="templateId" value={templateId} />}
      {dates.map((d) => (
        <input key={d} type="hidden" name="dates" value={d} />
      ))}

      <section className="panel space-y-4" aria-labelledby="ev-modelo">
        <h2 id="ev-modelo" className="text-2xl">
          1. De onde vem o evento
        </h2>
        <Field
          label="Modelo"
          htmlFor="ev-template"
          error={errors.templateId}
          hint={templates.length === 0 ? "Você ainda não tem modelos. Crie um em Modelos para reaproveitar os dados de um evento que se repete, ou cadastre um evento avulso aqui." : "Escolha um modelo para preencher os campos, ou deixe como evento avulso."}
        >
          <select id="ev-template" className="select" value={templateId} onChange={(e) => chooseTemplate(e.target.value)}>
            <option value="">Evento avulso (sem modelo)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        {template && (
          <Alert tone="info">
            Campos preenchidos com o modelo &quot;{template.name}&quot;. Se você mudar algo aqui, vale só para as datas desta tela: o modelo e os outros eventos não são alterados.
          </Alert>
        )}
      </section>

      <section className="panel space-y-4" aria-labelledby="ev-datas">
        <h2 id="ev-datas" className="text-2xl">
          2. Datas
        </h2>
        <p className="text-sm text-ink-soft">Cada data vira uma participação própria, que depois pode ser ajustada ou cancelada sozinha.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1 sm:flex-none">
            <label className="label" htmlFor="ev-date-input">
              Escolher data
            </label>
            <input
              id="ev-date-input"
              type="date"
              className="input"
              value={pendingDate}
              onChange={(e) => setPendingDate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDate();
                }
              }}
            />
          </div>
          <button type="button" className="btn btn-outline" onClick={addDate}>
            <CalendarPlus size={18} aria-hidden /> Adicionar data
          </button>
        </div>
        {dateNote && <p className="field-error">{dateNote}</p>}
        {errors.dates && <p className="field-error">{errors.dates}</p>}
        {dates.length === 0 ? (
          <p className="text-ink-soft">Nenhuma data escolhida ainda.</p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label="Datas escolhidas">
            {dates.map((d) => (
              <li key={d} className="inline-flex items-center gap-1 rounded-full bg-night py-1 pl-3 pr-1 text-white">
                <span className="font-semibold">{formatEventDateShort(d)}</span>
                {d < today && <span className="text-xs text-signal">já passou</span>}
                <button type="button" className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/15" aria-label={`Remover ${formatEventDateShort(d)}`} onClick={() => setDates((c) => c.filter((x) => x !== d))}>
                  <X size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel grid gap-4 sm:grid-cols-2" aria-labelledby="ev-dados">
        <h2 id="ev-dados" className="text-2xl sm:col-span-2">
          3. Dados que aparecem no site
        </h2>
        <div className="sm:col-span-2">
          <Field label="Nome do evento" htmlFor="ev-title" error={errors.title}>
            <input id="ev-title" name="title" className="input" value={values.title} onChange={set("title")} maxLength={120} required aria-invalid={Boolean(errors.title)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Local" htmlFor="ev-location" error={errors.location} hint="Só o que for confirmado.">
            <input id="ev-location" name="location" className="input" value={values.location} onChange={set("location")} maxLength={300} />
          </Field>
        </div>
        <Field label="Início" htmlFor="ev-start" error={errors.startTime}>
          <input id="ev-start" name="startTime" type="time" className="input" value={values.startTime} onChange={set("startTime")} />
        </Field>
        <Field label="Término" htmlFor="ev-end" error={errors.endTime}>
          <input id="ev-end" name="endTime" type="time" className="input" value={values.endTime} onChange={set("endTime")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Descrição" htmlFor="ev-description" error={errors.description}>
            <textarea id="ev-description" name="description" className="textarea" rows={4} value={values.description} onChange={set("description")} maxLength={2000} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <EventImageField key={`${templateId}|${photo.key ?? ""}`} initialKey={photo.key} initialUrl={photo.url} onChange={(key, url) => setPhoto({ key, url })} idPrefix="novo" />
          {errors.imageKey && <p className="field-error">{errors.imageKey}</p>}
        </div>
        <label className="flex items-start gap-3 sm:col-span-2">
          <input type="checkbox" className="checkbox mt-1" name="published" defaultChecked />
          <span>
            Mostrar no site agora
            <span className="block text-sm text-ink-soft">Desmarque para guardar como rascunho; ele só aparece no painel.</span>
          </span>
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-dark" disabled={create.pending || dates.length === 0}>
          {create.pending ? "Salvando..." : dates.length > 1 ? `Cadastrar ${dates.length} datas` : "Cadastrar evento"}
        </button>
        {dates.length === 0 && <span className="text-sm text-ink-soft">Adicione pelo menos uma data.</span>}
        {create.state.message && <span className="field-error !mt-0">{create.state.message}</span>}
      </div>
    </form>
  );
}
