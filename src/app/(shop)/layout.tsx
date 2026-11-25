import type { ReactNode } from "react";
import { ShopAssistant } from "@/components/shop/shop-assistant";
import { SiteFooter, WhatsAppButton } from "@/components/shop/site-footer";
import { CampaignBar } from "@/components/shop/campaign-bar";
import { campaignThemeActive } from "@/lib/campaign";
import { SiteHeader } from "@/components/shop/site-header";
import { getAiProvider } from "@/server/ai";
import { getCurrentUser } from "@/server/auth/current-user";
import { resolveCartId } from "@/server/cart-session";
import { getCartItemCount } from "@/server/services/cart";
import { publicCategoryTree } from "@/lib/categories";
import { listCategoriesWithCounts } from "@/server/services/categories";
import { getSettings } from "@/server/services/settings";

export default async function ShopLayout({ children }: { children: ReactNode }) {
  const [settings, categories, user, cartId] = await Promise.all([
    getSettings(),
    listCategoriesWithCounts({ onlyActive: true }),
    getCurrentUser(),
    resolveCartId({ create: false }),
  ]);
  const cartCount = await getCartItemCount(cartId);
  // O assistente só aparece com a chave de IA configurada no servidor E ligado no painel.
  const assistantOn = settings.shopAssistantEnabled && getAiProvider().isConfigured();

  // Tema especial da campanha: só enquanto ela está no ar (pelas datas ou ligada à mão); depois volta ao visual normal sozinho.
  const campaignTheme = campaignThemeActive(settings.campaign);

  return (
    <div className="shop-root" data-campaign-theme={campaignTheme ? "bf" : undefined}>
      <CampaignBar settings={settings} />
      <SiteHeader settings={settings} categories={publicCategoryTree(categories)} cartCount={cartCount} user={user} />
      <main id="conteudo" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter settings={settings} />
      <aside aria-label="Atendimento rápido">
        <WhatsAppButton settings={settings} />
        {assistantOn && <ShopAssistant whatsappNumber={settings.whatsapp} stacked={Boolean(settings.whatsapp)} />}
      </aside>
    </div>
  );
}
