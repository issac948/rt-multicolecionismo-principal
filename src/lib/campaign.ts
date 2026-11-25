/** Regras puras da campanha (Black Friday etc.). Só datas reais: nada de contagem inventada. */
export interface CampaignConfig {
  enabled: boolean;
  /** Controle manual: "auto" segue as datas; "on" liga agora; "off" desliga. Ausente = "auto". */
  mode?: "auto" | "on" | "off";
  startsAt: string | null;
  endsAt: string | null;
  /** Quantas horas antes do início a faixa já aparece com a contagem (0 = só a partir do início). */
  teaserHours: number;
}

export type CampaignPhase = "off" | "teaser" | "live";

/** O tema especial (cores e faixa da campanha) só vale com a campanha no ar, nunca na fase "em breve". */
export function campaignThemeActive(c: CampaignConfig, now: Date = new Date()): boolean {
  return campaignPhase(c, now) === "live";
}

export function campaignPhase(c: CampaignConfig, now: Date = new Date()): CampaignPhase {
  if (c.mode === "on") return "live";
  if (c.mode === "off" || !c.enabled) return "off";
  const start = c.startsAt ? new Date(c.startsAt).getTime() : null;
  const end = c.endsAt ? new Date(c.endsAt).getTime() : null;
  const t = now.getTime();
  if (end !== null && t >= end) return "off";
  if (start !== null && t < start) return start - t <= c.teaserHours * 3_600_000 ? "teaser" : "off";
  return "live";
}

/** Data-alvo da contagem: o início (teaser) ou o fim (live); null = sem contagem. */
export function campaignTarget(c: CampaignConfig, phase: CampaignPhase): string | null {
  if (phase === "teaser") return c.startsAt;
  if (phase === "live") return c.endsAt;
  return null;
}

/** Só aceita caminho do próprio site ("/produtos?...") ou https. */
export function isSafeCampaignLink(v: string): boolean {
  return v === "" || (v.startsWith("/") && !v.startsWith("//")) || /^https:\/\/[^\s]+$/.test(v);
}
