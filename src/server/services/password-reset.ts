import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db";
import { passwordResetTokens, users } from "../db/schema";
import { hashPassword } from "../auth/password";
import { deleteSessionsForUser, hashToken } from "../auth/session";
import { BusinessRuleError, NotFoundError } from "../errors";

/** O link vale por 60 minutos e só pode ser usado uma vez. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * O ADMINISTRADOR gera um link de nova senha para um CLIENTE (que pede pelo WhatsApp, por exemplo).
 * O banco guarda só o hash do token: quem ler a tabela não consegue montar o link.
 * Contas de administrador não passam por aqui (a senha do admin é trocada por `npm run admin:create`).
 */
export async function createPasswordResetLink(userId: string, adminId: string): Promise<{ token: string; expiresAt: Date }> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new NotFoundError("Cliente não encontrado.");
  if (user.role !== "CLIENTE") throw new BusinessRuleError("O link de nova senha só pode ser gerado para contas de cliente.");
  if (!user.active) throw new BusinessRuleError("Esta conta está desativada. Reative a conta antes de gerar o link.");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await db.transaction(async (tx) => {
    // Só um link válido por cliente: o anterior (se ainda não usado) deixa de funcionar.
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
    await tx.insert(passwordResetTokens).values({ userId, tokenHash: hashToken(token), expiresAt, createdBy: adminId });
  });
  return { token, expiresAt };
}

/** true se o link existe, não foi usado e não expirou (não revela nada sobre a conta). */
export async function isResetTokenValid(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return false;
  const [row] = await db
    .select({ id: passwordResetTokens.id })
    .from(passwordResetTokens)
    .innerJoin(users, eq(users.id, passwordResetTokens.userId))
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
        eq(users.active, true),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Troca a senha usando o link. Marca o link como usado na MESMA transação (duas pessoas usando o mesmo link ao mesmo
 * tempo: só uma consegue) e encerra todas as sessões abertas da conta.
 */
export async function consumePasswordReset(token: string, newPassword: string): Promise<void> {
  const invalid = new BusinessRuleError("Este link não é mais válido. Peça um novo link para a loja.");
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw invalid;
  const passwordHash = await hashPassword(newPassword);

  const userId = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.tokenHash, hashToken(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
      .returning({ userId: passwordResetTokens.userId });
    if (!claimed) throw invalid;
    const [user] = await tx
      .update(users)
      .set({ passwordHash })
      .where(and(eq(users.id, claimed.userId), eq(users.active, true), eq(users.role, "CLIENTE")))
      .returning({ id: users.id });
    if (!user) throw invalid;
    return user.id;
  });
  await deleteSessionsForUser(userId);
}
