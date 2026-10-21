import { getEnv } from "../env";
import { InfinitePayProvider } from "./infinitepay";
import { MercadoPagoProvider } from "./mercadopago";
import { PayPalProvider } from "./paypal";
import type { PaymentProvider } from "./types";

export type { PaymentProvider, ProviderPayment, CreateCheckoutInput, CheckoutSession } from "./types";

/** Único ponto que decide qual gateway a loja usa (variável PAYMENT_PROVIDER: paypal, infinitepay ou mercadopago; padrão: PayPal). */
export function getPaymentProvider(): PaymentProvider {
  const id = getEnv().paymentProvider;
  if (id === "mercadopago") return new MercadoPagoProvider();
  if (id === "infinitepay") return new InfinitePayProvider();
  return new PayPalProvider();
}

export function isPaymentConfigured(): boolean {
  return getPaymentProvider().isConfigured();
}
