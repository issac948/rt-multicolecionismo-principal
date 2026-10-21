import type { UserRole } from "@/lib/constants";
import { AuthError } from "../errors";
import type { SessionUser } from "./session";

/**
 * Regra única de permissão, sem depender do Next.js (por isso é testável).
 *  - sem usuário           -> 401
 *  - usuário sem o papel   -> 403
 * ADMIN pode tudo que CLIENTE pode; CLIENTE nunca acessa o que é de ADMIN.
 */
export function assertRole(user: SessionUser | null, role: UserRole): SessionUser {
  if (!user) throw new AuthError(401);
  if (role === "ADMIN" && user.role !== "ADMIN") throw new AuthError(403);
  return user;
}

/** Só aceita caminhos internos ("/checkout"), nunca URLs externas (evita open redirect). */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\r\n]/.test(next)) {
    return fallback;
  }
  return next;
}
