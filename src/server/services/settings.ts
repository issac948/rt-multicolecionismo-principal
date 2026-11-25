import { cache } from "react";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { BRAZIL_STATES, MAX_PRICE_CENTS } from "@/lib/constants";
import { isSafeCampaignLink } from "@/lib/campaign";
import { onlyDigits } from "@/lib/text";
import { db } from "../db";
import { settings } from "../db/schema";

const SETTINGS_KEY = "store";

/** Contatos informados pelo dono (valem para instalações novas e para quem ainda não preencheu; apagar no painel continua funcionando). */
export const OWNER_CONTACT = {
  /** DDD + número, exatamente como o dono informou (+55 41 9141-9031). */
  phone: "4191419031",
  groupUrl: "https://chat.whatsapp.com/GbvNJdKd8Tc88muhZKjgFE",
} as const;

function optionalPhoneDigitsWithDefault(fallback: string) {
  return z
    .string()
    .trim()
    .default(fallback)
    .transform((v) => onlyDigits(v))
    .refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "Telefone inválido (use DDD + número)");
}

const optionalPhoneDigits = z
  .string()
  .trim()
  .default("")
  .transform((v) => onlyDigits(v))
  .refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "Telefone inválido (use DDD + número)");

/** CEP: aceita "80010-000" e guarda só os 8 números (ou vazio). */
const optionalCep = z
  .string()
  .trim()
  .default("")
  .transform((v) => onlyDigits(v))
  .refine((v) => v === "" || v.length === 8, "CEP inválido (são 8 números)");

/** Aceita "@loja", "loja" ou "https://instagram.com/loja" e guarda só "loja". */
const instagramHandle = z
  .string()
  .trim()
  .default("")
  .transform((v) => v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, ""))
  .refine((v) => /^[A-Za-z0-9._]{0,30}$/.test(v), "Usuário do Instagram inválido");

export const storeSettingsSchema = z.object({
  storeName: z.string().trim().min(2, "Informe o nome da loja").max(80, "Nome muito longo").default("RT Multicolecionismo"),
  tagline: z.string().trim().max(120, "Frase muito longa (máx. 120)").default("Miniaturas de carros e colecionáveis"),
  description: z
    .string()
    .trim()
    .max(600, "Descrição muito longa (máx. 600)")
    .default("Miniaturas de carros colecionáveis, lacradas e soltas, além de bonecos, figuras e outros colecionáveis para a sua coleção. Loja de Curitiba."),
  logoKey: z.string().max(200).nullable().default(null),
  whatsapp: optionalPhoneDigitsWithDefault(OWNER_CONTACT.phone),
  /** Link de convite do grupo de WhatsApp dos clientes (opcional). Só aceita endereços do WhatsApp. */
  whatsappGroupUrl: z
    .string()
    .trim()
    .default(OWNER_CONTACT.groupUrl)
    .refine((v) => v === "" || /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}\/?(\?[^\s]*)?$/.test(v), "Use o link de convite do grupo (começa com https://chat.whatsapp.com/)"),
  instagram: instagramHandle,
  email: z.union([z.literal(""), z.email("E-mail de contato inválido")]).default(""),
  phone: optionalPhoneDigitsWithDefault(OWNER_CONTACT.phone),
  addressText: z.string().trim().max(300, "Endereço muito longo (máx. 300)").default(""),
  businessHours: z.string().trim().max(200, "Horário muito longo (máx. 200)").default(""),
  /** Aviso sobre eventos (aparece no rodapé e junto do calendário de eventos). Em branco = não aparece. (O nome interno "fairsNote" é antigo e foi mantido para não exigir migração.) */
  fairsNote: z.string().trim().max(200, "Texto muito longo (máx. 200)").default("Além da loja online, também participamos de eventos, em Curitiba."),
  /** Mostra o assistente de compras (IA) na loja. Só aparece de fato se a chave de IA estiver configurada no servidor. */
  shopAssistantEnabled: z.boolean().default(true),
  shipping: z
    .object({
      // Frete e prazo são decisões do dono: até ele configurar, a loja não mostra nem cobra nenhum valor inventado.
      deliveryEnabled: z.boolean().default(false),
      flatRateCents: z.number().int().min(0).max(MAX_PRICE_CENTS).default(0),
      freeAboveCents: z.number().int().min(1).max(MAX_PRICE_CENTS).nullable().default(null),
      estimate: z.string().trim().max(80, "Prazo muito longo (máx. 80)").default(""),
      pickupEnabled: z.boolean().default(false),
      pickupInstructions: z.string().trim().max(300, "Instruções muito longas (máx. 300)").default(""),
      /**
       * "fixed" = valor fixo por pedido (padrão). "calculated" = preço e prazo reais pelo CEP do cliente e pelo peso dos produtos (SuperFrete: SEDEX, PAC...).
       * As regras de negócio (CEP de origem obrigatório etc.) são conferidas ao salvar no painel, não aqui: um erro aqui faria a loja inteira voltar aos padrões.
       */
      mode: z.enum(["fixed", "calculated"]).default("fixed"),
      /** De onde o dono envia os pedidos. O CEP é o que o cálculo usa; o resto fica registrado para etiquetas e conferência. */
      origin: z
        .object({
          cep: optionalCep,
          street: z.string().trim().max(150, "Rua muito longa (máx. 150)").default(""),
          number: z.string().trim().max(20, "Número muito longo (máx. 20)").default(""),
          complement: z.string().trim().max(100, "Complemento muito longo (máx. 100)").default(""),
          neighborhood: z.string().trim().max(100, "Bairro muito longo (máx. 100)").default(""),
          city: z.string().trim().max(100, "Cidade muito longa (máx. 100)").default(""),
          state: z
            .string()
            .trim()
            .toUpperCase()
            .default("")
            .refine((v) => v === "" || (BRAZIL_STATES as readonly string[]).includes(v), "Estado inválido (use a sigla, ex.: PR)"),
        })
        .prefault({}),
      /** Serviços que a loja oferece quando o frete é calculado. */
      services: z
        .object({
          sedex: z.boolean().default(true),
          pac: z.boolean().default(true),
          mini: z.boolean().default(false),
        })
        .prefault({}),
      /** Acréscimo por pedido (embalagem, caixa...) somado ao frete calculado. */
      handlingCents: z.number().int().min(0).max(MAX_PRICE_CENTS).default(0),
      /** Declara o valor dos produtos no frete (seguro dos Correios). Deixa o frete um pouco mais caro. */
      declareValue: z.boolean().default(false),
      /** Dias que o dono leva para embalar e postar; somados ao prazo dos Correios. */
      postingDays: z.number().int().min(0).max(30).default(0),
      /** Peso e medidas usados para produtos que não têm isso cadastrado (valores de exemplo para miniatura embalada: confira com uma balança). */
      defaultItem: z
        .object({
          weightGrams: z.number().int().min(1, "Peso inválido").max(30000, "Peso muito alto").default(100),
          lengthCm: z.number().int().min(1, "Medida inválida").max(100, "Medida muito grande").default(16),
          widthCm: z.number().int().min(1, "Medida inválida").max(100, "Medida muito grande").default(11),
          heightCm: z.number().int().min(1, "Medida inválida").max(100, "Medida muito grande").default(3),
        })
        .prefault({}),
    })
    .prefault({}),
  payment: z
    .object({
      pix: z.boolean().default(true),
      card: z.boolean().default(true),
      boleto: z.boolean().default(false),
      maxInstallments: z.number().int().min(1).max(12).default(1),
      /** Tempo que o cliente tem para pagar antes de o pedido ser cancelado e o estoque liberado. */
      windowMinutes: z.number().int().min(15).max(4320).default(45),
    })
    .prefault({}),
  /** Campanha (ex.: Black Friday): faixa no topo com contagem por data real. Desligada por padrão; some sozinha depois do fim. */
  campaign: z
    .object({
      enabled: z.boolean().default(false),
      mode: z.enum(["auto", "on", "off"]).default("auto"),
      name: z.string().trim().min(1, "Informe o nome da campanha").max(40, "Nome muito longo (máx. 40)").default("Black Friday"),
      /** Texto da faixa durante a campanha. */
      headline: z.string().trim().max(100, "Texto muito longo (máx. 100)").default(""),
      /** Texto da faixa antes do início (contagem para começar). */
      teaser: z.string().trim().max(100, "Texto muito longo (máx. 100)").default(""),
      /** Datas em ISO (UTC); o painel digita em horário de Brasília. */
      startsAt: z.string().nullable().default(null).refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Data de início inválida"),
      endsAt: z.string().nullable().default(null).refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Data de fim inválida"),
      ctaLabel: z.string().trim().max(30, "Texto do botão muito longo (máx. 30)").default("Ver ofertas"),
      ctaHref: z
        .string()
        .trim()
        .max(300)
        .default("/produtos?promocao=1")
        .refine((v) => isSafeCampaignLink(v), "Use um endereço do site (começando com /) ou https://"),
      teaserHours: z.number().int().min(0).max(720).default(0),
    })
    .refine((c) => c.startsAt === null || c.endsAt === null || Date.parse(c.endsAt) > Date.parse(c.startsAt), {
      message: "O fim da campanha precisa ser depois do início",
      path: ["endsAt"],
    })
    .prefault({}),
});

export type StoreSettings = z.output<typeof storeSettingsSchema>;

export function defaultSettings(): StoreSettings {
  return storeSettingsSchema.parse({});
}

async function readSettingsRow(): Promise<{ value: unknown } | null> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, SETTINGS_KEY)).limit(1);
  return row ?? null;
}

/** Configurações da loja (com padrões quando ainda não foram salvas). Uma leitura por requisição. */
export const getSettings = cache(async (): Promise<StoreSettings> => {
  const row = await readSettingsRow();
  const parsed = storeSettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : defaultSettings();
});

/** true se o administrador já salvou as configurações pelo menos uma vez. */
export async function hasSavedSettings(): Promise<boolean> {
  return (await readSettingsRow()) !== null;
}

export async function saveSettings(input: unknown): Promise<StoreSettings> {
  const parsed = storeSettingsSchema.parse(input);
  await db
    .insert(settings)
    .values({ key: SETTINGS_KEY, value: parsed })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed, updatedAt: new Date() } });
  return parsed;
}
