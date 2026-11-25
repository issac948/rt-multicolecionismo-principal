"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Field } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { deleteCouponAction, saveCouponAction, toggleCouponAction } from "@/server/actions/coupons";
import type { FormState } from "@/server/actions/shared";

/** Formulário de novo cupom. Datas no horário de Brasília. */
export function NewCouponForm() {
  const save = useActionForm<FormState>(saveCouponAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<"PERCENT" | "FIXED">("PERCENT");
  const errors = save.state.errors ?? {};

  useEffect(() => {
    if (save.state.ok) formRef.current?.reset();
  }, [save.state]);

  return (
    <form ref={formRef} onSubmit={save.onSubmit} noValidate className="grid gap-4 sm:grid-cols-6">
      <div className="sm:col-span-2">
        <Field label="Código" htmlFor="cp-code" error={errors.code} hint="Ex.: BLACK10. O cliente pode digitar em maiúsculas ou minúsculas.">
          <input id="cp-code" name="code" className="input uppercase" maxLength={32} required autoCapitalize="characters" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Tipo de desconto" htmlFor="cp-kind">
          <select id="cp-kind" name="kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as "PERCENT" | "FIXED")}>
            <option value="PERCENT">Percentual (%)</option>
            <option value="FIXED">Valor fixo (R$)</option>
          </select>
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field
          label={kind === "PERCENT" ? "Percentual (1 a 90)" : "Valor do desconto (R$)"}
          htmlFor="cp-value"
          error={errors.value}
          hint="O desconto nunca passa de 90% dos produtos."
        >
          <input id="cp-value" name="value" className="input" inputMode={kind === "PERCENT" ? "numeric" : "decimal"} required />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Compra mínima em produtos (R$)" htmlFor="cp-min" error={errors.minSubtotal} hint="Em branco = sem mínimo.">
          <input id="cp-min" name="minSubtotal" className="input" inputMode="decimal" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Começa em (Brasília)" htmlFor="cp-start" error={errors.startsAt} hint="Em branco = já vale.">
          <input id="cp-start" name="startsAt" type="datetime-local" className="input" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Termina em (Brasília)" htmlFor="cp-end" error={errors.endsAt} hint="Em branco = sem data final.">
          <input id="cp-end" name="endsAt" type="datetime-local" className="input" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Limite total de usos" htmlFor="cp-max" error={errors.maxRedemptions} hint="Em branco = ilimitado.">
          <input id="cp-max" name="maxRedemptions" className="input" inputMode="numeric" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Usos por cliente" htmlFor="cp-user" error={errors.maxPerUser} hint="Ex.: 1 = cada cliente usa uma vez.">
          <input id="cp-user" name="maxPerUser" className="input" inputMode="numeric" defaultValue="1" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Anotação interna (opcional)" htmlFor="cp-desc" error={errors.description}>
          <input id="cp-desc" name="description" className="input" maxLength={200} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <button type="submit" className="btn btn-dark" disabled={save.pending}>
          {save.pending ? "Salvando..." : "Criar cupom"}
        </button>
        {save.state.message && <span className={save.state.ok ? "text-sm font-semibold text-ok" : "field-error !mt-0"}>{save.state.message}</span>}
      </div>
    </form>
  );
}

/** Ativar/desativar e excluir (só se nunca foi usado). */
export function CouponRowActions({ id, active, used }: { id: string; active: boolean; used: number }) {
  const toggle = useActionForm<FormState>(toggleCouponAction, {});
  const remove = useActionForm<FormState>(deleteCouponAction, {});
  const message = toggle.state.message ?? remove.state.message;
  const failed = (toggle.state.message && !toggle.state.ok) || (remove.state.message && !remove.state.ok);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form onSubmit={toggle.onSubmit}>
        <input type="hidden" name="couponId" value={id} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <button type="submit" className="btn btn-outline" disabled={toggle.pending}>
          {active ? "Desativar" : "Ativar"}
        </button>
      </form>
      {used === 0 && (
        <form
          onSubmit={(event) => {
            if (!window.confirm("Excluir este cupom?")) {
              event.preventDefault();
              return;
            }
            remove.onSubmit(event);
          }}
        >
          <input type="hidden" name="couponId" value={id} />
          <button type="submit" className="btn btn-outline" disabled={remove.pending} aria-label="Excluir cupom">
            <Trash2 aria-hidden size={16} /> Excluir
          </button>
        </form>
      )}
      {message && <span className={failed ? "field-error !mt-0" : "text-sm text-ink-soft"}>{message}</span>}
    </div>
  );
}
