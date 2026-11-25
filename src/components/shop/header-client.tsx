"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, LogIn, Menu, MessageCircle, Package, Search, ShoppingCart, User, X } from "lucide-react";
import { BrandMark } from "@/components/brand";

export type HeaderCategory = { id: string; name: string; slug: string; children: Array<{ id: string; name: string; slug: string }> };

type Props = {
  storeName: string;
  logoSrc: string | null;
  categories: HeaderCategory[];
  cartCount: number;
  /** Primeiro nome de quem está logado (ou null). */
  userName: string | null;
  whatsappHref: string | null;
};

const navLink =
  "inline-block px-3 py-2 text-white no-underline hover:text-signal hover:underline underline-offset-4 decoration-signal aria-[current=page]:text-signal aria-[current=page]:underline";

/**
 * Cabeçalho da loja. No celular: uma barra só (menu, logo, busca, carrinho); o menu abre numa gaveta e a busca
 * numa linha que aparece sob a barra. A partir de 768 px: busca sempre aberta e menu de categorias em linha.
 */
export function HeaderClient({ storeName, logoSrc, categories, cartCount, userName, whatsappHref }: Props) {
  const pathname = usePathname();
  const drawer = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // Ao trocar de página, fecha a gaveta e a busca do celular.
  useEffect(() => {
    drawer.current?.close();
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  const isCurrent = (href: string) => (pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)) ? "page" : undefined);
  const cartLabel = `Carrinho, ${cartCount} ${cartCount === 1 ? "item" : "itens"}`;

  return (
    <header className="on-dark site-header bg-night text-white border-b-[3px] border-signal">
      <div className="container-page flex items-center gap-x-2 py-2 md:gap-x-6 md:py-3">
        <button
          type="button"
          className="icon-btn md:hidden"
          aria-label="Abrir menu"
          aria-haspopup="dialog"
          onClick={() => drawer.current?.showModal()}
        >
          <Menu size={24} aria-hidden />
        </button>

        <Link href="/" className="flex min-w-0 items-center gap-2.5 text-white no-underline mr-auto md:mr-0" aria-label={`${storeName}: página inicial`}>
          <BrandMark size={52} customSrc={logoSrc} className="!h-10 !w-10 md:!h-[52px] md:!w-[52px]" />
          {/* A logo já traz o nome da loja: em telas muito estreitas só ela aparece; o nome em letra de placa entra a partir de 380 px. */}
          <span className="brand-script hidden text-[1rem] leading-[1.05] min-[380px]:inline min-[400px]:text-[1.15rem] md:text-[1.3rem] lg:text-[1.65rem]">{storeName}</span>
        </Link>

        <form action="/buscar" method="get" role="search" className="hidden md:block md:flex-1 md:max-w-xl">
          <label htmlFor="busca-topo" className="sr-only">
            Buscar produtos
          </label>
          <div className="relative">
            <input id="busca-topo" name="q" type="search" placeholder="O que você procura?" className="input !border-transparent !bg-white pr-12" autoComplete="off" maxLength={80} />
            <button type="submit" className="absolute right-0 top-0 grid h-full w-11 place-items-center text-ink" aria-label="Buscar">
              <Search size={20} aria-hidden />
            </button>
          </div>
        </form>

        <nav aria-label="Conta e carrinho" className="flex items-center gap-1 md:gap-2">
          <button
            type="button"
            className="icon-btn md:hidden"
            aria-label={searchOpen ? "Fechar busca" : "Abrir busca"}
            aria-expanded={searchOpen}
            aria-controls="busca-celular"
            onClick={() => setSearchOpen((v) => !v)}
          >
            {searchOpen ? <X size={22} aria-hidden /> : <Search size={22} aria-hidden />}
          </button>
          <Link
            href={userName ? "/minha-conta" : "/login"}
            className="hidden min-h-11 items-center gap-2 rounded px-3 text-white no-underline hover:bg-white/10 md:inline-flex"
            aria-label={userName ? `Minha conta (${userName})` : "Entrar"}
          >
            <User size={20} aria-hidden />
            <span className="hidden lg:inline">{userName ?? "Entrar"}</span>
          </Link>
          <Link href="/carrinho" className="btn btn-primary relative !px-0 w-11 sm:w-auto sm:!px-4 md:!px-3 lg:!px-5">
            <ShoppingCart size={20} aria-hidden />
            <span className="sr-only">{cartLabel}</span>
            <span className="hidden sm:inline md:hidden lg:inline" aria-hidden>
              Carrinho
            </span>
            {/* No celular a quantidade vira uma bolinha sobre o ícone (some se o carrinho está vazio). */}
            <span
              className={`absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-enamel px-1 text-center text-xs font-bold text-white sm:static sm:min-w-6 sm:bg-night sm:text-sm ${cartCount === 0 ? "max-sm:hidden" : ""}`}
              aria-hidden
            >
              {cartCount}
            </span>
          </Link>
        </nav>
      </div>

      {searchOpen && (
        <form action="/buscar" method="get" role="search" id="busca-celular" className="container-page pb-3 md:hidden">
          <label htmlFor="busca-celular-q" className="sr-only">
            Buscar produtos
          </label>
          <div className="relative">
            <input
              ref={searchInput}
              id="busca-celular-q"
              name="q"
              type="search"
              placeholder="O que você procura?"
              className="input !border-transparent !bg-white pr-12"
              autoComplete="off"
              enterKeyHint="search"
              maxLength={80}
            />
            <button type="submit" className="absolute right-0 top-0 grid h-full w-11 place-items-center text-ink" aria-label="Buscar">
              <Search size={20} aria-hidden />
            </button>
          </div>
        </form>
      )}

      <nav aria-label="Categorias" className="hidden border-t border-white/10 bg-night-soft text-white md:block">
        <ul className="container-page flex gap-1 overflow-x-auto py-1 text-[0.95rem] font-semibold whitespace-nowrap">
          <li>
            <Link href="/produtos" className={navLink} aria-current={isCurrent("/produtos")}>
              Todos os produtos
            </Link>
          </li>
          {categories.map((category) => (
            <li key={category.id}>
              <Link href={`/categoria/${category.slug}`} className={navLink} aria-current={isCurrent(`/categoria/${category.slug}`)}>
                {category.name}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/eventos" className={navLink} aria-current={isCurrent("/eventos")}>
              Eventos
            </Link>
          </li>
        </ul>
      </nav>

      <dialog
        ref={drawer}
        className="drawer on-dark"
        aria-label="Menu da loja"
        onClick={(e) => {
          // Clique no fundo escuro (o próprio <dialog>) fecha; clique num link também.
          if (e.target === e.currentTarget || (e.target as HTMLElement).closest("a")) drawer.current?.close();
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/15 px-4 py-3">
          <span className="brand-script text-xl">{storeName}</span>
          <button type="button" className="icon-btn" aria-label="Fechar menu" onClick={() => drawer.current?.close()}>
            <X size={24} aria-hidden />
          </button>
        </div>
        <nav aria-label="Menu principal" className="px-2 py-3">
          <ul className="space-y-0.5">
            <li>
              <Link href="/produtos" className="drawer-link" aria-current={isCurrent("/produtos")}>
                Todos os produtos
              </Link>
            </li>
            {categories.map((category) => (
              <li key={category.id}>
                <Link href={`/categoria/${category.slug}`} className="drawer-link" aria-current={isCurrent(`/categoria/${category.slug}`)}>
                  {category.name}
                </Link>
                {category.children.length > 0 && (
                  <ul className="mb-1 ml-3 border-l border-white/20 pl-2">
                    {category.children.map((child) => (
                      <li key={child.id}>
                        <Link href={`/categoria/${child.slug}`} className="drawer-link !min-h-10 !font-medium !text-white/85" aria-current={isCurrent(`/categoria/${child.slug}`)}>
                          {child.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            <li>
              <Link href="/eventos" className="drawer-link" aria-current={isCurrent("/eventos")}>
                <CalendarDays size={20} aria-hidden /> Eventos
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Conta" className="border-t border-white/15 px-2 py-3">
          <ul className="space-y-0.5">
            <li>
              <Link href={userName ? "/minha-conta" : "/login"} className="drawer-link">
                {userName ? <User size={20} aria-hidden /> : <LogIn size={20} aria-hidden />}
                {userName ? `Minha conta (${userName})` : "Entrar ou criar conta"}
              </Link>
            </li>
            {userName && (
              <li>
                <Link href="/meus-pedidos" className="drawer-link">
                  <Package size={20} aria-hidden /> Meus pedidos
                </Link>
              </li>
            )}
            {whatsappHref && (
              <li>
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="drawer-link">
                  <MessageCircle size={20} aria-hidden /> Falar no WhatsApp
                </a>
              </li>
            )}
          </ul>
        </nav>
      </dialog>
    </header>
  );
}
