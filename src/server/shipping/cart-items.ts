import type { CartView } from "../services/cart";
import type { ShippingQuoteItem } from "./types";

/** Itens do carrinho no formato que o cálculo de frete usa (peso e medidas vêm do cadastro do produto). */
export function cartToQuoteItems(cart: Pick<CartView, "lines">): ShippingQuoteItem[] {
  return cart.lines.map((l) => ({
    productId: l.productId,
    quantity: l.quantity,
    weightGrams: l.weightGrams,
    lengthCm: l.lengthCm,
    widthCm: l.widthCm,
    heightCm: l.heightCm,
  }));
}
