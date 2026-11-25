"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { AddressFields } from "@/components/shop/address-fields";
import { useShippingQuote } from "@/components/shop/use-shipping-quote";
import { Alert, Field } from "@/components/ui";
import { useActionForm } from "@/components/use-action-form";
import { formatBRL } from "@/lib/money";
import { cn, formatCep, formatPhone } from "@/lib/text";
import { placeOrderAction } from "@/server/actions/checkout";
import { previewCouponAction } from "@/server/actions/coupons";
import type { FormState } from "@/server/actions/shared";

export type CheckoutAddress = {
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

export type CheckoutShippingOption = {
  code: string;
  label: string;
  priceCents: number;
  estimate: string | null;
  requiresAddress: boolean;
  description?: string;
};

export type CheckoutLine = { id: string; name: string; quantity: number; lineTotalCents: number };

function ShippingOptionRadio({ option, selected, onSelect }: { option: CheckoutShippingOption; selected: boolean; onSelect: () => void }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-md border-2 p-3",
        selected ? "border-ink bg-panel" : "border-line bg-white hover:border-ink-soft",
      )}
    >
      <input type="radio" name="shippingCode" value={option.code} checked={selected} onChange={onSelect} className="mt-1.5 h-5 w-5 accent-[var(--color-ink)]" />
      <span className="flex-1">
        <span className="flex flex-wrap justify-between gap-x-4">
          <strong>{option.label}</strong>
          <strong className="tabular-nums">{option.priceCents === 0 ? "Grátis" : formatBRL(option.priceCents)}</strong>
        </span>
        {option.estimate && <span className="block text-sm text-ink-soft">{option.estimate}</span>}
        {option.description && <span className="block text-sm text-ink-soft">{option.description}</span>}
      </span>
    </label>
  );
}

export function CheckoutForm({
  addresses,
  shippingOptions,
  deliveryMode,
  lines,
  subtotalCents,
  paymentReady,
  paymentSummary,
  providerLabel,
  whatsappHref,
  customer,
}: {
  addresses: CheckoutAddress[];
  /** No frete fixo: todas as opções. No frete calculado pelo CEP ("quoted"): só as que não dependem do CEP (retirada). */
  shippingOptions: CheckoutShippingOption[];
  /** "flat" = valor fixo; "quoted" = a entrega é calculada pelo CEP do endereço escolhido. */
  deliveryMode: "flat" | "quoted";
  lines: CheckoutLine[];
  subtotalCents: number;
  paymentReady: boolean;
  paymentSummary: string;
  /** Nome do serviço de pagamento (ex.: PayPal). */
  providerLabel: string;
  whatsappHref: string | null;
  customer: { name: string; phone: string | null };
}) {
  const { state, onSubmit, pending } = useActionForm<FormState>(placeOrderAction, {});
  const errors = state.errors ?? {};

  const quoted = deliveryMode === "quoted";
  const [method, setMethod] = useState<"delivery" | "pickup">("delivery");
  const [shippingCode, setShippingCode] = useState(quoted ? "" : (shippingOptions[0]?.code ?? ""));
  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];
  const [addressId, setAddressId] = useState<string>(defaultAddress?.id ?? "new");
  const [newCep, setNewCep] = useState("");
  const { state: quoteState, quote, reset } = useShippingQuote();
  const router = useRouter();

  // CEP do endereço escolhido (ou digitado): é com ele que o servidor calcula o frete.
  const selectedAddress = addresses.find((a) => a.id === addressId);
  const destinationCep = (addressId === "new" ? newCep : (selectedAddress?.cep ?? "")).replace(/\D/g, "");
  const quoting = quoted && method === "delivery";

  useEffect(() => {
    if (!quoting) return;
    if (destinationCep.length === 8) void quote(destinationCep);
    else reset();
  }, [quoting, destinationCep, quote, reset]);

  // O servidor recusou porque o frete mudou desde que a tela foi montada: atualiza os valores na tela para a pessoa conferir o novo total.
  const priceChanged = Boolean(errors.shippingCode?.startsWith("O valor do frete foi atualizado"));
  useEffect(() => {
    if (!priceChanged) return;
    if (!quoted) router.refresh();
    else if (method === "delivery" && destinationCep.length === 8) void quote(destinationCep);
  }, [priceChanged, state, quoted, method, destinationCep, quote, router]);

  const quoteIsCurrent = quoteState.status === "ok" && quoteState.cep === destinationCep;
  const deliveryOptions = quoteIsCurrent ? quoteState.options : [];
  const options: CheckoutShippingOption[] = !quoted ? shippingOptions : method === "pickup" ? shippingOptions : deliveryOptions;
  const effectiveCode = options.some((o) => o.code === shippingCode) ? shippingCode : (options[0]?.code ?? "");
  const shipping = options.find((o) => o.code === effectiveCode);
  const needsAddress = quoted ? method === "delivery" : (shipping?.requiresAddress ?? false);
  // Cupom: o servidor devolve o desconto; aqui só mostramos. Ao criar o pedido, o servidor confere tudo de novo.
  const [couponText, setCouponText] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discountCents: number } | null>(null);
  const [couponMessage, setCouponMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [couponPending, startCoupon] = useTransition();
  const applyCoupon = useCallback(
    (text: string) => {
      const fd = new FormData();
      fd.set("couponCode", text);
      startCoupon(async () => {
        const result = await previewCouponAction({}, fd);
        if (result.ok && result.code && result.discountCents !== undefined) {
          setCoupon({ code: result.code, discountCents: result.discountCents });
          setCouponText(result.code);
          setCouponMessage({ ok: true, text: result.message ?? "Cupom aplicado." });
        } else {
          setCoupon(null);
          setCouponMessage({ ok: false, text: result.errors?.couponCode ?? result.message ?? "Não foi possível aplicar o cupom." });
        }
      });
    },
    [startCoupon],
  );
  const discountChanged = Boolean(errors.couponCode?.startsWith("O desconto mudou"));
  useEffect(() => {
    if (discountChanged && coupon) applyCoupon(coupon.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountChanged, state]);
  const couponTyped = couponText.trim() !== "" && couponText.trim().toUpperCase() !== coupon?.code;
  const discountCents = coupon?.discountCents ?? 0;

  const totalCents = subtotalCents + (shipping?.priceCents ?? 0) - discountCents;
  const canSubmit = paymentReady && Boolean(shipping) && !pending && !couponPending && !couponTyped;
  // Número do último passo: entrega (1) + endereço ou retirada (se houver) + envio calculado (se houver) + observação.
  const noteStep = 1 + (needsAddress || shipping ? 1 : 0) + (quoting ? 1 : 0) + 1;

  return (
    <form
      onSubmit={onSubmit}
      onInput={(event) => {
        const target = event.target as HTMLInputElement;
        if (target.name === "addr_cep") setNewCep(target.value);
      }}
      noValidate
      className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start"
    >
      {shipping && <input type="hidden" name="expectedShippingCents" value={shipping.priceCents} />}
      {coupon && <input type="hidden" name="couponCode" value={coupon.code} />}
      {coupon && <input type="hidden" name="expectedDiscountCents" value={coupon.discountCents} />}
      {quoted && method === "pickup" && shipping && <input type="hidden" name="shippingCode" value={shipping.code} />}
      <div className="space-y-8">
        {/* 1. Entrega */}
        <section role="radiogroup" aria-labelledby="co-entrega" className="panel space-y-3">
          <h2 id="co-entrega" className="text-2xl">
            1. Como você quer receber?
          </h2>
          {quoted ? (
            <>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border-2 p-3",
                  method === "delivery" ? "border-ink bg-panel" : "border-line bg-white hover:border-ink-soft",
                )}
              >
                <input
                  type="radio"
                  name="deliveryMethod"
                  value="delivery"
                  checked={method === "delivery"}
                  onChange={() => setMethod("delivery")}
                  className="mt-1.5 h-5 w-5 accent-[var(--color-ink)]"
                />
                <span className="flex-1">
                  <strong>Receber em casa</strong>
                  <span className="block text-sm text-ink-soft">O valor e o prazo são calculados pelo CEP do endereço de entrega.</span>
                </span>
              </label>
              {shippingOptions.map((option) => (
                <label
                  key={option.code}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border-2 p-3",
                    method === "pickup" ? "border-ink bg-panel" : "border-line bg-white hover:border-ink-soft",
                  )}
                >
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value="pickup"
                    checked={method === "pickup"}
                    onChange={() => {
                      setMethod("pickup");
                      setShippingCode(option.code);
                    }}
                    className="mt-1.5 h-5 w-5 accent-[var(--color-ink)]"
                  />
                  <span className="flex-1">
                    <span className="flex flex-wrap justify-between gap-x-4">
                      <strong>{option.label}</strong>
                      <strong>Grátis</strong>
                    </span>
                    {option.estimate && <span className="block text-sm text-ink-soft">{option.estimate}</span>}
                    {option.description && <span className="block text-sm text-ink-soft">{option.description}</span>}
                  </span>
                </label>
              ))}
            </>
          ) : shippingOptions.length === 0 ? (
            <Alert tone="warn">
              A loja não está com nenhuma forma de entrega ativa no momento.{" "}
              {whatsappHref && (
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  Fale com a loja no WhatsApp
                </a>
              )}
            </Alert>
          ) : (
            shippingOptions.map((option) => (
              <ShippingOptionRadio key={option.code} option={option} selected={option.code === effectiveCode} onSelect={() => setShippingCode(option.code)} />
            ))
          )}
          {!quoted && errors.shippingCode && <p className="field-error">{errors.shippingCode}</p>}
        </section>

        {/* 2. Endereço (só quando a entrega precisa de endereço) */}
        {needsAddress ? (
          <section role="radiogroup" aria-labelledby="co-endereco" className="panel space-y-4">
            <h2 id="co-endereco" className="text-2xl">
              2. Endereço de entrega
            </h2>

            {addresses.map((address) => {
              const selected = addressId === address.id;
              return (
                <label
                  key={address.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border-2 p-3",
                    selected ? "border-ink bg-panel" : "border-line bg-white hover:border-ink-soft",
                  )}
                >
                  <input
                    type="radio"
                    name="addressId"
                    value={address.id}
                    checked={selected}
                    onChange={() => setAddressId(address.id)}
                    className="mt-1.5 h-5 w-5 accent-[var(--color-ink)]"
                  />
                  <span className="text-sm leading-relaxed">
                    <strong className="text-base">{address.label || address.recipientName}</strong>
                    {address.isDefault && <span className="ml-2 badge badge-neutral">Padrão</span>}
                    <span className="block">
                      {address.street}, {address.number}
                      {address.complement ? ` — ${address.complement}` : ""}
                    </span>
                    <span className="block">
                      {address.neighborhood} · {address.city}/{address.state} · CEP {formatCep(address.cep)}
                    </span>
                    <span className="block text-ink-soft">Recebe: {address.recipientName}</span>
                  </span>
                </label>
              );
            })}

            <label
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-md border-2 p-3",
                addressId === "new" ? "border-ink bg-panel" : "border-line bg-white hover:border-ink-soft",
              )}
            >
              <input
                type="radio"
                name="addressId"
                value="new"
                checked={addressId === "new"}
                onChange={() => setAddressId("new")}
                className="h-5 w-5 accent-[var(--color-ink)]"
              />
              <strong>{addresses.length > 0 ? "Usar outro endereço" : "Informar o endereço de entrega"}</strong>
            </label>
            {errors.addressId && <p className="field-error">{errors.addressId}</p>}

            {addressId === "new" && (
              <div className="rounded-md bg-paper p-4">
                <AddressFields
                  prefix="addr_"
                  errors={errors}
                  defaults={{ recipientName: customer.name, phone: customer.phone ? formatPhone(customer.phone) : "" }}
                  showDefaultCheckbox={addresses.length > 0}
                />
                <p className="hint mt-3">Este endereço fica salvo na sua conta para as próximas compras.</p>
              </div>
            )}
          </section>
        ) : (
          shipping && (
            <div className="panel">
              <h2 className="text-2xl">2. Retirada em mãos</h2>
              <p className="mt-2 text-ink-soft">
                {shipping.description || "Você não precisa informar endereço. A loja combina a retirada com você pelo WhatsApp ou e-mail após o pagamento."}
              </p>
            </div>
          )
        )}

        {/* 3. Envio calculado pelo CEP (só no frete calculado) */}
        {quoting && (
          <section role="radiogroup" aria-labelledby="co-frete" className="panel space-y-3">
            <h2 id="co-frete" className="text-2xl">
              3. Escolha o envio
            </h2>
            {destinationCep.length !== 8 ? (
              <p className="text-ink-soft">Escolha ou informe o endereço (com o CEP) para ver o valor e o prazo do frete.</p>
            ) : quoteState.status === "loading" || (quoteState.status === "ok" && !quoteIsCurrent) ? (
              <p className="text-ink-soft" role="status">
                Calculando o frete...
              </p>
            ) : quoteState.status === "error" ? (
              <Alert tone="warn">
                {quoteState.message}{" "}
                <button type="button" className="btn btn-outline btn-sm" onClick={() => void quote(destinationCep)}>
                  Tentar de novo
                </button>
              </Alert>
            ) : deliveryOptions.length === 0 ? (
              <Alert tone="warn">
                {quoteState.status === "ok" && quoteState.notice ? quoteState.notice : "Não há entrega disponível para este CEP."}{" "}
                {whatsappHref && (
                  <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                    Fale com a loja no WhatsApp
                  </a>
                )}
              </Alert>
            ) : (
              <>
                {quoteState.status === "ok" && quoteState.notice && <Alert tone="info">{quoteState.notice}</Alert>}
                {deliveryOptions.map((option) => (
                  <ShippingOptionRadio key={option.code} option={option} selected={option.code === effectiveCode} onSelect={() => setShippingCode(option.code)} />
                ))}
              </>
            )}
            {errors.shippingCode && <p className="field-error">{errors.shippingCode}</p>}
          </section>
        )}

        {/* Cupom */}
        <div className="panel">
          <h2 className="text-2xl">Cupom de desconto (opcional)</h2>
          <div className="mt-3 flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <label className="label" htmlFor="coupon-input">
                Código do cupom
              </label>
              <input
                id="coupon-input"
                className="input uppercase"
                value={couponText}
                maxLength={40}
                autoCapitalize="characters"
                autoComplete="off"
                onChange={(e) => {
                  setCouponText(e.target.value);
                  setCouponMessage(null);
                }}
                onKeyDown={(e) => {
                  // Enter aqui aplica o cupom, não envia o pedido.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (couponText.trim()) applyCoupon(couponText);
                  }
                }}
              />
            </div>
            <button type="button" className="btn btn-outline mt-7" disabled={couponPending || !couponText.trim()} onClick={() => applyCoupon(couponText)}>
              {couponPending ? "Conferindo..." : "Aplicar"}
            </button>
            {coupon && (
              <button
                type="button"
                className="btn btn-outline mt-7"
                onClick={() => {
                  setCoupon(null);
                  setCouponText("");
                  setCouponMessage(null);
                }}
              >
                Remover
              </button>
            )}
          </div>
          {couponMessage && (
            <p role="status" className={couponMessage.ok ? "mt-2 text-sm font-semibold text-ok" : "field-error"}>
              {couponMessage.text}
            </p>
          )}
          {couponTyped && !couponMessage && <p className="hint mt-2">Clique em “Aplicar” para usar o cupom, ou apague o código.</p>}
          {errors.couponCode && !discountChanged && <p className="field-error">{errors.couponCode}</p>}
        </div>

        {/* 3. Observação */}
        <div className="panel">
          <h2 className="text-2xl">{noteStep}. Observação (opcional)</h2>
          <div className="mt-3">
            <Field label="Algo que a loja precisa saber?" htmlFor="note" error={errors.note}>
              <textarea id="note" name="note" className="textarea" maxLength={300} rows={3} />
            </Field>
          </div>
        </div>
      </div>

      {/* Resumo */}
      <aside aria-label="Resumo do pedido" className="panel space-y-4 lg:sticky lg:top-4">
        <h2 className="text-2xl">Seu pedido</h2>
        <ul className="space-y-2 text-sm">
          {lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-3">
              <span>
                {line.quantity}× {line.name}
              </span>
              <span className="tabular-nums">{formatBRL(line.lineTotalCents)}</span>
            </li>
          ))}
        </ul>

        <dl className="space-y-2 border-t border-line pt-3">
          <div className="flex justify-between gap-4">
            <dt>Produtos</dt>
            <dd className="tabular-nums">{formatBRL(subtotalCents)}</dd>
          </div>
          {coupon && discountCents > 0 && (
            <div className="flex justify-between gap-4 text-ok">
              <dt>Cupom {coupon.code}</dt>
              <dd className="tabular-nums">− {formatBRL(discountCents)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt>{shipping?.label ?? "Frete"}</dt>
            <dd className="tabular-nums">{shipping ? (shipping.priceCents === 0 ? "Grátis" : formatBRL(shipping.priceCents)) : "—"}</dd>
          </div>
          <div className="flex items-end justify-between gap-4 border-t border-line pt-3">
            <dt className="font-bold">Total</dt>
            <dd className="text-2xl font-extrabold tabular-nums">{formatBRL(totalCents)}</dd>
          </div>
        </dl>

        <p className="text-sm text-ink-soft">{paymentSummary}</p>

        {!paymentReady && (
          <Alert tone="warn">
            O pagamento online ainda não está ativo nesta loja, por isso não dá para finalizar por aqui.{" "}
            {whatsappHref ? (
              <>
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  Fale com a loja no WhatsApp
                </a>
                .
              </>
            ) : (
              "Volte em breve ou procure a loja nos eventos."
            )}
          </Alert>
        )}
        {state.message && !state.ok && <Alert tone="error">{state.message}</Alert>}

        <button type="submit" className="btn btn-primary btn-block" disabled={!canSubmit}>
          <Lock size={18} aria-hidden /> {pending ? "Enviando..." : "Ir para o pagamento"}
        </button>
        <p className="text-center text-sm text-ink-soft">
          Você paga em um ambiente seguro do {providerLabel}. Os dados do cartão não passam por esta loja.
        </p>
      </aside>
    </form>
  );
}
