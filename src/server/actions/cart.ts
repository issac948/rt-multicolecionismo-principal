"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formInt, formString } from "@/lib/forms";
import { uuidSchema } from "@/lib/schemas";
import { resolveCartId } from "../cart-session";
import { BusinessRuleError } from "../errors";
import { addToCart, normalizeCart, removeCartItem, setCartItemQuantity } from "../services/cart";
import { failure, type FormState } from "./shared";

export async function addToCartAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const productId = uuidSchema.safeParse(formString(fd, "productId"));
    if (!productId.success) throw new BusinessRuleError("Produto inválido.");
    const quantity = formInt(fd, "quantity") ?? 1;

    // O carrinho é criado aqui (e o cookie gravado) só quando a pessoa realmente adiciona algo.
    const cartId = await resolveCartId({ create: true });
    if (!cartId) throw new BusinessRuleError("Não foi possível criar o carrinho.");
    await addToCart(cartId, productId.data, quantity);
    revalidatePath("/", "layout");
  } catch (error) {
    return failure(error);
  }
  if (formString(fd, "intent") === "buy") redirect("/carrinho");
  return { ok: true, message: "Adicionado ao carrinho." };
}

export async function updateCartItemAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const itemId = uuidSchema.safeParse(formString(fd, "itemId"));
    const quantity = formInt(fd, "quantity");
    if (!itemId.success || quantity === undefined) throw new BusinessRuleError("Item inválido.");

    const cartId = await resolveCartId({ create: false });
    if (!cartId) throw new BusinessRuleError("Carrinho não encontrado.");
    await setCartItemQuantity(cartId, itemId.data, quantity);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function removeCartItemAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const itemId = uuidSchema.safeParse(formString(fd, "itemId"));
    if (!itemId.success) throw new BusinessRuleError("Item inválido.");
    const cartId = await resolveCartId({ create: false });
    if (!cartId) throw new BusinessRuleError("Carrinho não encontrado.");
    await removeCartItem(cartId, itemId.data);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function normalizeCartAction(_prev: FormState, _fd: FormData): Promise<FormState> {
  try {
    const cartId = await resolveCartId({ create: false });
    if (!cartId) return { ok: true };
    const messages = await normalizeCart(cartId);
    revalidatePath("/", "layout");
    return { ok: true, message: messages.join(" ") || "Seu carrinho já está em ordem." };
  } catch (error) {
    return failure(error);
  }
}
