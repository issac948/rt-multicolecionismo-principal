"use server";

import { toCategoryOptions } from "@/lib/categories";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ORDER_STATUSES } from "@/lib/constants";
import { parseBrLocal } from "@/lib/datetime-br";
import { formBool, formInt, formString, parseProductForm } from "@/lib/forms";
import { onlyDigits } from "@/lib/text";
import { parseMoneyToCents } from "@/lib/money";
import { categoryInputSchema, stockAdjustSchema, uuidSchema, zodFieldErrors } from "@/lib/schemas";
import { requireAdminAction } from "../auth/current-user";
import { getEnv } from "../env";
import { getPaymentProvider } from "../payments";
import { suggestProduct, type ProductSuggestion } from "../ai/product-assistant";
import { BusinessRuleError, RateLimitError } from "../errors";
import { checkRateLimit } from "../security/rate-limit";
import { createCategory, deleteCategory, ensureSuggestedCategories, listCategories, updateCategory } from "../services/categories";
import { removeDemoProducts } from "../services/demo";
import { describeMaintenance, runMaintenance } from "../services/maintenance";
import { createPasswordResetLink } from "../services/password-reset";
import { adjustStock } from "../services/inventory";
import { refundOrder } from "../services/payments";
import { updateOrderStatus } from "../services/orders";
import { createProduct, deleteProduct, setProductActive, updateProduct } from "../services/products";
import { getSettings, saveSettings, storeSettingsSchema } from "../services/settings";
import { testSuperFreteQuote } from "../shipping/superfrete";
import { isValidStorageKey } from "../storage";
import { setUserActive } from "../services/users";
import { failure, type FormState } from "./shared";

/* ------------------------------ Produtos ------------------------------ */

export async function saveProductAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let destination: string;
  try {
    const admin = await requireAdminAction();
    const parsed = parseProductForm(fd);
    if (!parsed.ok) return { errors: parsed.errors, message: "Confira os campos destacados." };

    // Os botões "Publicar" e "Salvar rascunho" decidem se o produto aparece na loja.
    const intent = formString(fd, "intent");
    const data = intent === "publish" ? { ...parsed.data, active: true } : intent === "draft" || intent === "draft-another" ? { ...parsed.data, active: false } : parsed.data;

    const productId = formString(fd, "productId");
    if (productId) {
      const id = uuidSchema.safeParse(productId);
      if (!id.success) throw new BusinessRuleError("Produto inválido.");
      const updated = await updateProduct(id.data, data);
      revalidatePath("/admin/produtos");
      return {
        ok: true,
        message: updated.active ? "Produto salvo. Ele está visível na loja." : "Produto salvo como rascunho. Ele não aparece na loja.",
      };
    }

    const created = await createProduct(data, admin.id);
    // "Salvar e cadastrar outro": volta ao formulário em branco, já com categoria, marca, escala e condição do produto salvo.
    destination = intent === "draft-another" ? `/admin/produtos/novo?base=${created.id}` : `/admin/produtos/${created.id}?criado=${created.active ? "publicado" : "rascunho"}`;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

export async function deleteProductAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireAdminAction();
    const id = uuidSchema.safeParse(formString(fd, "productId"));
    if (!id.success) throw new BusinessRuleError("Produto inválido.");
    await deleteProduct(id.data);
  } catch (error) {
    return failure(error);
  }
  redirect("/admin/produtos?excluido=1");
}

export async function toggleProductActiveAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireAdminAction();
    const id = uuidSchema.safeParse(formString(fd, "productId"));
    if (!id.success) throw new BusinessRuleError("Produto inválido.");
    const active = formString(fd, "active") === "true";
    await setProductActive(id.data, active);
    revalidatePath("/admin/produtos");
    return { ok: true, message: active ? "Produto publicado." : "Produto desativado." };
  } catch (error) {
    return failure(error);
  }
}

/* ------------------------------ Categorias ------------------------------ */

export async function saveCategoryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireAdminAction();
    const parsed = categoryInputSchema.safeParse({
      name: formString(fd, "name") ?? "",
      description: formString(fd, "description"),
      position: formInt(fd, "position") ?? 0,
      active: formBool(fd, "active"),
      kind: formString(fd, "kind") || "OUTROS",
      parentId: formString(fd, "parentId") || null,
    });
    if (!parsed.success) return { errors: zodFieldErrors(parsed.error), message: "Confira os campos destacados." };

    const id = formString(fd, "categoryId");
    if (id) {
      const valid = uuidSchema.safeParse(id);
      if (!valid.success) throw new BusinessRuleError("Categoria inválida.");
      await updateCategory(valid.data, parsed.data);
    } else {
      await createCategory(parsed.data);
    }
    revalidatePath("/admin/categorias");
    return { ok: true, message: "Categoria salva." };
  } catch (error) {
    return failure(error);
  }
}

/** Botão "Criar categorias sugeridas": cria só o que ainda não existe, nunca altera as categorias existentes. */
export async function createSuggestedCategoriesAction(): Promise<FormState> {
  try {
    await requireAdminAction();
    const { created } = await ensureSuggestedCategories();
    revalidatePath("/", "layout");
    return { ok: true, message: created > 0 ? `${created} categorias criadas.` : "As categorias sugeridas já existem." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteCategoryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireAdminAction();
    const id = uuidSchema.safeParse(formString(fd, "categoryId"));
    if (!id.success) throw new BusinessRuleError("Categoria inválida.");
    await deleteCategory(id.data);
    revalidatePath("/admin/categorias");
    return { ok: true, message: "Categoria excluída. Os produtos dela ficaram sem categoria." };
  } catch (error) {
    return failure(error);
  }
}

/* ------------------------- Produtos de demonstração ------------------------- */

export async function removeDemoProductsAction(_prev: FormState, _fd: FormData): Promise<FormState> {
  try {
    await requireAdminAction();
    const result = await removeDemoProducts();
    revalidatePath("/", "layout");
    const parts = [
      result.deleted > 0 ? `${result.deleted} excluído(s)` : "",
      result.hidden > 0 ? `${result.hidden} ocultado(s) da loja (aparecem em pedidos e foram preservados)` : "",
      result.categoriesDeleted > 0 ? `${result.categoriesDeleted} categoria(s) antiga(s) vazia(s) removida(s)` : "",
    ].filter(Boolean);
    return { ok: true, message: parts.length > 0 ? `Produtos de demonstração: ${parts.join(", ")}.` : "Não havia produtos de demonstração." };
  } catch (error) {
    return failure(error);
  }
}

/* ------------------------------ Manutenção ------------------------------ */

/** Botão "Executar manutenção agora" do Resumo: faz o mesmo que o agendador (pedidos vencidos + limpeza). */
export async function runMaintenanceNowAction(): Promise<FormState> {
  try {
    const admin = await requireAdminAction();
    const limit = checkRateLimit(`manutencao:${admin.id}`, 5, 60 * 1000);
    if (!limit.ok) throw new RateLimitError(limit.retryAfterSeconds);
    const report = await runMaintenance("painel");
    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/pedidos");
    return { ok: true, message: describeMaintenance(report) };
  } catch (error) {
    return failure(error);
  }
}

/* ------------------------------ Estoque ------------------------------ */

export async function adjustStockAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const admin = await requireAdminAction();
    const parsed = stockAdjustSchema.safeParse({
      productId: formString(fd, "productId"),
      mode: formString(fd, "mode"),
      quantity: formInt(fd, "quantity"),
      reason: formString(fd, "reason"),
    });
    if (!parsed.success) return { errors: zodFieldErrors(parsed.error), message: "Confira os campos destacados." };

    const result = await adjustStock({ ...parsed.data, actorId: admin.id });
    revalidatePath("/admin/estoque");
    return {
      ok: true,
      message: result.changed
        ? `Estoque de "${result.productName}" atualizado: ${result.before} → ${result.after}.`
        : "Nada mudou: a quantidade já era essa.",
    };
  } catch (error) {
    return failure(error);
  }
}

/* ------------------------------ Pedidos ------------------------------ */

const statusSchema = z.enum(ORDER_STATUSES);

export async function updateOrderStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const admin = await requireAdminAction();
    const orderId = uuidSchema.safeParse(formString(fd, "orderId"));
    const next = statusSchema.safeParse(formString(fd, "next"));
    if (!orderId.success || !next.success) throw new BusinessRuleError("Dados do pedido inválidos.");

    const tracking = formString(fd, "trackingCode")?.trim();
    if (tracking && tracking.length > 80) return { errors: { trackingCode: "Código muito longo (máx. 80)." } };

    await updateOrderStatus({ orderId: orderId.data, next: next.data, trackingCode: tracking || null, actorId: admin.id });
    revalidatePath("/admin/pedidos");
    return { ok: true, message: "Status do pedido atualizado." };
  } catch (error) {
    return failure(error);
  }
}

export async function refundOrderAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireAdminAction();
    const orderId = uuidSchema.safeParse(formString(fd, "orderId"));
    if (!orderId.success) throw new BusinessRuleError("Pedido inválido.");
    const result = await refundOrder(orderId.data);
    revalidatePath("/admin/pedidos");
    return {
      ok: true,
      message: result.confirmed
        ? "Reembolso concluído."
        : `Reembolso solicitado ao ${getPaymentProvider().label}. O pedido será atualizado assim que ele confirmar.`,
    };
  } catch (error) {
    return failure(error);
  }
}

/* ------------------------------ Clientes ------------------------------ */

export async function toggleCustomerActiveAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireAdminAction();
    const id = uuidSchema.safeParse(formString(fd, "userId"));
    if (!id.success) throw new BusinessRuleError("Cliente inválido.");
    const active = formString(fd, "active") === "true";
    await setUserActive(id.data, active);
    revalidatePath("/admin/clientes");
    return { ok: true, message: active ? "Conta reativada." : "Conta desativada. O cliente não consegue mais entrar." };
  } catch (error) {
    return failure(error);
  }
}

/** Gera um link de nova senha (uso único, 60 min) para o cliente. O link só aparece agora: não fica guardado. */
export async function createPasswordResetLinkAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const admin = await requireAdminAction();
    const id = uuidSchema.safeParse(formString(fd, "userId"));
    if (!id.success) throw new BusinessRuleError("Cliente inválido.");
    const { token } = await createPasswordResetLink(id.data, admin.id);
    const base = getEnv().siteUrl.replace(/\/+$/, "");
    return { ok: true, message: "Link gerado. Ele vale por 60 minutos e só funciona uma vez.", link: `${base}/redefinir-senha/${token}` };
  } catch (error) {
    return failure(error);
  }
}

/* ------------------------------ Configurações ------------------------------ */

export async function saveSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireAdminAction();
    const errors: Record<string, string> = {};

    const shippingMode = formString(fd, "shippingMode") === "calculated" ? "calculated" : "fixed";

    const flatRateRaw = formString(fd, "shippingFlatRate")?.trim() ?? "";
    const flatRate = parseMoneyToCents(flatRateRaw || "0");
    if (flatRate === null) errors.shippingFlatRate = "Informe um valor válido, por exemplo 30,00.";

    const handlingRaw = formString(fd, "shippingHandling")?.trim() ?? "";
    const handling = parseMoneyToCents(handlingRaw || "0");
    if (handling === null) errors.shippingHandling = "Informe um valor válido, por exemplo 2,50, ou deixe em branco.";

    /** Número inteiro opcional; em branco usa o padrão da loja. Texto inválido vira erro no campo. */
    const optionalNumber = (field: string, label: string): number | undefined => {
      const value = formInt(fd, field);
      if (value !== undefined && Number.isNaN(value)) {
        errors[field] = `${label}: digite só números.`;
        return undefined;
      }
      return value;
    };

    const freeAboveRaw = formString(fd, "shippingFreeAbove")?.trim();
    let freeAbove: number | null = null;
    if (freeAboveRaw) {
      freeAbove = parseMoneyToCents(freeAboveRaw);
      if (freeAbove === null || freeAbove === 0) errors.shippingFreeAbove = "Informe um valor válido ou deixe em branco.";
    }

    const logoKey = formString(fd, "logoKey")?.trim();
    const deliveryEnabled = formBool(fd, "shippingDeliveryEnabled");
    const pickupEnabled = formBool(fd, "shippingPickupEnabled");
    if (!deliveryEnabled && !pickupEnabled) errors.shippingDeliveryEnabled = "Ative pelo menos uma forma de entrega, senão ninguém consegue comprar.";
    // Campo vazio não pode virar "frete grátis" sem querer: quem entrega com valor fixo precisa dizer o valor (0 = grátis).
    if (deliveryEnabled && shippingMode === "fixed" && flatRateRaw === "" && !errors.shippingFlatRate) {
      errors.shippingFlatRate = "Informe o valor do frete. Digite 0 se a entrega for grátis.";
    }

    const services = {
      sedex: formBool(fd, "shippingServiceSedex"),
      pac: formBool(fd, "shippingServicePac"),
      mini: formBool(fd, "shippingServiceMini"),
    };
    if (shippingMode === "calculated") {
      if (onlyDigits(formString(fd, "shippingOriginCep")).length !== 8) errors.shippingOriginCep = "Informe o CEP de onde você envia os pedidos (8 números).";
      if (!services.sedex && !services.pac && !services.mini) errors.shippingServiceSedex = "Marque pelo menos um serviço de envio (SEDEX, PAC ou Mini Envios).";
    }

    const pix = formBool(fd, "payPix");
    const card = formBool(fd, "payCard");
    const boleto = formBool(fd, "payBoleto");
    if (!pix && !card && !boleto) errors.payPix = "Ative pelo menos uma forma de pagamento.";

    const campStart = parseBrLocal(formString(fd, "campStarts"));
    if (campStart === undefined) errors.campaignStartsAt = "Data de início inválida";
    const campEnd = parseBrLocal(formString(fd, "campEnds"));
    if (campEnd === undefined) errors.campaignEndsAt = "Data de fim inválida";

    const parsed = storeSettingsSchema.safeParse({
      storeName: formString(fd, "storeName") ?? "",
      tagline: formString(fd, "tagline") ?? "",
      description: formString(fd, "description") ?? "",
      logoKey: logoKey && isValidStorageKey(logoKey) && logoKey.startsWith("branding/") ? logoKey : null,
      whatsapp: formString(fd, "whatsapp") ?? "",
      whatsappGroupUrl: formString(fd, "whatsappGroupUrl") ?? "",
      instagram: formString(fd, "instagram") ?? "",
      email: formString(fd, "email")?.trim() ?? "",
      phone: formString(fd, "phone") ?? "",
      addressText: formString(fd, "addressText") ?? "",
      businessHours: formString(fd, "businessHours") ?? "",
      fairsNote: formString(fd, "fairsNote") ?? "",
      shopAssistantEnabled: formBool(fd, "shopAssistantEnabled"),
      shipping: {
        deliveryEnabled,
        flatRateCents: flatRate ?? 0,
        freeAboveCents: freeAbove,
        estimate: formString(fd, "shippingEstimate") ?? "",
        pickupEnabled,
        pickupInstructions: formString(fd, "shippingPickupInstructions") ?? "",
        mode: shippingMode,
        origin: {
          cep: formString(fd, "shippingOriginCep") ?? "",
          street: formString(fd, "shippingOriginStreet") ?? "",
          number: formString(fd, "shippingOriginNumber") ?? "",
          complement: formString(fd, "shippingOriginComplement") ?? "",
          neighborhood: formString(fd, "shippingOriginNeighborhood") ?? "",
          city: formString(fd, "shippingOriginCity") ?? "",
          state: formString(fd, "shippingOriginState") ?? "",
        },
        services,
        handlingCents: handling ?? 0,
        declareValue: formBool(fd, "shippingDeclareValue"),
        postingDays: optionalNumber("shippingPostingDays", "Dias para postar"),
        defaultItem: {
          weightGrams: optionalNumber("shippingItemWeight", "Peso"),
          lengthCm: optionalNumber("shippingItemLength", "Comprimento"),
          widthCm: optionalNumber("shippingItemWidth", "Largura"),
          heightCm: optionalNumber("shippingItemHeight", "Altura"),
        },
      },
      payment: {
        pix,
        card,
        boleto,
        maxInstallments: formInt(fd, "payMaxInstallments") ?? 1,
        windowMinutes: formInt(fd, "payWindowMinutes") ?? 45,
      },
      campaign: {
        enabled: formString(fd, "campMode") !== "off",
        mode: formString(fd, "campMode") === "on" ? "on" : formString(fd, "campMode") === "off" ? "off" : "auto",
        name: formString(fd, "campName") || undefined,
        headline: formString(fd, "campHeadline") ?? "",
        teaser: formString(fd, "campTeaser") ?? "",
        startsAt: campStart ? campStart.toISOString() : null,
        endsAt: campEnd ? campEnd.toISOString() : null,
        ctaLabel: fd.has("campCtaLabel") ? (formString(fd, "campCtaLabel") ?? "") : undefined,
        ctaHref: fd.has("campCtaHref") ? (formString(fd, "campCtaHref") ?? "") : undefined,
        teaserHours: formInt(fd, "campTeaserHours") ?? 0,
      },
    });

    if (!parsed.success) {
      const raw = zodFieldErrors(parsed.error);
      // Os erros de campos aninhados voltam como "shipping.origin.cep"; o formulário usa nomes planos (shippingOriginCep).
      const flat: Record<string, string> = {};
      for (const [key, message] of Object.entries(raw)) {
        flat[key.split(".").map((part, i) => (i === 0 ? part : `${part[0].toUpperCase()}${part.slice(1)}`)).join("")] = message;
      }
      return { errors: { ...flat, ...errors }, message: "Confira os campos destacados." };
    }
    if (Object.keys(errors).length > 0) return { errors, message: "Confira os campos destacados." };

    await saveSettings(parsed.data);
    revalidatePath("/", "layout");
    return { ok: true, message: "Configurações salvas." };
  } catch (error) {
    return failure(error);
  }
}

/** Botão "Testar frete" do painel: consulta a SuperFrete de verdade (com o token do servidor) e mostra o resultado ou o erro. */
export async function testShippingAction(_prev: FormState & { lines?: string[] }, fd: FormData): Promise<FormState & { lines?: string[] }> {
  try {
    const admin = await requireAdminAction();
    const limit = checkRateLimit(`frete-teste:${admin.id}`, 10, 60 * 1000);
    if (!limit.ok) throw new RateLimitError(limit.retryAfterSeconds);

    const cep = onlyDigits(formString(fd, "testCep"));
    if (cep.length !== 8) return { errors: { testCep: "Digite um CEP de destino com 8 números." }, message: "Confira o CEP." };

    const result = await testSuperFreteQuote(cep, await getSettings());
    return result.ok
      ? { ok: true, message: "A SuperFrete respondeu:", lines: result.lines }
      : { ok: false, message: result.message };
  } catch (error) {
    return failure(error);
  }
}

/* ------------------------------ Assistente de IA ------------------------------ */

export type AiState = FormState & { suggestion?: ProductSuggestion };

/**
 * Gera uma SUGESTÃO de cadastro. Nada é gravado aqui: o resultado vai para um formulário
 * que o administrador revisa e só ele confirma (botões "Salvar rascunho" / "Publicar").
 */
export async function suggestProductAction(_prev: AiState, fd: FormData): Promise<AiState> {
  try {
    const admin = await requireAdminAction();
    const limit = checkRateLimit(`ai:${admin.id}`, 20, 60 * 1000);
    if (!limit.ok) throw new RateLimitError(limit.retryAfterSeconds);

    const categories = toCategoryOptions(await listCategories({ onlyActive: true }));
    const suggestion = await suggestProduct({ description: formString(fd, "description") ?? "", categories });
    return { ok: true, suggestion };
  } catch (error) {
    return failure(error);
  }
}
