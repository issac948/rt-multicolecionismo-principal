import type { Metadata } from "next";
import { after } from "next/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";
import { logoutAction } from "@/server/actions/auth";
import { requireAdminPage } from "@/server/auth/current-user";
import { BrandMark } from "@/components/brand";
import { runMaintenanceIfDue } from "@/server/services/maintenance";
import { getSettings } from "@/server/services/settings";
import { fileUrl } from "@/server/storage";

export const metadata: Metadata = {
  title: { default: "Painel", template: "%s | Painel" },
  robots: { index: false, follow: false },
};

/**
 * Moldura do painel. A checagem de ADMIN também é repetida em cada página:
 * o Next.js não executa o layout de novo a cada navegação interna, então só o layout não basta.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdminPage();
  const settings = await getSettings();
  // Rede de segurança: quando o dono abre o painel (nunca em visitas de clientes), a manutenção roda depois da página responder,
  // no máximo a cada 10 minutos. O normal é o agendador do Netlify (netlify/functions/manutencao.mts) cuidar disso.
  if (process.env.NODE_ENV !== "test" && process.env.NEXT_PHASE !== "phase-production-build") after(() => runMaintenanceIfDue());

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="on-dark bg-night text-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto border-b-[3px] border-signal lg:border-b-0 lg:border-r-[3px]">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 lg:block">
          <div className="flex items-center gap-3">
            <BrandMark size={44} customSrc={fileUrl(settings.logoKey)} />
            <div>
              <p className="brand-script text-xl leading-none">{settings.storeName}</p>
              <p className="mt-1 text-sm text-white/70">Painel da loja</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm lg:mt-4">
            <Link href="/" target="_blank" className="inline-flex items-center gap-1 text-white">
              Ver a loja <ExternalLink size={14} aria-hidden />
            </Link>
          </div>
        </div>

        <div className="px-3 pb-3 lg:pb-6">
          <AdminNav />
        </div>

        <div className="hidden border-t border-white/15 p-4 text-sm lg:block">
          <p className="truncate text-white/80" title={admin.email}>
            {admin.name}
          </p>
          <form action={logoutAction} className="mt-2">
            <button type="submit" className="btn-link !text-white">
              Sair
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        <main id="conteudo" className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
        <div className="border-t border-line p-4 text-sm lg:hidden">
          <form action={logoutAction}>
            <button type="submit" className="btn-link">
              Sair ({admin.name})
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
