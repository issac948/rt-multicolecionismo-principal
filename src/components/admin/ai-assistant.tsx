"use client";

import Link from "next/link";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { ProductForm } from "@/components/admin/product-form";
import { suggestionToFormValues, type ProductFormValues } from "@/components/admin/product-form-values";
import { Alert, Field } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { suggestProductAction, type AiState } from "@/server/actions/admin";

const MAX_CHARS = 2000;

/**
 * Fluxo: o administrador descreve o produto -> a IA SUGERE -> o administrador revisa e edita ->
 * só quando clicar em "Publicar" ou "Salvar como rascunho" algo é gravado.
 */
export function AiAssistant({
  categories,
  configured,
  providerLabel,
}: {
  categories: Array<{ id: string; name: string }>;
  configured: boolean;
  providerLabel: string;
}) {
  const { state, onSubmit, pending } = useActionForm<AiState>(suggestProductAction, {});
  const [text, setText] = useState("");
  // Cada nova sugestão cria um formulário novo (a chave muda), com os campos já preenchidos.
  const [version, setVersion] = useState(0);
  const [values, setValues] = useState<ProductFormValues | null>(null);

  // Quando chega uma sugestão nova no estado, guardamos os valores do formulário.
  const suggestion = state.suggestion;
  const [shownSuggestion, setShownSuggestion] = useState<typeof suggestion>(undefined);
  if (suggestion && suggestion !== shownSuggestion) {
    setShownSuggestion(suggestion);
    setValues(suggestionToFormValues(suggestion));
    setVersion((v) => v + 1);
  }

  if (!configured) {
    return (
      <Alert tone="warn">
        <p className="font-bold">O assistente de IA ainda não está ligado.</p>
        <p className="mt-1">
          Ele precisa de uma chave de acesso ao serviço de IA, que fica guardada só no servidor (variáveis <code>AI_PROVIDER</code>,{" "}
          <code>AI_API_KEY</code> e <code>AI_MODEL</code>). O passo a passo está no README. Enquanto isso, você pode cadastrar produtos normalmente em{" "}
          <Link href="/admin/produtos/novo">Novo produto</Link>.
        </p>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <section className="panel space-y-4" aria-labelledby="ia-descricao">
        <h2 id="ia-descricao" className="text-2xl">
          1. Conte sobre o produto
        </h2>
        <p className="text-sm text-ink-soft">
          Escreva do seu jeito: o que é, material, medidas, cores, preço, quantidade em estoque. A IA organiza e sugere nome, descrições, características,
          categoria, palavras-chave e texto para o Google. <strong>Ela só usa o que você escrever</strong>; confira tudo antes de salvar. Provedor: {providerLabel}.
        </p>
        <form onSubmit={onSubmit} noValidate className="space-y-3">
          <Field label="Informações do produto" htmlFor="description" error={state.errors?.description}>
            <textarea
              id="description"
              name="description"
              className="textarea !min-h-40"
              rows={7}
              maxLength={MAX_CHARS}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex.: Hot Wheels Nissan Skyline GT-R, escala 1:64, lacrado, série Japan Historics. Preço 29,90. Tenho 5."
            />
            <p className="hint text-right">
              {text.length}/{MAX_CHARS}
            </p>
          </Field>
          {state.message && !state.ok && !state.errors && <Alert tone="error">{state.message}</Alert>}
          <button type="submit" className="btn btn-primary" disabled={pending || text.trim().length < 10}>
            <Sparkles size={18} aria-hidden /> {pending ? "Gerando sugestão..." : values ? "Gerar outra sugestão" : "Gerar sugestão"}
          </button>
        </form>
      </section>

      {values && (
        <section aria-labelledby="ia-revisar" className="space-y-4">
          <div>
            <h2 id="ia-revisar" className="text-2xl">
              2. Revise e confirme
            </h2>
            <Alert tone="info" className="mt-3">
              <strong>Nada foi salvo ainda.</strong> Estes campos são só uma sugestão da IA: edite o que quiser, adicione as fotos e então escolha “Publicar na
              loja” ou “Salvar como rascunho”. Confira principalmente preço, estoque e características.
            </Alert>
            {shownSuggestion && shownSuggestion.missing.length > 0 && (
              <Alert tone="warn" className="mt-3">
                <strong>A IA não encontrou no seu texto:</strong> {shownSuggestion.missing.join(", ")}. Preencha abaixo se quiser; ela não inventa esses dados.
              </Alert>
            )}
          </div>
          <ProductForm key={version} initial={values} categories={categories} mode="create" />
        </section>
      )}
    </div>
  );
}
