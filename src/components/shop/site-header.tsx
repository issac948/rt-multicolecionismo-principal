import Link from "next/link";
import { Search, ShoppingCart, User } from "lucide-react";
import { BrandMark } from "@/components/brand";
import type { SessionUser } from "@/server/auth/session";
import type { Category } from "@/server/db/schema";
import { fileUrl } from "@/server/storage";
import type { StoreSettings } from "@/server/services/settings";

/** Cabeçalho preto com a logo oficial, busca, conta e carrinho; abaixo, o menu de categorias. */
export function SiteHeader({
  settings,
  categories,
  cartCount,
  user,
}: {
  settings: StoreSettings;
  categories: Category[];
  cartCount: number;
  user: SessionUser | null;
}) {
  const logo = fileUrl(settings.logoKey);

  return (
    <header className="on-dark bg-night text-white border-b-[3px] border-signal">
      <div className="container-page flex flex-wrap items-center gap-x-6 gap-y-3 py-3">
        <Link href="/" className="flex items-center gap-2.5 text-white no-underline order-1 mr-auto md:mr-0 min-w-0" aria-label={`${settings.storeName}: página inicial`}>
          <BrandMark size={52} customSrc={logo} />
          <span className="brand-script text-[1.35rem] leading-[1.05] sm:text-[1.65rem]">{settings.storeName}</span>
        </Link>

        <form action="/buscar" method="get" role="search" className="order-3 md:order-2 w-full md:w-auto md:flex-1 md:max-w-xl">
          <label htmlFor="busca-topo" className="sr-only">
            Buscar produtos
          </label>
          <div className="relative">
            <input
              id="busca-topo"
              name="q"
              type="search"
              placeholder="O que você procura?"
              className="input !border-transparent !bg-white pr-12"
              autoComplete="off"
              maxLength={80}
            />
            <button type="submit" className="absolute right-0 top-0 h-full w-11 grid place-items-center text-ink" aria-label="Buscar">
              <Search size={20} aria-hidden />
            </button>
          </div>
        </form>

        <nav aria-label="Conta e carrinho" className="order-2 md:order-3 ml-auto md:ml-0 flex items-center gap-2">
          <Link
            href={user ? "/minha-conta" : "/login"}
            className="inline-flex items-center gap-2 min-h-11 px-3 rounded text-white no-underline hover:bg-white/10"
          >
            <User size={20} aria-hidden />
            <span className="hidden sm:inline">{user ? user.name.split(" ")[0] : "Entrar"}</span>
            {user && <span className="sr-only">: minha conta</span>}
          </Link>
          <Link href="/carrinho" className="btn btn-primary" aria-label={`Carrinho, ${cartCount} ${cartCount === 1 ? "item" : "itens"}`}>
            <ShoppingCart size={20} aria-hidden />
            <span className="hidden sm:inline">Carrinho</span>
            <span className="min-w-6 rounded-full bg-night px-1.5 text-center text-sm text-white" aria-hidden>
              {cartCount}
            </span>
          </Link>
        </nav>
      </div>

      <nav aria-label="Categorias" className="bg-night-soft text-white border-t border-white/10">
        <ul className="container-page flex gap-1 overflow-x-auto py-1 text-[0.95rem] font-semibold whitespace-nowrap">
          <li>
            <Link href="/produtos" className="inline-block px-3 py-2 text-white no-underline hover:text-signal hover:underline underline-offset-4 decoration-signal">
              Todos os produtos
            </Link>
          </li>
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                href={`/categoria/${category.slug}`}
                className="inline-block px-3 py-2 text-white no-underline hover:text-signal hover:underline underline-offset-4 decoration-signal"
              >
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
