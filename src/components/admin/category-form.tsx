"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Alert, Field } from "@/components/ui";
import { CATEGORY_KINDS, CATEGORY_KIND_LABEL } from "@/lib/constants";
import { useActionForm } from "@/components/use-action-form";
import { deleteCategoryAction, saveCategoryAction } from "@/server/actions/admin";
import type { FormState } from "@/server/actions/shared";

export type CategoryFormValues = {
  id?: string;
  name: string;
  description: string;
  position: number;
  active: boolean;
  kind: string;
  parentId: string | null;
};

/** Cria ou edita uma categoria. Com `id`, mostra também o botão de excluir. */
export function CategoryForm({
  category,
  productCount,
  parents,
  hasChildren = false,
}: {
  category?: CategoryFormValues;
  productCount?: number;
  /** Categorias principais que podem ser "mãe" (sem a própria categoria). */
  parents: Array<{ id: string; name: string }>;
  /** Categoria que já tem subcategorias não pode virar subcategoria. */
  hasChildren?: boolean;
}) {
  const [parentId, setParentId] = useState(category?.parentId ?? "");
  const save = useActionForm<FormState>(saveCategoryAction, {});
  const remove = useActionForm<FormState>(deleteCategoryAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const isNew = !category?.id;
  const errors = save.state.errors ?? {};
  const uid = category?.id ?? "nova";

  // Categoria nova salva com sucesso: limpa o formulário para cadastrar a próxima.
  useEffect(() => {
    if (isNew && save.state.ok) formRef.current?.reset();
  }, [isNew, save.state]);

  return (
    <div className="space-y-3">
      <form ref={formRef} onSubmit={save.onSubmit} noValidate className="grid gap-4 sm:grid-cols-6">
        {category?.id && <input type="hidden" name="categoryId" value={category.id} />}

        <div className="sm:col-span-3">
          <Field label="Nome" htmlFor={`name-${uid}`} error={errors.name}>
            <input id={`name-${uid}`} name="name" className="input" defaultValue={category?.name ?? ""} maxLength={60} required />
          </Field>
        </div>
        <div className="sm:col-span-1">
          <Field label="Ordem" htmlFor={`position-${uid}`} error={errors.position} hint="Menor aparece primeiro.">
            <input id={`position-${uid}`} name="position" className="input" inputMode="numeric" defaultValue={category?.position ?? 0} />
          </Field>
        </div>
        <label className="flex items-center gap-3 sm:col-span-2 sm:self-center sm:pt-2">
          <input type="checkbox" className="checkbox" name="active" defaultChecked={category?.active ?? true} />
          <span>Visível na loja</span>
        </label>
        {!hasChildren && (
          <div className="sm:col-span-3">
            <Field label="Categoria-mãe (opcional)" htmlFor={`parent-${uid}`} error={errors.parentId} hint="Escolha para criar uma subcategoria. Deixe em branco para uma categoria principal.">
              <select id={`parent-${uid}`} name="parentId" className="select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">Nenhuma (categoria principal)</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        {parentId === "" ? (
          <div className={hasChildren ? "sm:col-span-6" : "sm:col-span-3"}>
            <Field label="Tipo de produtos" htmlFor={`kind-${uid}`} error={errors.kind} hint="Define quais campos aparecem ao cadastrar um produto nesta categoria.">
              <select id={`kind-${uid}`} name="kind" className="select" defaultValue={category?.kind ?? "OUTROS"}>
                {CATEGORY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {CATEGORY_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <p className="text-sm text-ink-soft sm:col-span-3 sm:self-center">A subcategoria usa o mesmo tipo da categoria-mãe.</p>
        )}
        <div className="sm:col-span-6">
          <Field label="Descrição (opcional)" htmlFor={`description-${uid}`} error={errors.description}>
            <input id={`description-${uid}`} name="description" className="input" defaultValue={category?.description ?? ""} maxLength={300} />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
          <button type="submit" className="btn btn-dark" disabled={save.pending}>
            {save.pending ? "Salvando..." : isNew ? "Criar categoria" : "Salvar"}
          </button>
          {save.state.message && <span className={save.state.ok ? "text-sm font-semibold text-ok" : "field-error !mt-0"}>{save.state.message}</span>}
        </div>
      </form>

      {category?.id && (
        <form
          onSubmit={(event) => {
            const extra = productCount ? ` Os ${productCount} produtos publicados dela ficarão sem categoria.` : "";
            if (!window.confirm(`Excluir a categoria "${category.name}"?${extra}`)) {
              event.preventDefault();
              return;
            }
            remove.onSubmit(event);
          }}
        >
          <input type="hidden" name="categoryId" value={category.id} />
          <button type="submit" className="btn-link inline-flex items-center gap-1 text-sm !text-enamel-deep" disabled={remove.pending}>
            <Trash2 size={16} aria-hidden /> Excluir categoria
          </button>
          {remove.state.message && !remove.state.ok && <Alert tone="error" className="mt-2">{remove.state.message}</Alert>}
        </form>
      )}
    </div>
  );
}
