import { cookies } from "next/headers";
import { getCurrentUser } from "./auth/current-user";
import { getEnv } from "./env";
import { UUID_RE } from "@/lib/schemas";
import {
  createGuestCart,
  getCartView,
  getOrCreateUserCart,
  getUserCartId,
  isGuestCart,
  mergeGuestCartIntoUser,
  type CartView,
} from "./services/cart";

export const CART_COOKIE_NAME = "loja_cart";
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

async function readGuestCartCookie(): Promise<string | null> {
  const value = (await cookies()).get(CART_COOKIE_NAME)?.value;
  return value && UUID_RE.test(value) ? value : null;
}

async function writeGuestCartCookie(cartId: string): Promise<void> {
  (await cookies()).set(CART_COOKIE_NAME, cartId, {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().secureCookies,
    path: "/",
    maxAge: CART_COOKIE_MAX_AGE,
  });
}

export async function clearGuestCartCookie(): Promise<void> {
  (await cookies()).delete(CART_COOKIE_NAME);
}

/**
 * Descobre o carrinho da requisição.
 *  - Logado: carrinho da conta (o cookie de visitante é ignorado).
 *  - Visitante: carrinho do cookie, se for um carrinho de visitante válido.
 * Com `create: true` (só em Server Actions/rotas), cria o carrinho se ainda não existir.
 */
export async function resolveCartId(options: { create: boolean }): Promise<string | null> {
  const user = await getCurrentUser();
  if (user) {
    return options.create ? getOrCreateUserCart(user.id) : getUserCartId(user.id);
  }

  const cookieId = await readGuestCartCookie();
  if (cookieId && (await isGuestCart(cookieId))) return cookieId;
  if (!options.create) return null;

  const created = await createGuestCart();
  await writeGuestCartCookie(created);
  return created;
}

export async function getRequestCart(): Promise<CartView> {
  return getCartView(await resolveCartId({ create: false }));
}

/** Chamado logo após login/cadastro: leva o carrinho de visitante para a conta. */
export async function mergeGuestCartAfterLogin(userId: string): Promise<void> {
  const guestId = await readGuestCartCookie();
  if (guestId) {
    await mergeGuestCartIntoUser(guestId, userId);
    await clearGuestCartCookie();
  }
}
