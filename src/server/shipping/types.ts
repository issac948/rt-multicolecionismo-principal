import type { StoreSettings } from "../services/settings";

/**
 * Abstração de frete. O checkout, o pedido e o painel só conhecem estes tipos:
 * trocar a forma de calcular o frete (valor fixo, SuperFrete, outro serviço no futuro)
 * é escolher outra classe em `getShippingProvider()`.
 */
export type ShippingQuoteItem = {
  productId: string;
  quantity: number;
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
};

export type ShippingQuoteInput = {
  subtotalCents: number;
  /** CEP de destino (8 dígitos) ou null quando ainda não informado / retirada. */
  destinationCep: string | null;
  items: ShippingQuoteItem[];
};

export type ShippingOption = {
  code: string;
  label: string;
  priceCents: number;
  estimate: string | null;
  /** true = precisa de endereço de entrega; false = retirada na loja. */
  requiresAddress: boolean;
  description?: string;
};

export type ShippingQuoteResult = {
  options: ShippingOption[];
  /** Aviso para mostrar ao cliente (ex.: o cálculo automático falhou e foi usado o valor fixo). */
  notice: string | null;
  /** A entrega depende do CEP e ele ainda não foi informado. */
  needsCep: boolean;
  /** De onde veio o preço da entrega ("none" = sem entrega disponível). */
  source: "flat" | "superfrete" | "fallback" | "none";
};

export interface ShippingProvider {
  readonly id: string;
  quote(input: ShippingQuoteInput, settings: StoreSettings): Promise<ShippingQuoteResult>;
}

export const SHIPPING_CODE_DELIVERY = "ENTREGA";
export const SHIPPING_CODE_PICKUP = "RETIRADA";
