import { whatsappLink } from "@/lib/text";
import type { SessionUser } from "@/server/auth/session";
import type { Category } from "@/server/db/schema";
import { fileUrl } from "@/server/storage";
import type { StoreSettings } from "@/server/services/settings";
import { HeaderClient, type HeaderCategory } from "./header-client";

type CategoryNode = Category & { children?: Category[] };

/** Cabeçalho preto com a logo oficial, busca, conta e carrinho; o menu de categorias fica abaixo (desktop) ou na gaveta (celular). */
export function SiteHeader({
  settings,
  categories,
  cartCount,
  user,
}: {
  settings: StoreSettings;
  categories: CategoryNode[];
  cartCount: number;
  user: SessionUser | null;
}) {
  // Só dados simples vão para o componente do navegador (nada de objetos do banco).
  const nodes: HeaderCategory[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    children: (c.children ?? []).map((ch) => ({ id: ch.id, name: ch.name, slug: ch.slug })),
  }));

  return (
    <HeaderClient
      storeName={settings.storeName}
      logoSrc={fileUrl(settings.logoKey)}
      categories={nodes}
      cartCount={cartCount}
      userName={user ? user.name.split(" ")[0] : null}
      whatsappHref={whatsappLink(settings.whatsapp, "Olá! Vim pelo site e gostaria de ajuda.")}
    />
  );
}
