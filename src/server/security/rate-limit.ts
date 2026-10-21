/**
 * Limitador de tentativas em memória (janela fixa).
 *
 * Adequado para uma única instância da loja (um contêiner/VPS), que é o caso
 * previsto no projeto. Se um dia rodar em várias instâncias, troque o `buckets`
 * por Redis mantendo a mesma função `checkRateLimit`.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  current.count += 1;
  if (current.count > limit) {
    return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  return { ok: true, remaining: limit - current.count, retryAfterSeconds: 0 };
}

/** Zera o contador (ex.: depois de um login bem-sucedido). */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

export function clearAllRateLimits(): void {
  buckets.clear();
}

/**
 * IP do cliente a partir dos cabeçalhos. Só confia em X-Forwarded-For quando
 * TRUST_PROXY=true (proxy reverso confiável); caso contrário o cabeçalho poderia
 * ser forjado para escapar do limite.
 */
export function clientIpFromHeaders(headers: Headers, trustProxy: boolean): string | null {
  if (!trustProxy) return null;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return headers.get("x-real-ip")?.trim().slice(0, 64) || null;
}
