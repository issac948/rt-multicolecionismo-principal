"use client";

import { useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Alert, Field } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { uploadAdminImage } from "@/lib/client-upload";
import { saveSettingsAction } from "@/server/actions/admin";
import type { FormState } from "@/server/actions/shared";

export type SettingsFormValues = {
  storeName: string;
  tagline: string;
  description: string;
  logoKey: string | null;
  logoUrl: string | null;
  whatsapp: string;
  whatsappGroupUrl: string;
  instagram: string;
  email: string;
  phone: string;
  addressText: string;
  businessHours: string;
  fairsNote: string;
  shippingDeliveryEnabled: boolean;
  shippingFlatRate: string;
  shippingFreeAbove: string;
  shippingEstimate: string;
  shippingPickupEnabled: boolean;
  shippingPickupInstructions: string;
  shippingMode: "fixed" | "calculated";
  shippingOriginCep: string;
  shippingOriginStreet: string;
  shippingOriginNumber: string;
  shippingOriginComplement: string;
  shippingOriginNeighborhood: string;
  shippingOriginCity: string;
  shippingOriginState: string;
  shippingServiceSedex: boolean;
  shippingServicePac: boolean;
  shippingServiceMini: boolean;
  shippingHandling: string;
  shippingDeclareValue: boolean;
  shippingPostingDays: number;
  shippingItemWeight: number;
  shippingItemLength: number;
  shippingItemWidth: number;
  shippingItemHeight: number;
  shopAssistantEnabled: boolean;
  payPix: boolean;
  payCard: boolean;
  payBoleto: boolean;
  payMaxInstallments: number;
  payWindowMinutes: number;
};

/** Os erros de campos aninhados chegam com nomes diferentes (ex.: paymentMaxInstallments). */
function pick(errors: Record<string, string>, ...keys: string[]) {
  for (const key of keys) if (errors[key]) return errors[key];
  return undefined;
}

export function SettingsForm({
  initial,
  providerId,
  providerLabel,
  superFreteReady,
  aiReady,
}: {
  initial: SettingsFormValues;
  providerId: string;
  providerLabel: string;
  /** O token da SuperFrete está configurado no servidor. */
  superFreteReady: boolean;
  /** A chave de IA está configurada no servidor. */
  aiReady: boolean;
}) {
  const { state, onSubmit, pending } = useActionForm<FormState>(saveSettingsAction, {});
  const errors = state.errors ?? {};
  const [mode, setMode] = useState<"fixed" | "calculated">(initial.shippingMode);

  const [logoKey, setLogoKey] = useState(initial.logoKey ?? "");
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    setLogoBusy(true);
    setLogoError(null);
    const result = await uploadAdminImage<{ key?: string; url?: string }>(file, "logo");
    if (!result.ok || !result.data.key || !result.data.url) {
      setLogoError(result.ok ? "Não foi possível enviar o logo." : result.error);
    } else {
      setLogoKey(result.data.key);
      setLogoUrl(result.data.url);
    }
    setLogoBusy(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <input type="hidden" name="logoKey" value={logoKey} />

      <section className="panel space-y-4" aria-labelledby="cf-loja">
        <h2 id="cf-loja" className="text-2xl">
          A loja
        </h2>
        <Field label="Nome da loja" htmlFor="storeName" error={errors.storeName}>
          <input id="storeName" name="storeName" className="input" defaultValue={initial.storeName} maxLength={80} required />
        </Field>
        <Field label="Frase de destaque" htmlFor="tagline" error={errors.tagline} hint="Aparece no topo da página inicial. Ex.: Miniaturas de carros e colecionáveis.">
          <input id="tagline" name="tagline" className="input" defaultValue={initial.tagline} maxLength={120} />
        </Field>
        <Field label="Sobre a loja" htmlFor="description" error={errors.description} hint="Um parágrafo curto que também ajuda no Google.">
          <textarea id="description" name="description" className="textarea" rows={4} defaultValue={initial.description} maxLength={600} />
        </Field>

        <div>
          <p className="label">Logo</p>
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-20 w-40 place-items-center overflow-hidden rounded border border-line bg-white p-2">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo atual" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-sm text-ink-soft">Sem logo</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <input id="logo-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(e) => void uploadLogo(e.target.files?.[0])} />
              <label htmlFor="logo-file" className="btn btn-outline btn-sm cursor-pointer">
                <ImagePlus size={16} aria-hidden /> {logoBusy ? "Enviando..." : logoUrl ? "Trocar logo" : "Enviar logo"}
              </label>
              {logoUrl && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setLogoKey("");
                    setLogoUrl(null);
                  }}
                >
                  <Trash2 size={16} aria-hidden /> Remover
                </button>
              )}
            </div>
          </div>
          {logoError && <p className="field-error">{logoError}</p>}
          <p className="hint">Sem enviar nada, a loja usa a logo oficial da RT Multicolecionismo. Só envie outra imagem se quiser trocar. O logo só muda de verdade depois de salvar.</p>
        </div>
      </section>

      <section className="panel space-y-4" aria-labelledby="cf-contato">
        <h2 id="cf-contato" className="text-2xl">
          Contato
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="WhatsApp (com DDD)" htmlFor="whatsapp" error={errors.whatsapp} hint="Cria o botão de WhatsApp na loja. Se deixar em branco, o botão não aparece.">
            <input id="whatsapp" name="whatsapp" type="tel" className="input" defaultValue={initial.whatsapp} inputMode="tel" placeholder="(11) 90000-0000" />
          </Field>
          <Field label="Link do grupo de WhatsApp (opcional)" htmlFor="whatsappGroupUrl" error={errors.whatsappGroupUrl} hint="No WhatsApp: grupo > Convidar por link. Começa com https://chat.whatsapp.com/">
            <input id="whatsappGroupUrl" name="whatsappGroupUrl" type="url" className="input" defaultValue={initial.whatsappGroupUrl} inputMode="url" placeholder="https://chat.whatsapp.com/..." />
          </Field>
          <Field label="Telefone fixo ou outro (opcional)" htmlFor="phone" error={errors.phone}>
            <input id="phone" name="phone" type="tel" className="input" defaultValue={initial.phone} inputMode="tel" />
          </Field>
          <Field label="E-mail de contato" htmlFor="email" error={errors.email}>
            <input id="email" name="email" type="email" className="input" defaultValue={initial.email} />
          </Field>
          <Field label="Instagram" htmlFor="instagram" error={errors.instagram} hint="Só o usuário. Ex.: minhaloja">
            <input id="instagram" name="instagram" className="input" defaultValue={initial.instagram} maxLength={60} />
          </Field>
        </div>
        <Field label="Endereço (opcional)" htmlFor="addressText" error={errors.addressText} hint="Sem loja física? Deixe em branco: nada de endereço aparece no site.">
          <input id="addressText" name="addressText" className="input" defaultValue={initial.addressText} maxLength={300} />
        </Field>
        <Field label="Horário de atendimento" htmlFor="businessHours" error={errors.businessHours} hint="Ex.: Respondo pelo WhatsApp todos os dias.">
          <input id="businessHours" name="businessHours" className="input" defaultValue={initial.businessHours} maxLength={200} />
        </Field>
        <Field label="Aviso sobre eventos (opcional)" htmlFor="fairsNote" error={errors.fairsNote} hint="Aparece no rodapé, na página inicial e na página de eventos. As datas e os locais ficam em Eventos, no menu do painel; aqui não coloque datas que você não confirmou. Deixe em branco para não mostrar.">
          <input id="fairsNote" name="fairsNote" className="input" defaultValue={initial.fairsNote} maxLength={200} />
        </Field>
      </section>

      <section className="panel space-y-4" aria-labelledby="cf-entrega">
        <h2 id="cf-entrega" className="text-2xl">
          Entrega
        </h2>
        <label className="flex items-center gap-3">
          <input type="checkbox" className="checkbox" name="shippingDeliveryEnabled" defaultChecked={initial.shippingDeliveryEnabled} />
          <span>Fazer entregas</span>
        </label>
        {errors.shippingDeliveryEnabled && <p className="field-error">{errors.shippingDeliveryEnabled}</p>}

        <fieldset className="space-y-2">
          <legend className="label">Como calcular o frete?</legend>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="radio" name="shippingMode" value="fixed" checked={mode === "fixed"} onChange={() => setMode("fixed")} className="mt-1.5 h-5 w-5 accent-[var(--color-ink)]" />
            <span>
              <strong>Valor fixo</strong>
              <span className="block text-sm text-ink-soft">O mesmo valor em todo pedido. Simples, mas pode ficar mais caro ou mais barato que o frete real.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="shippingMode"
              value="calculated"
              checked={mode === "calculated"}
              onChange={() => setMode("calculated")}
              className="mt-1.5 h-5 w-5 accent-[var(--color-ink)]"
            />
            <span>
              <strong>Calculado pelo CEP do cliente (SuperFrete: SEDEX, PAC...)</strong>
              <span className="block text-sm text-ink-soft">
                Preço e prazo reais de cada pedido, pelo CEP e pelo peso das miniaturas. {superFreteReady ? "O token da SuperFrete já está no servidor." : "Falta colocar o token da SuperFrete no servidor (veja “Ligações” abaixo)."}
              </span>
            </span>
          </label>
        </fieldset>

        <div hidden={mode !== "calculated"} className="space-y-5 rounded-md border border-line bg-paper p-4">
          <div className="space-y-4">
            <h3 className="text-xl">De onde você envia</h3>
            <p className="text-sm text-ink-soft">
              O CEP é obrigatório: é com ele que a SuperFrete calcula o frete. O resto do endereço fica registrado aqui para você conferir e para as etiquetas.
            </p>
            <div className="grid gap-4 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <Field label="CEP de origem" htmlFor="shippingOriginCep" error={errors.shippingOriginCep}>
                  <input id="shippingOriginCep" name="shippingOriginCep" className="input" inputMode="numeric" maxLength={9} placeholder="00000-000" defaultValue={initial.shippingOriginCep} />
                </Field>
              </div>
              <div className="sm:col-span-4">
                <Field label="Rua" htmlFor="shippingOriginStreet" error={errors.shippingOriginStreet}>
                  <input id="shippingOriginStreet" name="shippingOriginStreet" className="input" maxLength={150} defaultValue={initial.shippingOriginStreet} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Número" htmlFor="shippingOriginNumber" error={errors.shippingOriginNumber}>
                  <input id="shippingOriginNumber" name="shippingOriginNumber" className="input" maxLength={20} defaultValue={initial.shippingOriginNumber} />
                </Field>
              </div>
              <div className="sm:col-span-4">
                <Field label="Complemento (opcional)" htmlFor="shippingOriginComplement" error={errors.shippingOriginComplement}>
                  <input id="shippingOriginComplement" name="shippingOriginComplement" className="input" maxLength={100} defaultValue={initial.shippingOriginComplement} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Bairro" htmlFor="shippingOriginNeighborhood" error={errors.shippingOriginNeighborhood}>
                  <input id="shippingOriginNeighborhood" name="shippingOriginNeighborhood" className="input" maxLength={100} defaultValue={initial.shippingOriginNeighborhood} />
                </Field>
              </div>
              <div className="sm:col-span-3">
                <Field label="Cidade" htmlFor="shippingOriginCity" error={errors.shippingOriginCity}>
                  <input id="shippingOriginCity" name="shippingOriginCity" className="input" maxLength={100} defaultValue={initial.shippingOriginCity} />
                </Field>
              </div>
              <div className="sm:col-span-1">
                <Field label="UF" htmlFor="shippingOriginState" error={errors.shippingOriginState}>
                  <input id="shippingOriginState" name="shippingOriginState" className="input uppercase" maxLength={2} placeholder="PR" defaultValue={initial.shippingOriginState} />
                </Field>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xl">Serviços que você oferece</h3>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <label className="flex items-center gap-3">
                <input type="checkbox" className="checkbox" name="shippingServiceSedex" defaultChecked={initial.shippingServiceSedex} /> SEDEX
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" className="checkbox" name="shippingServicePac" defaultChecked={initial.shippingServicePac} /> PAC
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" className="checkbox" name="shippingServiceMini" defaultChecked={initial.shippingServiceMini} /> Mini Envios
              </label>
            </div>
            {errors.shippingServiceSedex && <p className="field-error">{errors.shippingServiceSedex}</p>}
            <p className="hint">O cliente escolhe entre os serviços que a SuperFrete conseguir cotar para o CEP dele. O Mini Envios só vale para pacotes bem pequenos e leves.</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl">Ajustes do cálculo</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Acréscimo por pedido (R$)" htmlFor="shippingHandling" error={pick(errors, "shippingHandling", "shippingHandlingCents")} hint="Embalagem, caixa... Somado ao frete de cada opção. Em branco = nada.">
                <input id="shippingHandling" name="shippingHandling" className="input" inputMode="decimal" defaultValue={initial.shippingHandling} />
              </Field>
              <Field label="Dias para postar" htmlFor="shippingPostingDays" error={pick(errors, "shippingPostingDays")} hint="Seu tempo para embalar e levar aos Correios. É somado ao prazo mostrado. 0 = não somar.">
                <input id="shippingPostingDays" name="shippingPostingDays" className="input" inputMode="numeric" defaultValue={initial.shippingPostingDays} />
              </Field>
              <div className="flex items-start pt-7">
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="checkbox mt-1" name="shippingDeclareValue" defaultChecked={initial.shippingDeclareValue} />
                  <span>
                    Declarar o valor dos produtos
                    <span className="block text-sm text-ink-soft">Seguro dos Correios: o frete fica um pouco mais caro.</span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl">Peso e tamanho padrão de cada produto</h3>
            <p className="text-sm text-ink-soft">
              Usados para os produtos que não têm peso e medidas cadastrados (você pode cadastrar em cada produto). Os valores abaixo são só um exemplo de miniatura embalada: pese e meça uma de verdade e ajuste.
            </p>
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Peso (gramas)" htmlFor="shippingItemWeight" error={pick(errors, "shippingItemWeight", "shippingDefaultItemWeightGrams")}>
                <input id="shippingItemWeight" name="shippingItemWeight" className="input" inputMode="numeric" defaultValue={initial.shippingItemWeight} />
              </Field>
              <Field label="Comprimento (cm)" htmlFor="shippingItemLength" error={pick(errors, "shippingItemLength", "shippingDefaultItemLengthCm")}>
                <input id="shippingItemLength" name="shippingItemLength" className="input" inputMode="numeric" defaultValue={initial.shippingItemLength} />
              </Field>
              <Field label="Largura (cm)" htmlFor="shippingItemWidth" error={pick(errors, "shippingItemWidth", "shippingDefaultItemWidthCm")}>
                <input id="shippingItemWidth" name="shippingItemWidth" className="input" inputMode="numeric" defaultValue={initial.shippingItemWidth} />
              </Field>
              <Field label="Altura (cm)" htmlFor="shippingItemHeight" error={pick(errors, "shippingItemHeight", "shippingDefaultItemHeightCm")}>
                <input id="shippingItemHeight" name="shippingItemHeight" className="input" inputMode="numeric" defaultValue={initial.shippingItemHeight} />
              </Field>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label={mode === "calculated" ? "Valor fixo de reserva (R$)" : "Valor do frete (R$)"}
            htmlFor="shippingFlatRate"
            error={errors.shippingFlatRate}
            hint={
              mode === "calculated"
                ? "Usado só se o cálculo pelo CEP falhar. Em branco ou 0 = sem reserva: o cliente é orientado a falar com a loja."
                : "Valor fixo por pedido. 0 = entrega grátis."
            }
          >
            <input id="shippingFlatRate" name="shippingFlatRate" className="input" inputMode="decimal" defaultValue={initial.shippingFlatRate} />
          </Field>
          <Field
            label="Frete grátis a partir de (R$)"
            htmlFor="shippingFreeAbove"
            error={errors.shippingFreeAbove}
            hint={mode === "calculated" ? "Opcional. Vale para a opção de envio mais barata. Deixe em branco para não ter." : "Opcional. Deixe em branco para não ter."}
          >
            <input id="shippingFreeAbove" name="shippingFreeAbove" className="input" inputMode="decimal" defaultValue={initial.shippingFreeAbove} />
          </Field>
          <Field
            label={mode === "calculated" ? "Prazo do valor de reserva" : "Prazo de entrega"}
            htmlFor="shippingEstimate"
            error={pick(errors, "shippingEstimate")}
            hint="Texto livre. Ex.: 3 a 7 dias úteis."
          >
            <input id="shippingEstimate" name="shippingEstimate" className="input" defaultValue={initial.shippingEstimate} maxLength={80} />
          </Field>
        </div>
        <label className="flex items-center gap-3">
          <input type="checkbox" className="checkbox" name="shippingPickupEnabled" defaultChecked={initial.shippingPickupEnabled} />
          <span>Permitir retirada em mãos (sem frete, combinada com você)</span>
        </label>
        <Field label="Instruções de retirada" htmlFor="shippingPickupInstructions" error={pick(errors, "shippingPickupInstructions")} hint="Aparece para o cliente que escolher retirar. Ex.: combino o local e o dia pelo WhatsApp ou nos eventos.">
          <input id="shippingPickupInstructions" name="shippingPickupInstructions" className="input" defaultValue={initial.shippingPickupInstructions} maxLength={300} />
        </Field>
      </section>

      <section className="panel space-y-4" aria-labelledby="cf-pagamento">
        <h2 id="cf-pagamento" className="text-2xl">
          Formas de pagamento
        </h2>
        {providerId === "mercadopago" ? (
          <>
        <p className="text-sm text-ink-soft">Escolha o que aparece na tela de pagamento do {providerLabel}.</p>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <label className="flex items-center gap-3">
            <input type="checkbox" className="checkbox" name="payPix" defaultChecked={initial.payPix} /> Pix
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" className="checkbox" name="payCard" defaultChecked={initial.payCard} /> Cartão
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" className="checkbox" name="payBoleto" defaultChecked={initial.payBoleto} /> Boleto
          </label>
        </div>
        {errors.payPix && <p className="field-error">{errors.payPix}</p>}
          </>
        ) : (
          <>
            <p className="text-sm text-ink-soft">
              O pagamento é feito na página do {providerLabel}; as opções ({providerId === "infinitepay" ? "Pix, cartão" : "saldo, cartão etc."}) e as taxas dependem da sua conta {providerLabel}. Aqui você só define o prazo.
            </p>
            {initial.payPix && <input type="hidden" name="payPix" value="on" />}
            {initial.payCard && <input type="hidden" name="payCard" value="on" />}
            {initial.payBoleto && <input type="hidden" name="payBoleto" value="on" />}
            {!initial.payPix && !initial.payCard && !initial.payBoleto && <input type="hidden" name="payPix" value="on" />}
            <input type="hidden" name="payMaxInstallments" value={initial.payMaxInstallments} />
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {providerId === "mercadopago" && (
          <Field label="Parcelas no cartão (máximo)" htmlFor="payMaxInstallments" error={pick(errors, "payMaxInstallments", "paymentMaxInstallments")} hint="De 1 a 12. Juros, se houver, dependem da sua conta no Mercado Pago.">
            <input id="payMaxInstallments" name="payMaxInstallments" className="input" inputMode="numeric" defaultValue={initial.payMaxInstallments} />
          </Field>
          )}
          <Field
            label="Prazo para pagar o pedido (minutos)"
            htmlFor="payWindowMinutes"
            error={pick(errors, "payWindowMinutes", "paymentWindowMinutes")}
            hint="Passou desse tempo sem pagar, o pedido é cancelado e o estoque volta. De 15 a 4320 (3 dias)."
          >
            <input id="payWindowMinutes" name="payWindowMinutes" className="input" inputMode="numeric" defaultValue={initial.payWindowMinutes} />
          </Field>
        </div>
      </section>

      <section className="panel space-y-3" aria-labelledby="cf-assistente">
        <h2 id="cf-assistente" className="text-2xl">
          Assistente de compras (IA)
        </h2>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="checkbox mt-1" name="shopAssistantEnabled" defaultChecked={initial.shopAssistantEnabled} />
          <span>
            Mostrar o assistente de IA para os clientes
            <span className="block text-sm text-ink-soft">
              Um chat no canto da loja que ajuda o cliente a achar miniaturas e tirar dúvidas, usando só os produtos publicados e o que está configurado aqui. Se ele não souber, oferece o seu WhatsApp.
              {aiReady ? " A chave de IA já está no servidor." : " Ele só aparece depois que a chave de IA estiver configurada no servidor (veja “Ligações” abaixo)."}
            </span>
          </span>
        </label>
      </section>

      <div className="space-y-3">
        {state.message && <Alert tone={state.ok ? "ok" : "error"}>{state.message}</Alert>}
        <button type="submit" className="btn btn-primary" disabled={pending || logoBusy}>
          {pending ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>
    </form>
  );
}
