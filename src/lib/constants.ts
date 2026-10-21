/**
 * Constantes compartilhadas entre servidor e navegador.
 * Não importe nada de servidor aqui (banco, fs, crypto...).
 */

export const USER_ROLES = ["CLIENTE", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ORDER_STATUSES = [
  "PENDENTE",
  "PAGAMENTO_PENDENTE",
  "PAGO",
  "PROCESSANDO",
  "ENVIADO",
  "ENTREGUE",
  "CANCELADO",
  "REEMBOLSADO",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["PENDENTE", "APROVADO", "RECUSADO", "CANCELADO", "REEMBOLSADO"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const STOCK_MOVEMENT_TYPES = ["CADASTRO", "ENTRADA", "AJUSTE", "VENDA", "RESTAURACAO"] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDENTE: "Pendente",
  PAGAMENTO_PENDENTE: "Aguardando pagamento",
  PAGO: "Pago",
  PROCESSANDO: "Em separação",
  ENVIADO: "Enviado",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
  REEMBOLSADO: "Reembolsado",
};

export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  PENDENTE: "neutral",
  PAGAMENTO_PENDENTE: "warning",
  PAGO: "success",
  PROCESSANDO: "info",
  ENVIADO: "info",
  ENTREGUE: "success",
  CANCELADO: "danger",
  REEMBOLSADO: "neutral",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDENTE: "Pendente",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
  CANCELADO: "Cancelado",
  REEMBOLSADO: "Reembolsado",
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, Tone> = {
  PENDENTE: "warning",
  APROVADO: "success",
  RECUSADO: "danger",
  CANCELADO: "danger",
  REEMBOLSADO: "neutral",
};

export const STOCK_MOVEMENT_LABEL: Record<StockMovementType, string> = {
  CADASTRO: "Estoque inicial",
  ENTRADA: "Entrada",
  AJUSTE: "Ajuste",
  VENDA: "Venda",
  RESTAURACAO: "Devolução ao estoque",
};

/** Status em que o pedido conta como venda concluída (entra no faturamento). */
export const PAID_ORDER_STATUSES: readonly OrderStatus[] = ["PAGO", "PROCESSANDO", "ENVIADO", "ENTREGUE"];

/** Status em que o pedido ainda está esperando o pagamento (estoque reservado). */
export const AWAITING_PAYMENT_STATUSES: readonly OrderStatus[] = ["PENDENTE", "PAGAMENTO_PENDENTE"];

export const BRAZIL_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const MAX_CART_LINE_QUANTITY = 99;
export const MAX_PRICE_CENTS = 100_000_000; // R$ 1.000.000,00


/**
 * Tipo de uma categoria. Decide quais campos o cadastro do produto mostra:
 * CARROS = miniaturas de carros (marca, modelo, escala, série, ano...); COLECIONAVEL = bonecos, figuras e outros colecionáveis;
 * OUTROS = demais produtos (só os campos básicos).
 */
export const CATEGORY_KINDS = ["CARROS", "COLECIONAVEL", "OUTROS"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const CATEGORY_KIND_LABEL: Record<CategoryKind, string> = {
  CARROS: "Miniaturas de carros e outros veículos",
  COLECIONAVEL: "Bonecos, figuras e outros colecionáveis",
  OUTROS: "Acessórios para a coleção (expositores, protetores...)",
};

/** Condição de um item colecionável (opcional: produtos de outros tipos não têm condição). */
export const PRODUCT_CONDITIONS = ["LACRADO", "SOLTO"] as const;
export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];

export const PRODUCT_CONDITION_LABEL: Record<ProductCondition, string> = {
  LACRADO: "Lacrado",
  SOLTO: "Solto",
};

/** Marcas de miniaturas mais comuns: aparecem como sugestão no cadastro (o administrador pode digitar qualquer outra). */
export const SUGGESTED_BRANDS = [
  "Hot Wheels",
  "Mini GT",
  "Matchbox",
  "Majorette",
  "Tomica",
  "Greenlight",
  "Maisto",
  "Bburago",
  "Johnny Lightning",
  "Auto World",
  "Kyosho",
  "Tarmac Works",
  "Inno64",
  "Hobby Japan",
] as const;

/** Escalas mais comuns de miniaturas. */
export const SUGGESTED_SCALES = ["1:64", "1:43", "1:32", "1:24", "1:18", "1:12", "1:87"] as const;
