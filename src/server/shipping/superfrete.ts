import { createHash } from "node:crypto";
import { formatBRL } from "@/lib/money";
import { getEnv } from "../env";
import type { StoreSettings } from "../services/settings";
import { flatDeliveryOption, pickupOption } from "./flat-rate";
import { buildPackage, type ShippingPackage } from "./package";
import type { ShippingOption, ShippingProvider, ShippingQuoteInput, ShippingQuoteResult } from "./types";

/**
 * Frete calculado pelo CEP com a SuperFrete (que cota os Correios: SEDEX, PAC, Mini Envios).
 *
 * O dono informa no painel o CEP/endereço de onde envia; o token da conta SuperFrete fica só no servidor (SUPERFRETE_TOKEN).
 * O preço NUNCA vem do navegador: o servidor recalcula a cotação ao criar o pedido.
 *
 * ATENÇÃO — não validado com a SuperFrete real: a documentação oficial não pôde ser consultada neste ambiente, então a chamada
 * (POST /api/v0/calculator) e a leitura da resposta seguem o formato público conhecido e foram testadas só contra um servidor
 * simulado. A leitura é defensiva: qualquer resposta inesperada vira "falha de cálculo" e a loja usa o frete reserva (se o dono
 * definiu um) em vez de cobrar um valor errado. O botão "Testar frete" do painel mostra o resultado/erro reais com o seu token.
 */

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const MAX_PRICE_REAIS = 5_000;

export type ServiceCode = "SEDEX" | "PAC" | "MINI";

export type ServiceDef = {
  /** ID do serviço na SuperFrete (PAC=1, SEDEX=2, Mini Envios=17). */
  id: number;
  code: ServiceCode;
  label: string;
  setting: "sedex" | "pac" | "mini";
  /** Nomes aceitos quando a resposta não traz o ID. */
  names: readonly string[];
};

export const SUPERFRETE_SERVICES: readonly ServiceDef[] = [
  { id: 2, code: "SEDEX", label: "SEDEX", setting: "sedex", names: ["sedex"] },
  { id: 1, code: "PAC", label: "PAC", setting: "pac", names: ["pac"] },
  { id: 17, code: "MINI", label: "Mini Envios", setting: "mini", names: ["mini envios", "minienvios", "mini envio"] },
];

export type ServiceQuote = {
  code: ServiceCode;
  label: string;
  priceCents: number;
  minDays: number | null;
  maxDays: number | null;
};

export type ShippingFailureKind = "not_configured" | "timeout" | "network" | "http" | "invalid" | "empty";

export class ShippingServiceError extends Error {
  constructor(
    message: string,
    public readonly kind: ShippingFailureKind,
  ) {
    super(message);
    this.name = "ShippingServiceError";
  }
}

/* ----------------------------- leitura da resposta ----------------------------- */

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let text = value.replace(/[^\d.,-]/g, "");
  if (!text) return null;
  // "1.234,56" -> 1234.56 ; "22,5" -> 22.5 ; "22.50" -> 22.5
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function toDays(value: unknown): number | null {
  const n = toNumber(value);
  return n !== null && n >= 0 && n <= 120 ? Math.ceil(n) : null;
}

function serviceFor(entry: Record<string, unknown>, wanted: readonly ServiceDef[]): ServiceDef | null {
  const id = toNumber(entry.id);
  if (id !== null) {
    const byId = wanted.find((s) => s.id === id);
    if (byId) return byId;
  }
  if (typeof entry.name === "string") {
    const name = entry.name.trim().toLowerCase();
    return wanted.find((s) => s.names.includes(name)) ?? null;
  }
  return null;
}

function entriesOf(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    for (const key of ["data", "services", "results", "quotes"]) {
      const inner = (body as Record<string, unknown>)[key];
      if (Array.isArray(inner)) return inner;
    }
  }
  return null;
}

/** Lê a resposta da SuperFrete. Ignora serviços com erro, sem preço válido ou que a loja não oferece. */
export function parseSuperFreteResponse(body: unknown, wanted: readonly ServiceDef[]): ServiceQuote[] {
  const entries = entriesOf(body);
  if (!entries) throw new ShippingServiceError("Resposta da SuperFrete em formato inesperado.", "invalid");

  const quotes = new Map<ServiceCode, ServiceQuote>();
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    if (entry.has_error === true || (typeof entry.error === "string" && entry.error.trim() !== "")) continue;

    const service = serviceFor(entry, wanted);
    if (!service) continue;

    const price = toNumber(entry.price) ?? toNumber(entry.custom_price);
    if (price === null || price <= 0 || price > MAX_PRICE_REAIS) continue;

    const range = entry.delivery_range && typeof entry.delivery_range === "object" ? (entry.delivery_range as Record<string, unknown>) : {};
    let minDays = toDays(range.min);
    let maxDays = toDays(range.max);
    if (minDays === null && maxDays === null) {
      const single = toDays(entry.delivery_time);
      minDays = single;
      maxDays = single;
    }
    if (minDays === null) minDays = maxDays;
    if (maxDays === null) maxDays = minDays;
    if (minDays !== null && maxDays !== null && minDays > maxDays) [minDays, maxDays] = [maxDays, minDays];

    const priceCents = Math.round(price * 100);
    const previous = quotes.get(service.code);
    if (!previous || priceCents < previous.priceCents) {
      quotes.set(service.code, { code: service.code, label: service.label, priceCents, minDays, maxDays });
    }
  }

  if (quotes.size === 0) throw new ShippingServiceError("A SuperFrete não devolveu nenhum serviço disponível para este envio.", "empty");
  return [...quotes.values()];
}

export function formatEstimate(minDays: number | null, maxDays: number | null, postingDays: number): string | null {
  if (minDays === null || maxDays === null) return postingDays > 0 ? `Postagem em até ${postingDays} dia(s) útil(eis); prazo dos Correios a confirmar` : null;
  const min = minDays + postingDays;
  const max = maxDays + postingDays;
  if (min === max) return `${min} ${min === 1 ? "dia útil" : "dias úteis"}`;
  return `${min} a ${max} dias úteis`;
}

/* ----------------------------- cliente HTTP ----------------------------- */

export type CalculateParams = {
  originCep: string;
  destinationCep: string;
  pkg: ShippingPackage;
  services: readonly ServiceDef[];
  /** Valor declarado em centavos; null = sem seguro. */
  insuranceCents: number | null;
  /** Nome da loja e contato, para o cabeçalho User-Agent. */
  appLabel: string;
  useCache?: boolean;
};

const cache = new Map<string, { at: number; quotes: ServiceQuote[] }>();

export function clearShippingQuoteCache(): void {
  cache.clear();
}

function cacheKey(p: CalculateParams): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        p.originCep,
        p.destinationCep,
        p.pkg,
        p.services.map((s) => s.id).sort(),
        p.insuranceCents === null ? null : Math.ceil(p.insuranceCents / 100),
      ]),
    )
    .digest("hex");
}

/** Cabeçalhos HTTP só aceitam caracteres simples: tira acentos, emoji e quebras de linha (um nome de loja com "🚗" ou "—" não pode derrubar o cálculo). */
function headerSafe(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeSnippet(text: string): string {
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const message = [json.message, json.error, json.errors].find((v) => typeof v === "string") as string | undefined;
    if (message) return message.slice(0, 160);
  } catch {
    // não era JSON
  }
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

export async function calculateSuperFrete(params: CalculateParams): Promise<ServiceQuote[]> {
  const cfg = getEnv().superFrete;
  if (!cfg.token) throw new ShippingServiceError("O token da SuperFrete (SUPERFRETE_TOKEN) não está configurado no servidor.", "not_configured");
  // Token copiado com aspas "curvas", acentos ou espaços no meio não funciona como cabeçalho HTTP: avisa o dono em vez de parecer "fora do ar".
  if (!/^[\x21-\x7E]+$/.test(cfg.token)) {
    throw new ShippingServiceError("O token da SuperFrete (SUPERFRETE_TOKEN) tem caracteres inválidos. Copie de novo, só o token, sem aspas nem espaços.", "not_configured");
  }

  const useCache = params.useCache !== false;
  const key = cacheKey(params);
  const now = Date.now();
  if (useCache) {
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_TTL_MS) return hit.quotes;
  }

  const body = {
    from: { postal_code: params.originCep },
    to: { postal_code: params.destinationCep },
    services: params.services.map((s) => s.id).join(","),
    options: {
      own_hand: false,
      receipt: false,
      insurance_value: params.insuranceCents === null ? 0 : Number((params.insuranceCents / 100).toFixed(2)),
      use_insurance_value: params.insuranceCents !== null,
    },
    package: {
      height: params.pkg.heightCm,
      width: params.pkg.widthCm,
      length: params.pkg.lengthCm,
      weight: Number((params.pkg.weightGrams / 1000).toFixed(3)),
    },
  };

  let response: Response;
  try {
    response = await fetch(`${cfg.apiBase}/api/v0/calculator`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": headerSafe(cfg.contactEmail ? `${params.appLabel} (${cfg.contactEmail})` : params.appLabel) || "loja-online",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new ShippingServiceError(timedOut ? "A SuperFrete demorou demais para responder." : "Não foi possível conectar à SuperFrete.", timedOut ? "timeout" : "network");
  }

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new ShippingServiceError(`A SuperFrete recusou o cálculo (HTTP ${response.status}): ${safeSnippet(text) || "sem detalhes"}`, "http");
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ShippingServiceError("A SuperFrete devolveu uma resposta que não é JSON.", "invalid");
  }

  console.info(
  "[frete] resposta bruta da SuperFrete:",
  JSON.stringify(json).slice(0, 5000),
);

const quotes = parseSuperFreteResponse(json, params.services);
  if (useCache) {
    if (cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { at: now, quotes });
  }
  return quotes;
}

/* ----------------------------- provedor ----------------------------- */

export function isSuperFreteConfigured(): boolean {
  return Boolean(getEnv().superFrete.token);
}

function appLabel(settings: StoreSettings): string {
  return `${settings.storeName} (loja online)`.slice(0, 80);
}

export function wantedServices(settings: StoreSettings): ServiceDef[] {
  return SUPERFRETE_SERVICES.filter((s) => settings.shipping.services[s.setting]);
}

/** Converte as cotações em opções de checkout: acréscimo de embalagem, prazo de postagem e frete grátis (na opção mais barata). */
export function quotesToOptions(quotes: ServiceQuote[], input: ShippingQuoteInput, settings: StoreSettings): ShippingOption[] {
  const cfg = settings.shipping;
  const options: ShippingOption[] = quotes
    .map((q) => ({
      code: q.code,
      label: q.label,
      priceCents: q.priceCents + cfg.handlingCents,
      estimate: formatEstimate(q.minDays, q.maxDays, cfg.postingDays),
      requiresAddress: true,
    }))
    .sort((a, b) => a.priceCents - b.priceCents || a.label.localeCompare(b.label));

  const free = cfg.freeAboveCents !== null && input.subtotalCents >= cfg.freeAboveCents;
  if (free && options.length > 0) {
    options[0] = { ...options[0], priceCents: 0, description: "Frete grátis para este pedido" };
  }
  return options;
}

export class SuperFreteShippingProvider implements ShippingProvider {
  readonly id = "superfrete";

  private fallback(input: ShippingQuoteInput, settings: StoreSettings): Pick<ShippingQuoteResult, "options" | "notice" | "source"> {
    // O valor fixo só serve de reserva se o dono definiu um (0 = "grátis" seria perigoso: uma falha do serviço viraria frete de graça).
    if (settings.shipping.flatRateCents > 0) {
      return {
        options: [flatDeliveryOption(input, settings)],
        notice: "Não conseguimos calcular o frete pelo CEP agora, então usamos o valor padrão de entrega da loja.",
        source: "fallback",
      };
    }
    return {
      options: [],
      notice: "Não conseguimos calcular o frete agora. Tente de novo em instantes ou fale com a loja.",
      source: "none",
    };
  }

  private async quoteDelivery(input: ShippingQuoteInput, destinationCep: string, settings: StoreSettings): Promise<Pick<ShippingQuoteResult, "options" | "notice" | "source">> {
    const cfg = settings.shipping;
    const pkg = buildPackage(input.items, settings);
    if (!pkg.ok) {
      return { options: [], notice: `${pkg.reason} Fale com a loja para combinar o frete.`, source: "none" };
    }

    const services = wantedServices(settings);
    if (services.length === 0 || !cfg.origin.cep) {
      console.warn("[frete] cálculo por CEP ligado, mas falta o CEP de origem ou nenhum serviço está marcado no painel.");
      return this.fallback(input, settings);
    }

    try {
      const quotes = await calculateSuperFrete({
        originCep: cfg.origin.cep,
        destinationCep,
        pkg: pkg.package,
        services,
        // PAC e SEDEX exigem valor segurado mínimo de R$ 25,63.
// Não inventamos nem aumentamos o valor declarado: abaixo do mínimo,
// consultamos o frete sem contratar o seguro nesta cotação.
insuranceCents:
  cfg.declareValue && input.subtotalCents >= 2563
    ? input.subtotalCents
    : null,
        appLabel: appLabel(settings),
      });
      return { options: quotesToOptions(quotes, input, settings), notice: null, source: "superfrete" };
    } catch (error) {
      const kind = error instanceof ShippingServiceError ? error.kind : "network";
      console.warn(`[frete] cálculo pela SuperFrete falhou (${kind}): ${error instanceof Error ? error.message : String(error)}`);
      return this.fallback(input, settings);
    }
  }

  async quote(input: ShippingQuoteInput, settings: StoreSettings): Promise<ShippingQuoteResult> {
    let options: ShippingOption[] = [];
    let notice: string | null = null;
    let needsCep = false;
    let source: ShippingQuoteResult["source"] = "none";

    if (settings.shipping.deliveryEnabled) {
      if (!input.destinationCep) {
        needsCep = true;
      } else {
        const delivery = await this.quoteDelivery(input, input.destinationCep, settings);
        options = delivery.options;
        notice = delivery.notice;
        source = delivery.source;
      }
    }

    const pickup = pickupOption(settings);
    if (pickup) options = [...options, pickup];
    return { options, notice, needsCep, source };
  }
}

/** Teste feito pelo dono no painel: mostra o resultado real (ou o erro real) da SuperFrete, sem usar o frete reserva nem o cache. */
export async function testSuperFreteQuote(destinationCep: string, settings: StoreSettings): Promise<{ ok: true; lines: string[] } | { ok: false; message: string }> {
  const cfg = settings.shipping;
  if (!cfg.origin.cep) return { ok: false, message: "Preencha e salve o CEP de origem antes de testar." };
  const services = wantedServices(settings);
  if (services.length === 0) return { ok: false, message: "Marque pelo menos um serviço (SEDEX, PAC ou Mini Envios) e salve antes de testar." };

  const pkg = buildPackage([{ productId: "teste", quantity: 1, weightGrams: null, lengthCm: null, widthCm: null, heightCm: null }], settings);
  if (!pkg.ok) return { ok: false, message: pkg.reason };

  try {
    const quotes = await calculateSuperFrete({
      originCep: cfg.origin.cep,
      destinationCep,
      pkg: pkg.package,
      services,
      insuranceCents: null,
      appLabel: appLabel(settings),
      useCache: false,
    });
    const options = quotesToOptions(quotes, { subtotalCents: 0, destinationCep, items: [] }, settings);
    return {
      ok: true,
      lines: options.map((o) => `${o.label}: ${formatBRL(o.priceCents)}${o.estimate ? ` — ${o.estimate}` : ""}`),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Falha desconhecida ao consultar a SuperFrete." };
  }
}
