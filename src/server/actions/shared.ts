import { headers } from "next/headers";
import { AppError, ValidationError } from "../errors";
import { getEnv } from "../env";
import { clientIpFromHeaders } from "../security/rate-limit";

/** Estado devolvido por todas as ações de formulário. */
export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** Texto extra devolvido pela ação (ex.: o link de nova senha, mostrado uma única vez). */
  link?: string;
};

/** redirect() e notFound() funcionam lançando um erro especial: ele NUNCA pode ser engolido. */
export function isNextControlError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

/** Converte qualquer erro em algo seguro para mostrar ao usuário. */
export function failure(error: unknown): FormState {
  if (isNextControlError(error)) throw error;
  if (error instanceof ValidationError) {
    return { errors: error.fieldErrors, message: error.message };
  }
  if (error instanceof AppError) return { message: error.message };
  // Detalhes técnicos só no log do servidor.
  console.error("[ação] erro inesperado:", error);
  return { message: "Algo deu errado. Tente novamente em instantes." };
}

export async function requestIp(): Promise<string | null> {
  return clientIpFromHeaders(await headers(), getEnv().trustProxy);
}

export async function requestUserAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}
