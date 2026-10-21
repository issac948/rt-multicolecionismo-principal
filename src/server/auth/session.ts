import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import type { UserRole } from "@/lib/constants";
import { db } from "../db";
import { sessions, users } from "../db/schema";

export const SESSION_COOKIE_NAME = "loja_session";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Administradores ficam logados por menos tempo. */
const SESSION_TTL_MS: Record<UserRole, number> = { CLIENTE: 30 * DAY_MS, ADMIN: 7 * DAY_MS };

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
};

/** O banco guarda só o hash do token: quem ler o banco não consegue se passar por ninguém. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  role: UserRole,
  userAgent?: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS[role]);
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    userAgent: userAgent ? userAgent.slice(0, 300) : null,
  });
  return { token, expiresAt };
}

/** Devolve o usuário dono do token, ou null se o token for inválido/expirado/conta desativada. */
export async function getUserByToken(token: string | null | undefined): Promise<SessionUser | null> {
  if (!token || token.length < 20 || token.length > 100) return null;

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()), eq(users.active, true)))
    .limit(1);

  return row ?? null;
}

export async function deleteSession(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/** Encerra todas as sessões do usuário (opcionalmente preservando a atual). */
export async function deleteSessionsForUser(userId: string, exceptToken?: string | null): Promise<void> {
  if (exceptToken) {
    await db
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), ne(sessions.tokenHash, hashToken(exceptToken))));
  } else {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }
}

export async function purgeExpiredSessions(): Promise<number> {
  const removed = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ id: sessions.id });
  return removed.length;
}
