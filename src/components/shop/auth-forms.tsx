"use client";

import Link from "next/link";
import { Alert, Field } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import type { FormState } from "@/server/actions/shared";
import { loginAction, registerAction, resetPasswordAction } from "@/server/actions/auth";

function ariaFor(errors: Record<string, string>, name: string) {
  return errors[name] ? ({ "aria-invalid": true, "aria-describedby": `${name}-error` } as const) : {};
}

export function LoginForm({ next }: { next: string | null }) {
  const { state, onSubmit, pending } = useActionForm<FormState>(loginAction, {});
  const errors = state.errors ?? {};
  const registerHref = next ? `/cadastro?next=${encodeURIComponent(next)}` : "/cadastro";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      <Field label="E-mail" htmlFor="email" error={errors.email}>
        <input id="email" name="email" type="email" className="input" autoComplete="email" inputMode="email" required {...ariaFor(errors, "email")} />
      </Field>
      <Field label="Senha" htmlFor="password" error={errors.password}>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete="current-password"
          required
          {...ariaFor(errors, "password")}
        />
      </Field>

      {state.message && !state.errors && <Alert tone="error">{state.message}</Alert>}

      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Entrando..." : "Entrar"}
      </button>
      <p className="text-center text-sm">
        Ainda não tem conta? <Link href={registerHref}>Cadastre-se</Link>
      </p>
    </form>
  );
}

export function RegisterForm({ next }: { next: string | null }) {
  const { state, onSubmit, pending } = useActionForm<FormState>(registerAction, {});
  const errors = state.errors ?? {};
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      <Field label="Nome completo" htmlFor="name" error={errors.name}>
        <input id="name" name="name" className="input" autoComplete="name" maxLength={100} required {...ariaFor(errors, "name")} />
      </Field>
      <Field label="E-mail" htmlFor="email" error={errors.email}>
        <input id="email" name="email" type="email" className="input" autoComplete="email" inputMode="email" required {...ariaFor(errors, "email")} />
      </Field>
      <Field label="Telefone com DDD (opcional)" htmlFor="phone" error={errors.phone}>
        <input id="phone" name="phone" type="tel" className="input" autoComplete="tel" inputMode="tel" maxLength={20} {...ariaFor(errors, "phone")} />
      </Field>
      <Field label="Senha" htmlFor="password" error={errors.password} hint="Mínimo de 8 caracteres.">
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          {...ariaFor(errors, "password")}
        />
      </Field>
      <Field label="Repita a senha" htmlFor="confirmPassword" error={errors.confirmPassword}>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          {...ariaFor(errors, "confirmPassword")}
        />
      </Field>

      {state.message && !state.errors && <Alert tone="error">{state.message}</Alert>}

      <p className="text-xs text-ink-soft">
        Ao criar a conta, você concorda com os <Link href="/termos-de-uso">Termos de uso</Link> e com a{" "}
        <Link href="/politica-de-privacidade">Política de privacidade</Link>.
      </p>
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Criando conta..." : "Criar conta"}
      </button>
      <p className="text-center text-sm">
        Já tem conta? <Link href={loginHref}>Entrar</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const { state, onSubmit, pending } = useActionForm<FormState>(resetPasswordAction, {});
  const errors = state.errors ?? {};
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Nova senha" htmlFor="password" error={errors.password} hint="Pelo menos 8 caracteres.">
        <input id="password" name="password" type="password" className="input" autoComplete="new-password" required {...ariaFor(errors, "password")} />
      </Field>
      <Field label="Repita a nova senha" htmlFor="confirmPassword" error={errors.confirmPassword}>
        <input id="confirmPassword" name="confirmPassword" type="password" className="input" autoComplete="new-password" required {...ariaFor(errors, "confirmPassword")} />
      </Field>
      {state.message && !state.errors && <Alert tone="error">{state.message}</Alert>}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Salvando..." : "Salvar nova senha"}
      </button>
    </form>
  );
}
