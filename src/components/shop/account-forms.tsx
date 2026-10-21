"use client";

import { useEffect, useRef } from "react";
import { Star, Trash2 } from "lucide-react";
import { AddressFields } from "@/components/shop/address-fields";
import { Alert, Field } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { formatCep, formatPhone } from "@/lib/text";
import {
  addAddressAction,
  changePasswordAction,
  deleteAddressAction,
  setDefaultAddressAction,
  updateProfileAction,
} from "@/server/actions/account";
import type { FormState } from "@/server/actions/shared";

function ariaFor(errors: Record<string, string>, name: string) {
  return errors[name] ? ({ "aria-invalid": true, "aria-describedby": `${name}-error` } as const) : {};
}

function Message({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Alert tone={state.ok ? "ok" : "error"}>{state.message}</Alert>;
}

export function ProfileForm({ name, phone, email }: { name: string; phone: string | null; email: string }) {
  const { state, onSubmit, pending } = useActionForm<FormState>(updateProfileAction, {});
  const errors = state.errors ?? {};
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field label="E-mail" htmlFor="profile-email" hint="O e-mail não pode ser alterado por aqui.">
        <input id="profile-email" className="input" value={email} readOnly disabled />
      </Field>
      <Field label="Nome completo" htmlFor="profile-name" error={errors.name}>
        <input id="profile-name" name="name" className="input" defaultValue={name} autoComplete="name" maxLength={100} {...(errors.name ? ({ "aria-invalid": true, "aria-describedby": "profile-name-error" } as const) : {})} />
      </Field>
      <Field label="Telefone com DDD" htmlFor="profile-phone" error={errors.phone}>
        <input
          id="profile-phone"
          name="phone"
          type="tel"
          className="input"
          defaultValue={phone ? formatPhone(phone) : ""}
          autoComplete="tel"
          maxLength={20}
        />
      </Field>
      <Message state={state} />
      <button type="submit" className="btn btn-dark" disabled={pending}>
        {pending ? "Salvando..." : "Salvar dados"}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const { state, onSubmit, pending } = useActionForm<FormState>(changePasswordAction, {});
  const errors = state.errors ?? {};
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-4">
      <Field label="Senha atual" htmlFor="currentPassword" error={errors.currentPassword}>
        <input id="currentPassword" name="currentPassword" type="password" className="input" autoComplete="current-password" {...ariaFor(errors, "currentPassword")} />
      </Field>
      <Field label="Nova senha" htmlFor="newPassword" error={errors.newPassword} hint="Mínimo de 8 caracteres.">
        <input id="newPassword" name="newPassword" type="password" className="input" autoComplete="new-password" {...ariaFor(errors, "newPassword")} />
      </Field>
      <Field label="Repita a nova senha" htmlFor="confirmPassword" error={errors.confirmPassword}>
        <input id="confirmPassword" name="confirmPassword" type="password" className="input" autoComplete="new-password" {...ariaFor(errors, "confirmPassword")} />
      </Field>
      <Message state={state} />
      <button type="submit" className="btn btn-dark" disabled={pending}>
        {pending ? "Alterando..." : "Alterar senha"}
      </button>
    </form>
  );
}

export type AccountAddress = {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  isDefault: boolean;
};

export function AddressCard({ address }: { address: AccountAddress }) {
  const del = useActionForm<FormState>(deleteAddressAction, {});
  const def = useActionForm<FormState>(setDefaultAddressAction, {});
  const message = del.state.message && !del.state.ok ? del.state.message : def.state.message && !def.state.ok ? def.state.message : null;
  const busy = del.pending || def.pending;

  return (
    <li className="rounded-md border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm leading-relaxed">
          <p className="text-base font-bold">
            {address.label || address.recipientName}
            {address.isDefault && <span className="badge badge-success ml-2">Padrão</span>}
          </p>
          <p>
            {address.street}, {address.number}
            {address.complement ? ` — ${address.complement}` : ""}
          </p>
          <p>
            {address.neighborhood} · {address.city}/{address.state} · CEP {formatCep(address.cep)}
          </p>
          <p className="text-ink-soft">
            {address.recipientName} · {formatPhone(address.phone)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!address.isDefault && (
            <form onSubmit={def.onSubmit}>
              <input type="hidden" name="addressId" value={address.id} />
              <button type="submit" className="btn btn-outline btn-sm" disabled={busy}>
                <Star size={16} aria-hidden /> Tornar padrão
              </button>
            </form>
          )}
          <form
            onSubmit={(event) => {
              if (!window.confirm("Remover este endereço?")) {
                event.preventDefault();
                return;
              }
              del.onSubmit(event);
            }}
          >
            <input type="hidden" name="addressId" value={address.id} />
            <button type="submit" className="btn btn-outline btn-sm" disabled={busy}>
              <Trash2 size={16} aria-hidden /> Remover
            </button>
          </form>
        </div>
      </div>
      {message && <p className="field-error mt-2">{message}</p>}
    </li>
  );
}

export function AddAddressForm({ defaultName, defaultPhone, first }: { defaultName: string; defaultPhone: string | null; first: boolean }) {
  const { state, onSubmit, pending } = useActionForm<FormState>(addAddressAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Endereço salvo com sucesso: limpa o formulário para não enviar o mesmo endereço duas vezes.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-4">
      <AddressFields
        errors={state.errors}
        defaults={{ recipientName: defaultName, phone: defaultPhone ? formatPhone(defaultPhone) : "" }}
        showDefaultCheckbox={!first}
      />
      <Message state={state} />
      <button type="submit" className="btn btn-dark" disabled={pending}>
        {pending ? "Salvando..." : "Salvar endereço"}
      </button>
    </form>
  );
}
