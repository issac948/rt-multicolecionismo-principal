import { z } from "zod";
import { normalizeBrand, normalizeScale } from "./collectibles";
import { BRAZIL_STATES, CATEGORY_KINDS, MAX_PRICE_CENTS, PRODUCT_CONDITIONS } from "./constants";
import { onlyDigits } from "./text";

/**
 * Schemas de validação (zod). Toda entrada vinda do navegador passa por aqui
 * no servidor antes de tocar no banco. Nada é confiado só porque o formulário
 * "já validou" no navegador.
 */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuidSchema = z.string().regex(UUID_RE, "Identificador inválido");

/** Texto opcional: vazio/ausente vira null. */
const optionalText = (max: number, message?: string) =>
  z
    .string()
    .trim()
    .max(max, message ?? `Use no máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null));

const optionalInt = (min: number, max: number, message: string) =>
  z
    .number()
    .int(message)
    .min(min, message)
    .max(max, message)
    .nullish()
    .transform((v) => v ?? null);

export const emailSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.string().min(1, "Informe o e-mail").max(254, "E-mail muito longo").pipe(z.email("E-mail inválido")),
);

export const passwordSchema = z
  .string()
  .min(8, "A senha precisa ter pelo menos 8 caracteres")
  .max(128, "A senha pode ter no máximo 128 caracteres");

export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => onlyDigits(v))
  .refine((v) => v.length === 10 || v.length === 11, "Informe um telefone com DDD");

const optionalPhoneSchema = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? onlyDigits(v) : null))
  .refine((v) => v === null || v.length === 10 || v.length === 11, "Informe um telefone com DDD");

/* ------------------------------ Conta ------------------------------ */

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome").max(100, "Nome muito longo"),
    email: emailSchema,
    phone: optionalPhoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha").max(128),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome").max(100, "Nome muito longo"),
  phone: optionalPhoneSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual").max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
  });

export const addressInputSchema = z.object({
  label: optionalText(40),
  recipientName: z.string().trim().min(2, "Informe o nome de quem recebe").max(100),
  phone: phoneSchema,
  cep: z
    .string()
    .trim()
    .transform((v) => onlyDigits(v))
    .refine((v) => v.length === 8, "CEP inválido (8 números)"),
  street: z.string().trim().min(2, "Informe a rua").max(150),
  number: z.string().trim().min(1, "Informe o número (ou S/N)").max(20),
  complement: optionalText(100),
  neighborhood: z.string().trim().min(2, "Informe o bairro").max(100),
  city: z.string().trim().min(2, "Informe a cidade").max(100),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.enum(BRAZIL_STATES, { error: "Selecione o estado" })),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.output<typeof addressInputSchema>;

/* ----------------------------- Catálogo ----------------------------- */

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2, "O nome precisa ter pelo menos 2 caracteres").max(60, "Nome muito longo"),
  description: optionalText(300),
  position: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
  /** Tipo da categoria: decide quais campos o cadastro de produto mostra. */
  kind: z.enum(CATEGORY_KINDS).default("OUTROS"),
  /** Categoria-mãe (subcategoria). Nulo = categoria principal. */
  parentId: z.uuid("Categoria-mãe inválida").nullish().transform((v) => v ?? null),
});
export type CategoryInput = z.output<typeof categoryInputSchema>;

export const productFeatureSchema = z.object({
  label: z.string().trim().min(1).max(60, "Nome da característica muito longo (máx. 60)"),
  value: z.string().trim().min(1).max(200, "Valor da característica muito longo (máx. 200)"),
});

export const productInputSchema = z
  .object({
    name: z.string().trim().min(3, "O nome precisa ter pelo menos 3 caracteres").max(120, "Nome muito longo (máx. 120)"),
    sku: z.string().trim().max(60, "SKU muito longo (máx. 60)").nullish().transform((v) => (v ? v : null)),
    shortDescription: z.string().trim().max(200, "Descrição curta muito longa (máx. 200)").default(""),
    description: z.string().trim().max(5000, "Descrição muito longa (máx. 5000)").default(""),
    priceCents: z
      .number("Informe o preço")
      .int()
      .min(1, "O preço precisa ser maior que zero")
      .max(MAX_PRICE_CENTS, "Preço acima do limite permitido"),
    salePriceCents: z
      .number()
      .int()
      .min(1, "O preço promocional precisa ser maior que zero")
      .max(MAX_PRICE_CENTS, "Preço acima do limite permitido")
      .nullish()
      .transform((v) => v ?? null),
    stock: z.number("Informe o estoque").int("O estoque precisa ser um número inteiro").min(0, "O estoque não pode ser negativo").max(1_000_000).default(0),
    lowStockThreshold: z.number().int().min(0).max(10_000).default(3),
    active: z.boolean().default(false),
    featured: z.boolean().default(false),
    categoryId: uuidSchema.nullish().transform((v) => v ?? null),
    features: z.array(productFeatureSchema).max(30, "Use no máximo 30 características").default([]),
    tags: z.array(z.string().trim().min(1).max(30, "Tag muito longa (máx. 30)")).max(15, "Use no máximo 15 tags").default([]),
    promoText: optionalText(200),
    seoTitle: optionalText(70, "Título SEO muito longo (máx. 70)"),
    seoDescription: optionalText(160, "Descrição SEO muito longa (máx. 160)"),
    weightGrams: optionalInt(1, 1_000_000, "Peso inválido"),
    lengthCm: optionalInt(1, 10_000, "Medida inválida"),
    widthCm: optionalInt(1, 10_000, "Medida inválida"),
    heightCm: optionalInt(1, 10_000, "Medida inválida"),
    imageIds: z.array(uuidSchema).max(12, "Use no máximo 12 fotos").default([]),
    /* Campos de colecionáveis: todos opcionais (vazio vira null), só valem para quem os preenche. */
    brand: optionalText(60, "Marca muito longa (máx. 60)").transform((v) => (v ? normalizeBrand(v) : null)),
    model: optionalText(120, "Modelo muito longo (máx. 120)"),
    scale: optionalText(12, "Escala muito longa (máx. 12), por exemplo 1:64").transform((v) => (v ? normalizeScale(v) : null)),
    series: optionalText(120, "Série muito longa (máx. 120)"),
    releaseYear: optionalInt(1880, 2100, "Informe um ano entre 1880 e 2100"),
    condition: z.enum(PRODUCT_CONDITIONS, { error: "Escolha lacrado ou solto" }).nullish().transform((v) => v ?? null),
    packagingState: optionalText(200, "Texto muito longo (máx. 200)"),
    conservationNotes: optionalText(500, "Texto muito longo (máx. 500)"),
  })
  .refine((d) => d.salePriceCents === null || d.salePriceCents < d.priceCents, {
    message: "O preço promocional precisa ser menor que o preço normal",
    path: ["salePriceCents"],
  });
export type ProductInput = z.output<typeof productInputSchema>;

/* ------------------------------ Pedido ------------------------------ */

export const checkoutSchema = z.object({
  shippingCode: z.string().trim().min(1, "Escolha a forma de entrega").max(40),
  /** Valor do frete que a pessoa viu na tela. Só serve para avisar se mudou: quem cobra é sempre o valor recalculado no servidor. */
  expectedShippingCents: z
    .string()
    .nullish()
    .transform((v) => (v && /^\d{1,9}$/.test(v.trim()) ? Number(v.trim()) : null)),
  addressId: uuidSchema.nullish().transform((v) => v ?? null),
  note: optionalText(300, "Observação muito longa (máx. 300)"),
});

export const stockAdjustSchema = z.object({
  productId: uuidSchema,
  mode: z.enum(["ENTRADA", "SAIDA", "DEFINIR"], { error: "Escolha o tipo de ajuste" }),
  quantity: z
    .number("Informe a quantidade")
    .int("A quantidade precisa ser um número inteiro")
    .min(0, "A quantidade não pode ser negativa")
    .max(1_000_000, "Quantidade acima do limite"),
  reason: z.string().trim().max(200, "Motivo muito longo (máx. 200)").nullish().transform((v) => (v ? v : null)),
});

/* --------------------------- Utilitários ---------------------------- */

/** Converte erros do zod em { campo: "primeira mensagem" } para mostrar no formulário. */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
