import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/shop/checkout-form";
import { paymentLines } from "@/components/shop/delivery-info";
import { whatsappLink } from "@/lib/text";
import { requireUser } from "@/server/auth/current-user";
import { getRequestCart } from "@/server/cart-session";
import { getPaymentProvider, isPaymentConfigured } from "@/server/payments";
import { listAddresses } from "@/server/services/addresses";
import { getSettings } from "@/server/services/settings";
import { getShippingOptions } from "@/server/shipping";
import { cartToQuoteItems } from "@/server/shipping/cart-items";

export const metadata: Metadata = { title: "Finalizar compra", robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  // Visitante vai para o login e volta aqui; o carrinho dele é levado junto para a conta.
  const user = await requireUser("/checkout");

  const cart = await getRequestCart();
  if (cart.lines.length === 0 || cart.hasIssues) redirect("/carrinho");

  const [settings, addresses, shippingOptions] = await Promise.all([
    getSettings(),
    listAddresses(user.id),
    getShippingOptions({ subtotalCents: cart.subtotalCents, destinationCep: null, items: cartToQuoteItems(cart) }),
  ]);

  return (
    <div className="container-page py-10">
      <h1>Finalizar compra</h1>
      <p className="mt-2 text-ink-soft">
        Comprando como <strong>{user.name}</strong> ({user.email}).
      </p>

      <div className="mt-6">
        <CheckoutForm
          addresses={addresses.map((a) => ({
            id: a.id,
            label: a.label,
            recipientName: a.recipientName,
            phone: a.phone,
            cep: a.cep,
            street: a.street,
            number: a.number,
            complement: a.complement,
            neighborhood: a.neighborhood,
            city: a.city,
            state: a.state,
            isDefault: a.isDefault,
          }))}
          shippingOptions={shippingOptions}
          deliveryMode={settings.shipping.mode === "calculated" && settings.shipping.deliveryEnabled ? "quoted" : "flat"}
          lines={cart.lines.map((l) => ({ id: l.itemId, name: l.name, quantity: l.quantity, lineTotalCents: l.lineTotalCents }))}
          subtotalCents={cart.subtotalCents}
          paymentReady={isPaymentConfigured()}
          paymentSummary={paymentLines(settings).join(" ")}
          providerLabel={getPaymentProvider().label}
          whatsappHref={whatsappLink(settings.whatsapp, "Olá! Preciso de ajuda para finalizar minha compra.")}
          customer={{ name: user.name, phone: user.phone }}
        />
      </div>
    </div>
  );
}
