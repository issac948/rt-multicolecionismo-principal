import { getEnv } from "../env";

/**
 * Proteção CSRF para rotas de API que usam o cookie de sessão.
 * (Server Actions já são protegidas pelo próprio Next.js, que compara Origin e Host.)
 *
 * Navegadores sempre enviam o cabeçalho Origin em requisições POST; se ele não
 * existir ou apontar para outro site, a requisição é recusada.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  const allowed = new Set<string>();
  const requestHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (requestHost) allowed.add(requestHost.split(",")[0].trim());
  try {
    allowed.add(new URL(getEnv().siteUrl).host);
  } catch {
    // SITE_URL inválida: só vale o Host da própria requisição.
  }
  return allowed.has(originHost);
}
