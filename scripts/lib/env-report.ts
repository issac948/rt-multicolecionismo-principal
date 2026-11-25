/**
 * Confere as variáveis de ambiente (nomes e se estão preenchidas). NUNCA imprime valores/segredos.
 * Serve para o dono conferir, antes de publicar, se InfinitePay, SuperFrete, IA, manutenção e banco estão configurados.
 */
import { describeDatabaseUrl } from "./db-target";

export type EnvLevel = "ok" | "falta" | "aviso" | "info";
export interface EnvLine {
  level: EnvLevel;
  text: string;
}

type Env = Record<string, string | undefined>;
const has = (env: Env, name: string) => Boolean(env[name]?.trim());

export function collectEnvReport(env: Env): EnvLine[] {
  const out: EnvLine[] = [];
  const add = (level: EnvLevel, text: string) => out.push({ level, text });

  // Banco
  const db = describeDatabaseUrl(env.DATABASE_URL);
  if (!db.ok) add("falta", `DATABASE_URL: ${db.error}`);
  else {
    add("ok", `DATABASE_URL definida (${db.label}${db.isLocal ? ", banco LOCAL" : ", banco remoto"})`);
    if (!db.isLocal && db.sslmode !== "require") add("aviso", "DATABASE_URL remota sem ?sslmode=require");
    if (!db.isLocal && !db.host.includes("-pooler")) add("aviso", "No site (Netlify) use a conexão com \"-pooler\"; a conexão direta é para rodar migrações");
  }

  // Endereço do site
  const site = env.SITE_URL?.trim() ?? "";
  if (!site) add("falta", "SITE_URL não definida (links, webhook e retorno do pagamento dependem dela)");
  else if (!site.startsWith("https://")) add("aviso", "SITE_URL não começa com https:// (em produção deve ser https://rtmulticolecionismo.com.br)");
  else if (site.endsWith("/")) add("aviso", "SITE_URL termina com \"/\" (tire a barra final)");
  else add("ok", `SITE_URL = ${site}`);

  // Pagamento
  const provider = (env.PAYMENT_PROVIDER?.trim() || "paypal").toLowerCase();
  if (!env.PAYMENT_PROVIDER?.trim()) add("aviso", "PAYMENT_PROVIDER não definida: a loja usa \"paypal\". Para InfinitePay defina PAYMENT_PROVIDER=infinitepay");
  add("info", `Pagamento escolhido: ${provider}`);
  if (provider === "infinitepay") {
    add(has(env, "INFINITEPAY_HANDLE") ? "ok" : "falta", "INFINITEPAY_HANDLE (sua InfiniteTag)");
    const token = env.INFINITEPAY_WEBHOOK_TOKEN?.trim() ?? "";
    add(token.length >= 16 ? "ok" : "falta", token ? (token.length >= 16 ? "INFINITEPAY_WEBHOOK_TOKEN (16+ caracteres)" : "INFINITEPAY_WEBHOOK_TOKEN curto demais (mínimo 16)") : "INFINITEPAY_WEBHOOK_TOKEN");
    if (has(env, "INFINITEPAY_API_BASE")) add("aviso", "INFINITEPAY_API_BASE definida: serve só para testes locais; apague em produção");
  } else if (provider === "paypal") {
    for (const n of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"]) add(has(env, n) ? "ok" : "falta", n);
    if ((env.PAYPAL_ENV ?? "sandbox") !== "live") add("aviso", "PAYPAL_ENV não é \"live\": pagamentos de teste, sem dinheiro de verdade");
  } else if (provider === "mercadopago") {
    for (const n of ["MERCADOPAGO_ACCESS_TOKEN", "MERCADOPAGO_WEBHOOK_SECRET"]) add(has(env, n) ? "ok" : "falta", n);
  } else add("falta", `PAYMENT_PROVIDER desconhecido: ${provider}`);

  // Frete
  if (has(env, "SUPERFRETE_TOKEN")) add("ok", "SUPERFRETE_TOKEN definido (frete pelo CEP só vale se, no painel, a entrega estiver em \"Calculado pelo CEP\")");
  else add("aviso", "SUPERFRETE_TOKEN ausente: o frete usa só o valor fixo configurado no painel");
  if (has(env, "SUPERFRETE_API_BASE")) add("aviso", "SUPERFRETE_API_BASE definida: serve só para testes locais; apague em produção");

  // IA
  const ai = (env.AI_PROVIDER?.trim() || "none").toLowerCase();
  if (ai === "none") add("info", "IA desligada (AI_PROVIDER=none): o assistente e a ajuda de IA do painel não aparecem");
  else {
    add(has(env, "AI_API_KEY") ? "ok" : "falta", `AI_API_KEY (provedor ${ai})`);
    add(has(env, "AI_MODEL") ? "ok" : "aviso", has(env, "AI_MODEL") ? "AI_MODEL definido" : "AI_MODEL em branco (usa o padrão do provedor)");
  }

  // Manutenção e armazenamento
  const cron = env.CRON_SECRET?.trim() ?? "";
  add(cron.length >= 16 ? "ok" : "falta", cron ? (cron.length >= 16 ? "CRON_SECRET (16+ caracteres)" : "CRON_SECRET curto demais (mínimo 16)") : "CRON_SECRET (obrigatório no Netlify: cancela pedidos vencidos e devolve estoque)");
  const driver = env.STORAGE_DRIVER?.trim() || "(automático)";
  add("info", `Armazenamento de fotos: ${driver}`);
  if (driver === "s3") for (const n of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) add(has(env, n) ? "ok" : "falta", n);
  return out;
}

export function formatEnvReport(lines: EnvLine[]): string {
  const tag: Record<EnvLevel, string> = { ok: "[OK]   ", falta: "[FALTA]", aviso: "[AVISO]", info: "[INFO] " };
  const faltas = lines.filter((l) => l.level === "falta").length;
  const avisos = lines.filter((l) => l.level === "aviso").length;
  return [
    "RT Multicolecionismo — conferência das variáveis de ambiente (valores nunca são mostrados)",
    ...lines.map((l) => `${tag[l.level]} ${l.text}`),
    `Resumo: ${faltas} item(ns) faltando, ${avisos} aviso(s). Isto só confere se as variáveis existem: NÃO prova que o pagamento, o frete ou a IA funcionam (isso exige um teste real).`,
  ].join("\n");
}
