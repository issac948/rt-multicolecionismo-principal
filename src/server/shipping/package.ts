import type { StoreSettings } from "../services/settings";
import type { ShippingQuoteItem } from "./types";

/**
 * Monta UMA caixa para o pedido inteiro a partir dos produtos do carrinho.
 *
 * Regra simples e previsível para miniaturas (itens achatados, em cartela/caixinha):
 *  - cada item é "deitado" com a menor medida como altura;
 *  - a caixa tem o maior comprimento e a maior largura entre os itens, e a altura é a SOMA das alturas (itens empilhados);
 *  - o peso é a soma dos pesos;
 *  - produto sem peso/medidas cadastrados usa o padrão definido no painel.
 * Respeita o mínimo dos Correios (16 x 11 x 2 cm) e os limites máximos; acima deles não há como enviar em um único volume.
 */
export type ShippingPackage = {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

export type PackageResult = { ok: true; package: ShippingPackage } | { ok: false; reason: string };

export const CORREIOS_MIN = { lengthCm: 16, widthCm: 11, heightCm: 2 } as const;
export const CORREIOS_MAX = { weightGrams: 30_000, sideCm: 105, sumCm: 200 } as const;

function positiveInt(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.ceil(value) : null;
}

export function buildPackage(items: ShippingQuoteItem[], settings: StoreSettings): PackageResult {
  const fallback = settings.shipping.defaultItem;
  let weight = 0;
  let length = 0;
  let width = 0;
  let height = 0;

  for (const item of items) {
    const quantity = Math.max(1, Math.floor(item.quantity));
    const itemWeight = positiveInt(item.weightGrams) ?? fallback.weightGrams;
    const dims = [
      positiveInt(item.lengthCm) ?? fallback.lengthCm,
      positiveInt(item.widthCm) ?? fallback.widthCm,
      positiveInt(item.heightCm) ?? fallback.heightCm,
    ].sort((a, b) => b - a);
    weight += itemWeight * quantity;
    length = Math.max(length, dims[0]);
    width = Math.max(width, dims[1]);
    height += dims[2] * quantity;
  }

  if (items.length === 0 || weight <= 0) return { ok: false, reason: "Carrinho vazio." };

  const pkg: ShippingPackage = {
    weightGrams: weight,
    lengthCm: Math.max(length, CORREIOS_MIN.lengthCm),
    widthCm: Math.max(width, CORREIOS_MIN.widthCm),
    heightCm: Math.max(height, CORREIOS_MIN.heightCm),
  };

  const tooBig =
    pkg.weightGrams > CORREIOS_MAX.weightGrams ||
    pkg.lengthCm > CORREIOS_MAX.sideCm ||
    pkg.widthCm > CORREIOS_MAX.sideCm ||
    pkg.heightCm > CORREIOS_MAX.sideCm ||
    pkg.lengthCm + pkg.widthCm + pkg.heightCm > CORREIOS_MAX.sumCm;
  if (tooBig) return { ok: false, reason: "O pedido ficou grande demais para um único envio." };

  return { ok: true, package: pkg };
}
