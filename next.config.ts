import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Se a loja roda atrás de um proxy que não repassa o Host original,
// o host público precisa estar liberado para as Server Actions (proteção CSRF do Next).
const allowedOrigins: string[] = [];
if (process.env.SITE_URL) {
  try {
    allowedOrigins.push(new URL(process.env.SITE_URL).host);
  } catch {
    // SITE_URL inválida é reportada pela validação de ambiente em tempo de execução.
  }
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pg", "sharp"],
  experimental: {
    serverActions: {
      allowedOrigins,
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
