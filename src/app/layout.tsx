import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getEnv } from "@/server/env";
import { getSettings } from "@/server/services/settings";
import "./globals.css";

// Todas as páginas leem o banco (produtos, estoque, configurações): nada é gerado no build.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080808",
};

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const description = settings.description || settings.tagline || `Loja virtual ${settings.storeName}`;
  return {
    metadataBase: new URL(getEnv().siteUrl),
    title: { default: settings.tagline ? `${settings.storeName} | ${settings.tagline}` : settings.storeName, template: `%s | ${settings.storeName}` },
    description,
    openGraph: { siteName: settings.storeName, locale: "pt_BR", type: "website", description },
    alternates: { canonical: "/" },
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#conteudo">
          Ir para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
