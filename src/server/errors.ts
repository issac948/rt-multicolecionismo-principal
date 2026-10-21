/**
 * Erros de domínio. Mensagens são escritas em português e seguras para mostrar
 * ao usuário. Detalhes técnicos devem ir só para o log do servidor.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = "APP_ERROR",
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  /**
   * Sem mensagem explícita, usa o primeiro erro de campo: assim qualquer tela que mostre
   * só `error.message` continua informando o problema real.
   */
  constructor(
    public readonly fieldErrors: Record<string, string>,
    message?: string,
  ) {
    super(message ?? Object.values(fieldErrors)[0] ?? "Confira os campos destacados.", "VALIDATION", 422);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Não encontrado.") {
    super(message, "NOT_FOUND", 404);
  }
}

/** 401 = não autenticado, 403 = autenticado mas sem permissão. */
export class AuthError extends AppError {
  constructor(status: 401 | 403 = 401, message?: string) {
    super(
      message ?? (status === 401 ? "Faça login para continuar." : "Você não tem permissão para fazer isso."),
      status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
      status,
    );
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
  }
}

/** Regra de negócio violada (ex.: transição de status inválida). */
export class BusinessRuleError extends AppError {
  constructor(message: string) {
    super(message, "BUSINESS_RULE", 409);
  }
}

export class InsufficientStockError extends AppError {
  constructor(
    public readonly productId: string,
    public readonly productName: string,
    public readonly available: number,
  ) {
    super(
      available > 0
        ? `Só temos ${available} unidade(s) de "${productName}" em estoque.`
        : `"${productName}" está sem estoque no momento.`,
      "INSUFFICIENT_STOCK",
      409,
    );
  }
}

export class RateLimitError extends AppError {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Muitas tentativas. Tente novamente em ${Math.ceil(retryAfterSeconds / 60) || 1} minuto(s).`, "RATE_LIMITED", 429);
  }
}

/** Erro de configuração/serviço externo (ex.: gateway de pagamento fora do ar). */
export class ExternalServiceError extends AppError {
  constructor(message: string) {
    super(message, "EXTERNAL_SERVICE", 502);
  }
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } } | null;
  const code = e?.code ?? e?.cause?.code;
  const name = e?.constraint ?? e?.cause?.constraint;
  return code === "23505" && (constraint === undefined || name === constraint);
}
