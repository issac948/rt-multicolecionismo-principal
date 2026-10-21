"use client";

import { startTransition, useActionState, useCallback, type FormEvent } from "react";

/**
 * Liga um <form> a uma Server Action SEM limpar os campos quando há erro
 * (o comportamento padrão do React 19 apaga tudo que a pessoa digitou).
 * Também repassa o botão clicado (ex.: "Publicar" x "Salvar rascunho").
 */
export function useActionForm<S>(action: (prev: S, formData: FormData) => Promise<S>, initial: S) {
  // O React tipa o estado como Awaited<S>; para estados simples (objetos) é idêntico a S.
  const [state, dispatch, pending] = useActionState(
    action as (prev: unknown, formData: FormData) => Promise<unknown>,
    initial as unknown,
  ) as unknown as [S, (payload: FormData) => void, boolean];

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
      const formData = new FormData(event.currentTarget, submitter);
      startTransition(() => dispatch(formData));
    },
    [dispatch],
  );

  return { state, onSubmit, pending };
}
