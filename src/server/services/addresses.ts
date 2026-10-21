import { and, asc, desc, eq } from "drizzle-orm";
import type { AddressInput } from "@/lib/schemas";
import { db } from "../db";
import { addresses, type Address } from "../db/schema";
import { BusinessRuleError, NotFoundError } from "../errors";

const MAX_ADDRESSES_PER_USER = 10;

export async function listAddresses(userId: string): Promise<Address[]> {
  return db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, userId))
    .orderBy(desc(addresses.isDefault), asc(addresses.createdAt));
}

export async function getAddress(userId: string, addressId: string): Promise<Address | null> {
  const [row] = await db
    .select()
    .from(addresses)
    .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)));
  return row ?? null;
}

/** O primeiro endereço de um cliente vira o padrão automaticamente. */
export async function createAddress(userId: string, input: AddressInput): Promise<Address> {
  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: addresses.id }).from(addresses).where(eq(addresses.userId, userId));
    if (existing.length >= MAX_ADDRESSES_PER_USER) {
      throw new BusinessRuleError(`Você pode ter no máximo ${MAX_ADDRESSES_PER_USER} endereços. Remova algum para cadastrar outro.`);
    }

    const makeDefault = input.isDefault || existing.length === 0;
    if (makeDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));

    const [created] = await tx
      .insert(addresses)
      .values({
        userId,
        label: input.label,
        recipientName: input.recipientName,
        phone: input.phone,
        cep: input.cep,
        street: input.street,
        number: input.number,
        complement: input.complement,
        neighborhood: input.neighborhood,
        city: input.city,
        state: input.state,
        isDefault: makeDefault,
      })
      .returning();
    return created;
  });
}

export async function deleteAddress(userId: string, addressId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(addresses)
      .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)))
      .returning();
    if (removed.length === 0) throw new NotFoundError("Endereço não encontrado.");

    // Se o padrão foi removido, o endereço mais antigo assume.
    if (removed[0].isDefault) {
      const [next] = await tx
        .select({ id: addresses.id })
        .from(addresses)
        .where(eq(addresses.userId, userId))
        .orderBy(asc(addresses.createdAt))
        .limit(1);
      if (next) await tx.update(addresses).set({ isDefault: true }).where(eq(addresses.id, next.id));
    }
  });
}

export async function setDefaultAddress(userId: string, addressId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: addresses.id })
      .from(addresses)
      .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)));
    if (!target) throw new NotFoundError("Endereço não encontrado.");
    await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
    await tx.update(addresses).set({ isDefault: true }).where(eq(addresses.id, addressId));
  });
}
