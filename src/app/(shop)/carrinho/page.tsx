import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { CartLineControls, NormalizeCartButton } from "@/components/shop/cart-controls";
import { Alert, EmptyState } from "@/components/ui";
import { NoPhoto } from "@/components/shop/no-photo";
import { ShippingCalculator } from "@/components/shop/shipping-calculator";
import { formatBRL } from "@/lib/money";
import { getRequestCart } from "@/server/cart-session";
import { getSettings } from "@/server/services/settings";
import { getShippingOptions } from "@/server/shipping";
import { cartToQuoteItems } from "@/server/shipping/cart-items";
import { fileUrl } from "@/server/storage";

export const metadata: Metadata = { title: "Carrinho", robots: { index: false, follow: false } };

export default async function CartPage() {
  const cart = await getRequestCart();

  if (cart.lines.length === 0) {
    return (
      <div className="container-page py-10">
        <h1>Seu carrinho</h1>
        <div className="mt-6">
          <EmptyState
            title="Seu carrinho está vazio"
            action={
              <Link href="/produtos" className="btn btn-primary">
                Ver os produtos
              </Link>
            }
          >
            Escolha um produto e ele aparece aqui.
          </EmptyState>
        </div>
      </div>
    );
  }

  const settings = await getSettings();
  // Só para mostrar uma estimativa; o frete que vale é recalculado no servidor ao finalizar.
  const calculated = settings.shipping.mode === "calculated" && settings.shipping.deliveryEnabled;
  // No frete calculado pelo CEP, a entrega só ganha preço depois que o cliente informa o CEP; aqui sobra só a retirada.
  const shippingOptions = await getShippingOptions({ subtotalCents: cart.subtotalCents, destinationCep: null, items: cartToQuoteItems(cart) });
  const freeAbove = settings.shipping.deliveryEnabled ? settings.shipping.freeAboveCents : null;
  const missingForFree = freeAbove !== null && cart.subtotalCents < freeAbove ? freeAbove - cart.subtotalCents : null;

  return (
    <div className="container-page py-10">
      <h1>Seu carrinho</h1>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section aria-label="Itens do carrinho">
          {cart.hasIssues && (
            <Alert tone="warn" className="mb-4">
              Alguns itens mudaram de estoque ou saíram da loja. Veja os avisos abaixo e ajuste o carrinho para continuar.
            </Alert>
          )}

          <ul className="divide-y divide-line rounded-md bg-white">
            {cart.lines.map((line) => {
              const thumb = fileUrl(line.thumbKey);
              return (
                <li key={line.itemId} className="grid grid-cols-[5.5rem_1fr] gap-4 p-4 sm:grid-cols-[7rem_1fr_auto]">
                  <Link href={`/produtos/${line.slug}`} className="block aspect-square overflow-hidden rounded bg-panel" tabIndex={-1} aria-hidden>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <NoPhoto compact />
                    )}
                  </Link>

                  <div className="min-w-0 space-y-2">
                    <Link href={`/produtos/${line.slug}`} className="block text-lg font-bold leading-snug text-ink">
                      {line.name}
                    </Link>
                    <p className="text-sm text-ink-soft">
                      {formatBRL(line.unitPriceCents)} cada
                      {line.unitPriceCents < line.originalPriceCents && (
                        <span className="ml-2 line-through">{formatBRL(line.originalPriceCents)}</span>
                      )}
                    </p>
                    {line.issue && (
                      <p className="text-sm font-semibold text-enamel-deep" role="alert">
                        {line.issue}
                      </p>
                    )}
                    <CartLineControls itemId={line.itemId} quantity={line.quantity} stock={line.stock} productName={line.name} />
                  </div>

                  <p className="col-span-2 text-right text-lg font-extrabold tabular-nums sm:col-span-1">
                    {formatBRL(line.lineTotalCents)}
                  </p>
                </li>
              );
            })}
          </ul>

          <p className="mt-4">
            <Link href="/produtos">← Continuar comprando</Link>
          </p>
        </section>

        <aside aria-label="Resumo do pedido" className="panel space-y-4 lg:sticky lg:top-4">
          <h2 className="text-2xl">Resumo</h2>

          <dl className="space-y-2">
            <div className="flex justify-between gap-4">
              <dt>
                Produtos ({cart.itemCount} {cart.itemCount === 1 ? "item" : "itens"})
              </dt>
              <dd className="font-bold tabular-nums">{formatBRL(cart.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between gap-4 text-ink-soft">
              <dt>Frete</dt>
              <dd>calculado ao finalizar</dd>
            </div>
          </dl>

          {calculated && <ShippingCalculator />}

          {shippingOptions.length > 0 && (
            <ul className="space-y-1 rounded bg-panel p-3 text-sm">
              {shippingOptions.map((option) => (
                <li key={option.code}>
                  <strong>{option.label}:</strong> {option.priceCents === 0 ? "grátis" : formatBRL(option.priceCents)}
                  {option.estimate ? ` — ${option.estimate}` : ""}
                </li>
              ))}
              {missingForFree !== null && !calculated && (
                <li className="text-ink-soft">Faltam {formatBRL(missingForFree)} para o frete grátis na entrega.</li>
              )}
            </ul>
          )}
          {calculated && missingForFree !== null && (
            <p className="text-sm text-ink-soft">Faltam {formatBRL(missingForFree)} para o frete grátis (na opção de entrega mais barata).</p>
          )}

          <div className="flex items-end justify-between gap-4 border-t border-line pt-4">
            <span className="font-bold">Total dos produtos</span>
            <span className="text-2xl font-extrabold tabular-nums">{formatBRL(cart.subtotalCents)}</span>
          </div>

          {cart.hasIssues ? (
            <NormalizeCartButton />
          ) : (
            <Link href="/checkout" className="btn btn-primary btn-block">
              <ShoppingBag size={20} aria-hidden /> Finalizar compra
            </Link>
          )}
          <p className="text-center text-sm text-ink-soft">Você confere tudo antes de pagar.</p>
        </aside>
      </div>
    </div>
  );
}
