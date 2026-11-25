import { describe, expect, it } from "vitest";
import { collectEnvReport, formatEnvReport } from "../scripts/lib/env-report";

const base = { DATABASE_URL: "postgres://u:SenhaFalsa-Longa-123@ep-abc-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require", SITE_URL: "https://rtmulticolecionismo.com.br", CRON_SECRET: "a".repeat(32) };
const text = (env: Record<string, string>) => formatEnvReport(collectEnvReport(env));

describe("env:check", () => {
  it("InfinitePay completo: sem itens faltando e sem vazar valores", () => {
    const out = text({ ...base, PAYMENT_PROVIDER: "infinitepay", INFINITEPAY_HANDLE: "minha_loja", INFINITEPAY_WEBHOOK_TOKEN: "t".repeat(24), SUPERFRETE_TOKEN: "tok-superfrete-123", AI_PROVIDER: "anthropic", AI_API_KEY: "chave-ia-123", AI_MODEL: "claude-sonnet-5-5" });
    expect(out).toContain("0 item(ns) faltando");
    for (const secret of ["SenhaFalsa-Longa-123", "minha_loja", "tok-superfrete-123", "chave-ia-123", "t".repeat(24)]) expect(out).not.toContain(secret);
  });
  it("aponta o que falta no InfinitePay e que o padrão sem PAYMENT_PROVIDER é paypal", () => {
    const out = text({ ...base, PAYMENT_PROVIDER: "infinitepay" });
    expect(out).toContain("[FALTA] INFINITEPAY_HANDLE");
    expect(out).toContain("[FALTA] INFINITEPAY_WEBHOOK_TOKEN");
    expect(text(base)).toContain("usa \"paypal\"");
  });
  it("avisa de SITE_URL local/sem https, token curto e banco sem pooler", () => {
    const out = text({ DATABASE_URL: "postgres://u:p@ep-abc.neon.tech/db", SITE_URL: "http://localhost:3000", CRON_SECRET: "curto", PAYMENT_PROVIDER: "infinitepay", INFINITEPAY_HANDLE: "x", INFINITEPAY_WEBHOOK_TOKEN: "curto" });
    expect(out).toContain("não começa com https://");
    expect(out).toContain("CRON_SECRET curto demais");
    expect(out).toContain("INFINITEPAY_WEBHOOK_TOKEN curto demais");
    expect(out).toContain("-pooler");
  });
  it("IA ligada sem chave é falta; desligada é só informação", () => {
    expect(text({ ...base, AI_PROVIDER: "anthropic" })).toContain("[FALTA] AI_API_KEY");
    expect(text(base)).toContain("IA desligada");
  });
});
