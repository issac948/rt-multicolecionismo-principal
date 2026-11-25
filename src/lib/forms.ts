import { parseBrLocal } from "./datetime-br";
import { parseMoneyToCents } from "./money";
import {
  addressInputSchema,
  productInputSchema,
  zodFieldErrors,
  type AddressInput,
  type ProductInput,
} from "./schemas";

/** Helpers para ler FormData sem confiar em tipos. Valor ausente vira undefined. */
export function formString(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" ? v : undefined;
}

export function formBool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

/** Número inteiro digitado em campo de texto. "" -> undefined, inválido -> NaN. */
export function formInt(fd: FormData, key: string): number | undefined {
  const v = formString(fd, key)?.trim();
  if (v === undefined || v === "") return undefined;
  return /^-?\d+$/.test(v) ? Number(v) : Number.NaN;
}

export type ParsedForm<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> };

/**
 * Converte o formulário de produto (valores em reais, listas em campos repetidos)
 * para o formato interno e valida tudo com o mesmo schema usado pela IA.
 */
export function parseProductForm(fd: FormData): ParsedForm<ProductInput> {
  const errors: Record<string, string> = {};

  const priceRaw = formString(fd, "price");
  const priceCents = parseMoneyToCents(priceRaw);
  if (priceCents === null) errors.priceCents = "Informe um preço válido, por exemplo 899,90";

  const saleRaw = formString(fd, "salePrice")?.trim();
  let salePriceCents: number | null = null;
  if (saleRaw) {
    salePriceCents = parseMoneyToCents(saleRaw);
    if (salePriceCents === null) errors.salePriceCents = "Informe um preço promocional válido, por exemplo 749,90";
  }

  const saleStartsAt = parseBrLocal(formString(fd, "saleStarts"));
  if (saleStartsAt === undefined) errors.saleStartsAt = "Data de início inválida";
  const saleEndsAt = parseBrLocal(formString(fd, "saleEnds"));
  if (saleEndsAt === undefined) errors.saleEndsAt = "Data de fim inválida";

  const labels = fd.getAll("featureLabel").map(String);
  const values = fd.getAll("featureValue").map(String);
  const features = labels
    .map((label, i) => ({ label: label.trim(), value: (values[i] ?? "").trim() }))
    .filter((f) => f.label || f.value);

  const tags = (formString(fd, "tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const candidate = {
    name: formString(fd, "name") ?? "",
    sku: formString(fd, "sku"),
    shortDescription: formString(fd, "shortDescription") ?? "",
    description: formString(fd, "description") ?? "",
    priceCents: priceCents ?? undefined,
    salePriceCents,
    saleStartsAt: saleStartsAt ?? null,
    saleEndsAt: saleEndsAt ?? null,
    stock: formInt(fd, "stock"),
    lowStockThreshold: formInt(fd, "lowStockThreshold"),
    active: formBool(fd, "active"),
    featured: formBool(fd, "featured"),
    categoryId: formString(fd, "categoryId") || null,
    features,
    tags,
    promoText: formString(fd, "promoText"),
    seoTitle: formString(fd, "seoTitle"),
    seoDescription: formString(fd, "seoDescription"),
    weightGrams: formInt(fd, "weightGrams"),
    lengthCm: formInt(fd, "lengthCm"),
    widthCm: formInt(fd, "widthCm"),
    heightCm: formInt(fd, "heightCm"),
    imageIds: fd.getAll("imageIds").map(String).filter(Boolean),
    brand: formString(fd, "brand"),
    model: formString(fd, "model"),
    scale: formString(fd, "scale"),
    series: formString(fd, "series"),
    releaseYear: formInt(fd, "releaseYear"),
    condition: formString(fd, "condition") || null,
    packagingState: formString(fd, "packagingState"),
    conservationNotes: formString(fd, "conservationNotes"),
  };

  const parsed = productInputSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, errors: { ...zodFieldErrors(parsed.error), ...errors } };
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: parsed.data };
}

/**
 * Lê um endereço do formulário. `prefix` permite ter dois formulários de endereço na
 * mesma tela (ex.: "addr_" no checkout); as chaves de erro voltam com o mesmo prefixo.
 */
export function parseAddressForm(fd: FormData, prefix = ""): ParsedForm<AddressInput> {
  const get = (key: string) => formString(fd, `${prefix}${key}`);
  const parsed = addressInputSchema.safeParse({
    label: get("label"),
    recipientName: get("recipientName") ?? "",
    phone: get("phone") ?? "",
    cep: get("cep") ?? "",
    street: get("street") ?? "",
    number: get("number") ?? "",
    complement: get("complement"),
    neighborhood: get("neighborhood") ?? "",
    city: get("city") ?? "",
    state: get("state") ?? "",
    isDefault: formBool(fd, `${prefix}isDefault`),
  });
  if (parsed.success) return { ok: true, data: parsed.data };

  const errors: Record<string, string> = {};
  for (const [key, message] of Object.entries(zodFieldErrors(parsed.error))) errors[`${prefix}${key}`] = message;
  return { ok: false, errors };
}
