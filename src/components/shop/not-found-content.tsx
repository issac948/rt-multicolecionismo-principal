import Link from "next/link";
import { BrandMark } from "@/components/brand";

export function NotFoundContent() {
  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-xl text-center">
        <BrandMark size={96} className="mx-auto mb-5" />
        <p className="text-6xl font-extrabold [font-stretch:76%]" aria-hidden>
          404
        </p>
        <h1 className="mt-2">Página não encontrada</h1>
        <p className="mt-3 text-ink-soft">O endereço pode ter mudado ou o produto não está mais à venda.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn btn-primary">
            Ir para o início
          </Link>
          <Link href="/produtos" className="btn btn-outline">
            Ver os produtos
          </Link>
        </div>
      </div>
    </div>
  );
}
