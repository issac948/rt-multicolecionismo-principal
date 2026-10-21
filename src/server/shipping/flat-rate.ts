import type { StoreSettings } from "../services/settings";
import {
  SHIPPING_CODE_DELIVERY,
  SHIPPING_CODE_PICKUP,
  type ShippingOption,
  type ShippingProvider,
  type ShippingQuoteInput,
  type ShippingQuoteResult,
} from "./types";

export function pickupOption(settings: StoreSettings): ShippingOption | null {
  if (!settings.shipping.pickupEnabled) return null;
  return {
    code: SHIPPING_CODE_PICKUP,
    label: "Retirada em mãos",
    priceCents: 0,
    estimate: "Combine a retirada após a confirmação do pagamento",
    requiresAddress: false,
    description: settings.shipping.pickupInstructions || undefined,
  };
}

/** A opção "Entrega" de valor fixo (com frete grátis acima de um valor). */
export function flatDeliveryOption(input: ShippingQuoteInput, settings: StoreSettings): ShippingOption {
  const cfg = settings.shipping;
  const free = cfg.freeAboveCents !== null && input.subtotalCents >= cfg.freeAboveCents;
  return {
    code: SHIPPING_CODE_DELIVERY,
    label: "Entrega",
    priceCents: free ? 0 : cfg.flatRateCents,
    estimate: cfg.estimate || null,
    requiresAddress: true,
    description: free ? "Frete grátis para este pedido" : undefined,
  };
}

/**
 * Provedor padrão: taxa fixa configurável no painel (com frete grátis acima de um valor)
 * e retirada em mãos opcional. Não consulta serviço externo.
 */
export class FlatRateShippingProvider implements ShippingProvider {
  readonly id = "flat-rate";

  async quote(input: ShippingQuoteInput, settings: StoreSettings): Promise<ShippingQuoteResult> {
    const options: ShippingOption[] = [];
    if (settings.shipping.deliveryEnabled) options.push(flatDeliveryOption(input, settings));
    const pickup = pickupOption(settings);
    if (pickup) options.push(pickup);
    return { options, notice: null, needsCep: false, source: options.length > 0 && settings.shipping.deliveryEnabled ? "flat" : "none" };
  }
}
