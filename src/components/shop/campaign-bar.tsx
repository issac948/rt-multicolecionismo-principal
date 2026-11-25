import Link from "next/link";
import { campaignPhase } from "@/lib/campaign";
import { formatBr } from "@/lib/datetime-br";
import type { StoreSettings } from "@/server/services/settings";

/** Faixa de campanha no topo. Sem contador: só texto e datas reais. Some sozinha depois do fim. */
export function CampaignBar({ settings }: { settings: StoreSettings }) {
  const c = settings.campaign;
  const phase = campaignPhase(c);
  if (phase === "off") return null;
  const text =
    phase === "teaser"
      ? `${c.teaser || `${c.name} começa em breve`}${c.startsAt ? ` · ${formatBr(new Date(c.startsAt))}` : ""}`
      : c.headline || "Ofertas por tempo limitado";

  return (
    <section className="campaign-bar" data-campaign={phase} aria-label={`Campanha ${c.name}`}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
        <strong className="campaign-bar__name">{c.name}</strong>
        <span>{text}</span>
        {c.ctaHref && (
          <Link href={c.ctaHref} className="campaign-bar__cta">
            {c.ctaLabel || "Ver ofertas"}
          </Link>
        )}
      </div>
    </section>
  );
}
