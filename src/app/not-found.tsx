import type { Metadata } from "next";
import { NotFoundContent } from "@/components/shop/not-found-content";

export const metadata: Metadata = { title: "Página não encontrada", robots: { index: false, follow: false } };

/** 404 geral (endereços que não existem e áreas restritas). Sem cabeçalho da loja de propósito. */
export default function NotFound() {
  return (
    <main id="conteudo">
      <NotFoundContent />
    </main>
  );
}
