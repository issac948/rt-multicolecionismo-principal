import type { ReactNode } from "react";
import { ShopAssistant } from "@/components/shop/shop-assistant";
import { SiteFooter, WhatsAppButton } from "@/components/shop/site-footer";
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

  return (
    <>
      <SiteHeader settings={settings} categories={publicCategoryTree(categories)} cartCount={cartCount} user={user} />
      <main id="conteudo" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter settings={settings} />
      <WhatsAppButton settings={settings} />
      {assistantOn && <ShopAssistant whatsappNumber={settings.whatsapp} stacked={Boolean(settings.whatsapp)} />}
    </>
  );
}
