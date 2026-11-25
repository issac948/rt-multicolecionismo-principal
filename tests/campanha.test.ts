import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { campaignPhase, campaignTarget, campaignThemeActive, isSafeCampaignLink } from "@/lib/campaign";
import { defaultSettings, storeSettingsSchema } from "@/server/services/settings";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
import { CampaignBar } from "@/components/shop/campaign-bar";

const base = { enabled: true, startsAt: "2026-11-27T03:00:00.000Z", endsAt: "2026-12-01T02:59:00.000Z", teaserHours: 72 };
const at = (iso: string) => new Date(iso);

describe("fase da campanha", () => {
  it("desligada nunca aparece", () => {
    expect(campaignPhase({ ...base, enabled: false }, at("2026-11-28T12:00:00Z"))).toBe("off");
  });
  it("antes do início: contagem só dentro da janela de aviso", () => {
    expect(campaignPhase(base, at("2026-11-23T00:00:00Z"))).toBe("off"); // faltam mais de 72 h
    expect(campaignPhase(base, at("2026-11-25T00:00:00Z"))).toBe("teaser");
    expect(campaignPhase({ ...base, teaserHours: 0 }, at("2026-11-26T23:00:00Z"))).toBe("off");
  });
  it("durante vale e no fim some sozinha", () => {
    expect(campaignPhase(base, at("2026-11-27T03:00:00Z"))).toBe("live");
    expect(campaignPhase(base, at("2026-12-01T02:58:59Z"))).toBe("live");
    expect(campaignPhase(base, at("2026-12-01T02:59:00Z"))).toBe("off");
  });
  it("sem datas: vale até ser desligada, sem contagem", () => {
    const open = { enabled: true, startsAt: null, endsAt: null, teaserHours: 72 };
    expect(campaignPhase(open, at("2026-11-28T00:00:00Z"))).toBe("live");
    expect(campaignTarget(open, "live")).toBeNull();
  });
  it("alvo da contagem: início no aviso, fim durante", () => {
    expect(campaignTarget(base, "teaser")).toBe(base.startsAt);
    expect(campaignTarget(base, "live")).toBe(base.endsAt);
    expect(campaignTarget(base, "off")).toBeNull();
  });
});

describe("configuração", () => {
  it("vem desligada por padrão", () => {
    const c = defaultSettings().campaign;
    expect(c.enabled).toBe(false);
    expect(c.name).toBe("Black Friday");
    expect(c.ctaHref).toBe("/produtos?promocao=1");
  });
  it("recusa fim antes do início, data inválida e link perigoso", () => {
    const parse = (campaign: object) => storeSettingsSchema.safeParse({ campaign });
    expect(parse({ startsAt: "2026-11-30T00:00:00Z", endsAt: "2026-11-27T00:00:00Z" }).success).toBe(false);
    expect(parse({ startsAt: "ontem" }).success).toBe(false);
    expect(parse({ ctaHref: "javascript:alert(1)" }).success).toBe(false);
    expect(parse({ ctaHref: "//outro-site.com" }).success).toBe(false);
    expect(parse({ ctaHref: "https://exemplo.com.br/oferta" }).success).toBe(true);
    expect(parse({ ctaHref: "" }).success).toBe(true);
  });
  it("links seguros", () => {
    expect(isSafeCampaignLink("/produtos?promocao=1")).toBe(true);
    expect(isSafeCampaignLink("http://inseguro.com")).toBe(false);
  });
});

describe("faixa na loja", () => {
  const settings = (campaign: object) => storeSettingsSchema.parse({ campaign });
  const html = (s: ReturnType<typeof settings>) => renderToStaticMarkup(createElement(CampaignBar, { settings: s }));
  const soon = new Date(Date.now() + 3_600_000).toISOString();
  const past = new Date(Date.now() - 3_600_000).toISOString();

  it("não renderiza nada desligada ou já encerrada", () => {
    expect(html(settings({}))).toBe("");
    expect(html(settings({ enabled: true, endsAt: past }))).toBe("");
  });
  it("durante a campanha mostra nome, texto e o botão, SEM contagem regressiva", () => {
    const out = html(settings({ enabled: true, headline: "Ofertas em miniaturas", endsAt: soon }));
    expect(out).toContain("Black Friday");
    expect(out).toContain("Ofertas em miniaturas");
    expect(out).not.toMatch(/termina em|começa em|<time/);
    expect(out).toContain('href="/produtos?promocao=1"');
  });
  it("antes de começar (janela de aviso) mostra o texto e a data, sem contagem", () => {
    const out = html(settings({ enabled: true, startsAt: soon, teaser: "Vem aí", teaserHours: 24 }));
    expect(out).toContain("Vem aí");
    expect(out).not.toContain("começa em");
    expect(out).toContain("Vem aí");
  });
});

describe("controle manual e tema", () => {
  const at = (iso: string) => new Date(iso);
  it("'ligado agora' vale mesmo fora das datas e com a campanha marcada como desligada", () => {
    expect(campaignPhase({ ...base, enabled: false, mode: "on" }, at("2026-01-10T12:00:00Z"))).toBe("live");
  });
  it("'desligado' ignora as datas", () => {
    expect(campaignPhase({ ...base, mode: "off" }, at("2026-11-28T12:00:00Z"))).toBe("off");
  });
  it("'automático' segue as datas: liga no início e volta ao normal sozinho depois do fim", () => {
    const c = { ...base, mode: "auto" as const };
    expect(campaignThemeActive(c, at("2026-11-26T12:00:00Z"))).toBe(false);
    expect(campaignThemeActive(c, at("2026-11-28T12:00:00Z"))).toBe(true);
    expect(campaignThemeActive(c, at("2026-12-02T12:00:00Z"))).toBe(false);
  });
  it("o tema não liga na fase 'em breve'", () => {
    expect(campaignPhase(base, at("2026-11-25T12:00:00Z"))).toBe("teaser");
    expect(campaignThemeActive(base, at("2026-11-25T12:00:00Z"))).toBe(false);
  });
});
