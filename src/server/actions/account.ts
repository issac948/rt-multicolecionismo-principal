"use server";

import { revalidatePath } from "next/cache";
import { formString, parseAddressForm } from "@/lib/forms";
import { changePasswordSchema, profileSchema, uuidSchema, zodFieldErrors } from "@/lib/schemas";
import { readSessionToken, requireUserAction } from "../auth/current-user";
import { BusinessRuleError } from "../errors";
import { createAddress, deleteAddress, setDefaultAddress } from "../services/addresses";
import { changePassword, updateProfile } from "../services/users";
import { failure, type FormState } from "./shared";

export async function updateProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await requireUserAction();
    const parsed = profileSchema.safeParse({ name: formString(fd, "name") ?? "", phone: formString(fd, "phone") });
    if (!parsed.success) return { errors: zodFieldErrors(parsed.error), message: "Confira os campos destacados." };
    await updateProfile(user.id, parsed.data);
    revalidatePath("/", "layout");
    return { ok: true, message: "Dados atualizados." };
  } catch (error) {
    return failure(error);
  }
}

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await requireUserAction();
    const parsed = changePasswordSchema.safeParse({
      currentPassword: formString(fd, "currentPassword") ?? "",
      newPassword: formString(fd, "newPassword") ?? "",
      confirmPassword: formString(fd, "confirmPassword") ?? "",
    });
    if (!parsed.success) return { errors: zodFieldErrors(parsed.error), message: "Confira os campos destacados." };
    await changePassword(user.id, parsed.data.currentPassword, parsed.data.newPassword, await readSessionToken());
    return { ok: true, message: "Senha alterada. Os outros aparelhos conectados foram desconectados." };
  } catch (error) {
    return failure(error);
  }
}

export async function addAddressAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await requireUserAction();
    const parsed = parseAddressForm(fd);
    if (!parsed.ok) return { errors: parsed.errors, message: "Confira os campos destacados." };
    await createAddress(user.id, parsed.data);
    revalidatePath("/minha-conta");
    return { ok: true, message: "Endereço salvo." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteAddressAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await requireUserAction();
    const id = uuidSchema.safeParse(formString(fd, "addressId"));
    if (!id.success) throw new BusinessRuleError("Endereço inválido.");
    await deleteAddress(user.id, id.data);
    revalidatePath("/minha-conta");
    return { ok: true, message: "Endereço removido." };
  } catch (error) {
    return failure(error);
  }
}

export async function setDefaultAddressAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await requireUserAction();
    const id = uuidSchema.safeParse(formString(fd, "addressId"));
    if (!id.success) throw new BusinessRuleError("Endereço inválido.");
    await setDefaultAddress(user.id, id.data);
    revalidatePath("/minha-conta");
    return { ok: true, message: "Endereço padrão atualizado." };
  } catch (error) {
    return failure(error);
  }
}
