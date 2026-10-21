import type { MetadataRoute } from "next";
import { getEnv } from "@/server/env";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getEnv().siteUrl;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Áreas privadas ou sem valor para busca: painel, conta, carrinho, checkout, APIs e resultados de busca.
        disallow: ["/admin", "/api/", "/carrinho", "/checkout", "/minha-conta", "/meus-pedidos", "/pedido/", "/login", "/cadastro", "/buscar"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
