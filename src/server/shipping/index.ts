import { BusinessRuleError } from "../errors";
import { getSettings, type StoreSettings } from "../services/settings";
import { FlatRateShippingProvider } from "./flat-rate";
import { SuperFreteShippingProvider } from "./superfrete";
import type { ShippingOption, ShippingProvider, ShippingQuoteInput, ShippingQuoteResult } from "./types";

export type {
  ShippingOption,
  ShippingProvider,
  ShippingQuoteInput,
  ShippingQuoteItem,
  ShippingQuoteResult,
} from "./types";
export { SHIPPING_CODE_DELIVERY, SHIPPING_CODE_PICKUP } from "./types";
export { FlatRateShippingProvider } from "./flat-rate";

/**
 * Único ponto que escolhe COMO o frete é calculado (configuração do painel):
 *  - "fixed": valor fixo por pedido (padrão);
 *  - "calculated": preço e prazo pelo CEP do cliente e peso dos produtos, via SuperFrete (SEDEX, PAC...).
 * Para ligar outro serviço no futuro, crie uma classe que implemente `ShippingProvider` e devolva-a aqui.
 */
export function getShippingProvider(settings: StoreSettings): ShippingProvider {
  return settings.shipping.mode === "calculated" ? new SuperFreteShippingProvider() : new FlatRateShippingProvider();
}

export async function getShippingQuote(input: ShippingQuoteInput): Promise<ShippingQuoteResult> {
  const settings = await getSettings();
  return getShippingProvider(settings).quote(input, settings);
}

export async function getShippingOptions(input: ShippingQuoteInput): Promise<ShippingOption[]> {
  return (await getShippingQuote(input)).options;
}

/**
 * Valida no servidor a opção escolhida pelo cliente e devolve o preço REAL.
 * O valor do frete nunca vem do navegador: só o código da opção.
 */
export async function resolveShippingOption(code: string, input: ShippingQuoteInput): Promise<ShippingOption> {
  const options = await getShippingOptions(input);
  const option = options.find((o) => o.code === code);
  if (!option) {
    throw new BusinessRuleError(
      options.length === 0
        ? "A loja não está com nenhuma forma de entrega disponível para este pedido no momento. Entre em contato conosco."
        : "Forma de entrega indisponível. Escolha outra opção.",
    );
  }
  return option;
}
