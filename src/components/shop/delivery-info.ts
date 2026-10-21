import { getPaymentProvider } from "@/server/payments";
import { formBRLShort } from "./format";
import type { StoreSettings } from "@/server/services/settings";

/** Frases sobre entrega e pagamento, montadas SOMENTE com o que está nas configurações da loja (valor fixo ou frete pelo CEP). */
export function deliveryLines(settings: StoreSettings): string[] {
  const lines: string[] = [];
  const s = settings.shipping;
  if (s.deliveryEnabled && s.mode === "calculated") {
    // Frete pelo CEP: o preço e o prazo dependem do cliente. O valor fixo do painel é só reserva e NUNCA deve aparecer aqui.
    const services = [s.services.sedex && "SEDEX", s.services.pac && "PAC", s.services.mini && "Mini Envios"].filter(Boolean).join(" e ");
    lines.push(`Entrega pelos Correios${services ? ` (${services})` : ""}: o valor e o prazo são calculados pelo seu CEP, no carrinho e no checkout.`);
    if (s.freeAboveCents !== null) {
      lines.push(`Frete grátis (na opção mais barata) em compras a partir de ${formBRLShort(s.freeAboveCents)}.`);
    }
  } else if (s.deliveryEnabled) {
    lines.push(
      s.flatRateCents > 0
        ? `Entrega: ${s.estimate || "prazo informado no checkout"}. Frete de ${formBRLShort(s.flatRateCents)}.`
        : `Entrega grátis: ${s.estimate || "prazo informado no checkout"}.`,
    );
    if (s.freeAboveCents !== null && s.flatRateCents > 0) {
      lines.push(`Frete grátis em compras a partir de ${formBRLShort(s.freeAboveCents)}.`);
    }
  }
  if (s.pickupEnabled) lines.push(s.pickupInstructions ? `Retirada em mãos: ${s.pickupInstructions}` : "Retirada em mãos combinada com a loja.");
  return lines;
}

export function paymentLines(settings: StoreSettings): string[] {
  // No PayPal quem escolhe as opções (saldo, cartão...) é o próprio PayPal; as caixas Pix/cartão/boleto só valem para o Mercado Pago.
  const providerId = getPaymentProvider().id;
  if (providerId === "infinitepay") return ["Pagamento online seguro pelo InfinitePay: Pix ou cartão."];
  if (providerId !== "mercadopago") return ["Pagamento online seguro pelo PayPal."];
  const methods: string[] = [];
  if (settings.payment.pix) methods.push("Pix");
  if (settings.payment.card) {
    methods.push(settings.payment.maxInstallments > 1 ? `cartão em até ${settings.payment.maxInstallments}x` : "cartão");
  }
  if (settings.payment.boleto) methods.push("boleto");
  return methods.length ? [`Pagamento online seguro pelo Mercado Pago: ${methods.join(", ")}.`] : [];
}
