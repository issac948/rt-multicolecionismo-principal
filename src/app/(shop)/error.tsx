"use client";

import Link from "next/link";

/** Erro inesperado numa página da loja. Os detalhes técnicos ficam só no log do servidor. */
export default function ShopError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-xl text-center">
        <h1>Algo deu errado</h1>
        <p className="mt-3 text-ink-soft">Não foi possível carregar esta página agora. Tente de novo em instantes.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            Tentar novamente
          </button>
          <Link href="/" className="btn btn-outline">
            Ir para o início
          </Link>
        </div>
      </div>
    </div>
  );
}
