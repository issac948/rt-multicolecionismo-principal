"use server";

import { revalidatePath } from "next/cache";
import { MAX_COUPON_USES } from "@/lib/coupons";
import { parseBrLocal } from "@/lib/datetime-br";
import { formInt, formString } from "@/lib/forms";
import { parseMoneyToCents } from "@/lib/money";
import { uuidSchema } from "@/lib/schemas";
import { requireAdminAction, requireUserAction } from "../auth/current-user";
import { getRequestCart } from "../cart-session";
import { BusinessRuleError, RateLimitError } from "../errors";
import { checkRateLimit } from "../security/rate-limit";
import { createCoupon, deleteCoupon, evaluateCoupon, setCouponActive } from "../services/coupons";
import { db } from "../db";
import { failure, type FormState } from "./shared";

/* ------------------------------ Painel ------------------------------ */

export async function saveCouponAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireAdminAction();
    const errors: Record<string, string> = {};

    const kind = formString(fd, "kind") === "FIXED" ? "FIXED" : "PERCENT";
    let value = 0;
    if (kind === "PERCENT") {
      const n = formInt(fd, "value");
      if (n === undefined || Number.isNaN(n) || n < 1 || n > 90) errors.value = "Informe um percentual inteiro de 1 a 90.";
      else value = n;
    } else {
      const cents = parseMoneyToCents(formString(fd, "value"));
      if (cents === null || cents <= 0) errors.value = "Informe o valor do desconto em reais (ex.: 20,00).";
      else value = cents;
    }

    const minRaw = (formString(fd, "minSubtotal") ?? "").trim();
    const minSubtotalCents = minRaw === "" ? 0 : parseMoneyToCents(minRaw);
    if (minSubtotalCents === null || minSubtotalCents < 0) errors.minSubtotal = "Valor mínimo inválido (ex.: 150,00).";

    const startsAt = parseBrLocal(formString(fd, "startsAt"));
    const endsAt = parseBrLocal(formString(fd, "endsAt"));
    if (startsAt === undefined) errors.startsAt = "Data inválida.";
    if (endsAt === undefined) errors.endsAt = "Data inválida.";
    if (startsAt && endsAt && endsAt <= startsAt) errors.endsAt = "O fim precisa ser depois do início.";

    const maxRedemptions = formInt(fd, "maxRedemptions");
    const maxPerUser = formInt(fd, "maxPerUser");
    if (maxRedemptions !== undefined && (Number.isNaN(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > MAX_COUPON_USES)) errors.maxRedemptions = "Use um número inteiro maior que zero (até 1.000.000) ou deixe em branco.";
    if (maxPerUser !== undefined && (Number.isNaN(maxPerUser) || maxPerUser < 1 || maxPerUser > MAX_COUPON_USES)) errors.maxPerUser = "Use um número inteiro maior que zero (até 1.000.000) ou deixe em branco.";

    const description = (formString(fd, "description") ?? "").trim();
    if (description.length > 200) errors.description = "Descrição muito longa (máx. 200).";

    if (Object.keys(errors).length > 0) return { errors, message: "Confira os campos destacados." };

    await createCoupon({
      code: formString(fd, "code") ?? "",
      description: description || null,
      kind,
      value,
      minSubtotalCents: minSubtotalCents ?? 0,
      startsAt: startsAt ?? null,
      endsAt: endsAt ?? null,
      maxRedemptions: maxRedemptions ?? null,
      maxPerUser: maxPerUser ?? null,
    });
    revalidatePath("/admin/cupons");
    return { ok: true, message: "Cupom criado." };
  } catch (error) {
    return failure(error);
  }
}

export async function toggleCouponAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireAdminAction();
    const id = uuidSchema.safeParse(formString(fd, "couponId"));
    if (!id.success) throw new BusinessRuleError("Cupom inválido.");
    const active = formString(fd, "active") === "true";
    await setCouponActive(id.data, active);
    revalidatePath("/admin/cupons");
    return { ok: true, message: active ? "Cupom ativado." : "Cupom desativado." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteCouponAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireAdminAction();
    const id = uuidSchema.safeParse(formString(fd, "couponId"));
    if (!id.success) throw new BusinessRuleError("Cupom inválido.");
    await deleteCoupon(id.data);
    revalidatePath("/admin/cupons");
    return { ok: true, message: "Cupom excluído." };
  } catch (error) {
    return failure(error);
  }
}

/* ------------------------------ Cliente ------------------------------ */

export type CouponPreviewState = FormState & { discountCents?: number; code?: string };

/**
 * "Aplicar cupom" no checkout: mostra o desconto para o cliente conferir. NÃO reserva nada:
 * quem vale é a conferência feita de novo (com trava) quando o pedido é criado.
 */
export async function previewCouponAction(_prev: CouponPreviewState, fd: FormData): Promise<CouponPreviewState> {
  try {
    const user = await requireUserAction();
    // Limite contra quem tenta adivinhar códigos.
    const limit = checkRateLimit(`coupon:${user.id}`, 15, 10 * 60 * 1000);
    if (!limit.ok) throw new RateLimitError(limit.retryAfterSeconds);

    const code = (formString(fd, "couponCode") ?? "").trim();
    if (!code) return { errors: { couponCode: "Digite o código do cupom." }, message: "Digite o código do cupom." };

    const cart = await getRequestCart();
    if (cart.lines.length === 0) throw new BusinessRuleError("Seu carrinho está vazio.");
    const applied = await evaluateCoupon(db, { code, userId: user.id, subtotalCents: cart.subtotalCents });
    return { ok: true, discountCents: applied.discountCents, code: applied.coupon.code, message: `Cupom ${applied.coupon.code} aplicado.` };
  } catch (error) {
    return failure(error);
  }
}

