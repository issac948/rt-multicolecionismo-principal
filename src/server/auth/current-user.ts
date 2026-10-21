import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEnv } from "../env";
import { assertRole, safeNextPath } from "./authorize";
import { getUserByToken, SESSION_COOKIE_NAME, type SessionUser } from "./session";

/* Cookies ------------------------------------------------------------ */

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().secureCookies,
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

/* Usuário da requisição ---------------------------------------------- */

/** Usuário logado (ou null). Uma consulta por requisição, mesmo se chamado várias vezes. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  return getUserByToken(await readSessionToken());
});

/* Guardas para PÁGINAS (redirecionam) -------------------------------- */

export async function requireUser(nextPath = "/"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(safeNextPath(nextPath))}`);
  return user;
}

/**
 * Páginas do /admin. Visitante vai para o login; cliente logado recebe 404
 * (nem revelamos que a área administrativa existe).
 */
export async function requireAdminPage(nextPath = "/admin"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(safeNextPath(nextPath, "/admin"))}`);
  if (user.role !== "ADMIN") notFound();
  return user;
}

/* Guardas para ACTIONS e APIs (lançam AuthError) ---------------------- */

export async function requireUserAction(): Promise<SessionUser> {
  return assertRole(await getCurrentUser(), "CLIENTE");
}

/** TODA server action/API administrativa deve começar por esta chamada. */
export async function requireAdminAction(): Promise<SessionUser> {
  return assertRole(await getCurrentUser(), "ADMIN");
}
