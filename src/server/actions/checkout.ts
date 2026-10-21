"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formString } from "@/lib/forms";
import { parseAddressForm } from "@/lib/forms";
import { checkoutSchema, uuidSchema, zodFieldErrors } from "@/lib/schemas";
import { requireUserAction } from "../auth/current-user";
import { BusinessRuleError, ExternalServiceError, RateLimitError } from "../errors";
import { isPaymentConfigured } from "../payments";
import { checkRateLimit } from "../security/rate-limit";
import { createAddress } from "../services/addresses";
import { getOrCreateUserCart } from "../services/cart";
import { cancelOrderByCustomer, createOrderFromCart, startPaymentForOrder } from "../services/orders";
import { failure, type FormState } from "./shared";

/**
 * Finaliza a compra: valida tudo no servidor, cria o pedido (preços e estoque do banco)
 * e envia o cliente para pagar. O pedido só vira "pago" quando o webhook do provedor confirmar.
 */
export async function placeOrderAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let orderId: string;
  let paymentUrl: string | null = null;

  try {
    const user = await requireUserAction();

    const limit = checkRateLimit(`checkout:${user.id}`, 10, 10 * 60 * 1000);
    if (!limit.ok) throw new RateLimitError(limit.retryAfterSeconds);

    // Sem credenciais de pagamento a loja não aceita pedidos (evita pedidos que ninguém consegue pagar).
    if (!isPaymentConfigured()) {
      throw new ExternalServiceError(
        "O pagamento online ainda não está disponível nesta loja. Fale com a loja pelo WhatsApp para concluir sua compra.",
      );
    }

    const parsed = checkoutSchema.safeParse({
      shippingCode: formString(fd, "shippingCode") ?? "",
      expectedShippingCents: formString(fd, "expectedShippingCents"),
      addressId: formString(fd, "addressId") === "new" ? null : formString(fd, "addressId"),
      note: formString(fd, "note"),
    });
    if (!parsed.success) return { errors: zodFieldErrors(parsed.error), message: "Confira os campos destacados." };

    let addressId = parsed.data.addressId;
    if (formString(fd, "addressId") === "new") {
      const address = parseAddressForm(fd, "addr_");
      if (!address.ok) return { errors: address.errors, message: "Confira o endereço de entrega." };
      addressId = (await createAddress(user.id, address.data)).id;
    }

    const cartId = await getOrCreateUserCart(user.id);
    const order = await createOrderFromCart({
      userId: user.id,
      cartId,
      addressId,
      shippingCode: parsed.data.shippingCode,
      expectedShippingCents: parsed.data.expectedShippingCents,
      note: parsed.data.note,
    });
    orderId = order.id;
    revalidatePath("/", "layout");

    try {
      paymentUrl = (await startPaymentForOrder(order.id, user.id)).url;
    } catch (error) {
      // O pedido já existe (estoque reservado): a pessoa tenta pagar de novo pela página do pedido.
      console.error("[checkout] pedido criado, mas o link de pagamento falhou:", error);
    }
  } catch (error) {
    return failure(error);
  }

  redirect(paymentUrl ?? `/pedido/${orderId}?pagamento=falhou`);
}

/** "Pagar agora" na página do pedido. */
export async function payOrderAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let url: string;
  try {
    const user = await requireUserAction();
    const orderId = uuidSchema.safeParse(formString(fd, "orderId"));
    if (!orderId.success) throw new BusinessRuleError("Pedido inválido.");
    const limit = checkRateLimit(`pay:${user.id}`, 20, 10 * 60 * 1000);
    if (!limit.ok) throw new RateLimitError(limit.retryAfterSeconds);
    url = (await startPaymentForOrder(orderId.data, user.id)).url;
  } catch (error) {
    return failure(error);
  }
  redirect(url);
}

export async function cancelOrderAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let orderId: string;
  try {
    const user = await requireUserAction();
    const parsed = uuidSchema.safeParse(formString(fd, "orderId"));
    if (!parsed.success) throw new BusinessRuleError("Pedido inválido.");
    orderId = parsed.data;
    await cancelOrderByCustomer(orderId, user);
    revalidatePath("/", "layout");
  } catch (error) {
    return failure(error);
  }
  redirect(`/pedido/${orderId}`);
}
