import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { orders, users, type User } from "../db/schema";
import { burnPasswordCheck, hashPassword, verifyPassword } from "../auth/password";
import { deleteSessionsForUser } from "../auth/session";
import { BusinessRuleError, isUniqueViolation, ValidationError } from "../errors";
import { PAID_ORDER_STATUSES } from "@/lib/constants";

export async function findUserByEmail(email: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);
  return user ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export async function registerUser(input: {
  name: string;
  email: string;
  phone: string | null;
  password: string;
}): Promise<User> {
  const passwordHash = await hashPassword(input.password);
  try {
    const [user] = await db
      .insert(users)
      .values({
        name: input.name,
        email: input.email.toLowerCase(),
        phone: input.phone,
        passwordHash,
        role: "CLIENTE",
      })
      .returning();
    return user;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ValidationError({ email: "Este e-mail já está cadastrado. Tente entrar na sua conta." });
    }
    throw error;
  }
}

/** Devolve o usuário se e-mail+senha estiverem corretos; senão null (sem revelar o motivo). */
export async function authenticate(email: string, password: string): Promise<User | null> {
  const user = await findUserByEmail(email);
  if (!user || !user.active) {
    await burnPasswordCheck(password);
    return null;
  }
  return (await verifyPassword(password, user.passwordHash)) ? user : null;
}

/**
 * Cria um administrador (ou promove uma conta existente). Usado pelo script
 * `npm run admin:create`; não existe nenhuma tela pública que dê papel de ADMIN.
 */
export async function createAdminUser(input: {
  email: string;
  name: string;
  password: string;
}): Promise<{ user: User; created: boolean }> {
  if (input.password.length < 10) {
    throw new BusinessRuleError("A senha do administrador precisa ter pelo menos 10 caracteres.");
  }
  const passwordHash = await hashPassword(input.password);
  const existing = await findUserByEmail(input.email);

  if (existing) {
    const [user] = await db
      .update(users)
      .set({ role: "ADMIN", active: true, passwordHash, name: input.name })
      .where(eq(users.id, existing.id))
      .returning();
    await deleteSessionsForUser(user.id);
    return { user, created: false };
  }

  const [user] = await db
    .insert(users)
    .values({ email: input.email.toLowerCase(), name: input.name, passwordHash, role: "ADMIN" })
    .returning();
  return { user, created: true };
}

export async function updateProfile(userId: string, input: { name: string; phone: string | null }): Promise<User> {
  const [user] = await db
    .update(users)
    .set({ name: input.name, phone: input.phone })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

/** Troca a senha e encerra as outras sessões (a atual, `keepToken`, continua válida). */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  keepToken?: string | null,
): Promise<void> {
  const user = await getUserById(userId);
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new ValidationError({ currentPassword: "Senha atual incorreta." });
  }
  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  await deleteSessionsForUser(userId, keepToken);
}

/* ------------------------- Painel: clientes ------------------------- */

export type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  createdAt: Date;
  ordersCount: number;
  totalSpentCents: number;
};

export async function listCustomers(options: { q?: string; page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = options.pageSize ?? 20;
  const q = options.q?.trim();

  const where = and(
    eq(users.role, "CLIENTE"),
    q ? sql`(${users.name} ILIKE ${"%" + q.replace(/[\\%_]/g, "\\$&") + "%"} OR ${users.email} ILIKE ${"%" + q.replace(/[\\%_]/g, "\\$&") + "%"})` : undefined,
  );

  const paidStatuses = sql.join(
    PAID_ORDER_STATUSES.map((s) => sql`${s}`),
    sql`, `,
  );

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      active: users.active,
      createdAt: users.createdAt,
      ordersCount: sql<number>`count(${orders.id})::int`,
      totalSpentCents: sql<number>`coalesce(sum(case when ${orders.status} in (${paidStatuses}) then ${orders.totalCents} else 0 end), 0)::int`,
    })
    .from(users)
    .leftJoin(orders, eq(orders.userId, users.id))
    .where(where)
    .groupBy(users.id)
    .orderBy(desc(users.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(users)
    .where(where);

  return { rows: rows as CustomerRow[], total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Ativa/desativa a conta de um cliente (cliente desativado não consegue entrar). */
export async function setUserActive(userId: string, active: boolean): Promise<void> {
  await db.update(users).set({ active }).where(and(eq(users.id, userId), ne(users.role, "ADMIN")));
  if (!active) await deleteSessionsForUser(userId);
}
