import type { PaymentStatus } from "@/lib/constants";

/**
 * Contrato de um gateway de pagamento. O restante do sistema (pedidos, webhook,
 * painel) só conhece esta interface; para trocar de gateway (PayPal, Mercado Pago ou outro)
 * basta criar outra classe que a implemente em `payments/index.ts`.
 */

export type CheckoutItem = { title: string; quantity: number; unitPriceCents: number };

export type CreateCheckoutInput = {
  orderId: string;
  orderNumber: number;
  items: CheckoutItem[];
  /** Frete (entra como um item extra "Frete" quando maior que zero). */
  shippingCents: number;
  totalCents: number;
  payer: { name: string; email: string; phone: string | null };
  /** Depois deste instante o link de pagamento deixa de funcionar. */
  expiresAt: Date;
  /** Endereço absoluto da loja (https em produção). */
  siteUrl: string;
  methods: { pix: boolean; card: boolean; boleto: boolean; maxInstallments: number };
};

export type CheckoutSession = {
  /** ID da preferência/sessão no provedor. */
  ref: string;
  /** Endereço para onde o cliente é enviado para pagar. */
  url: string;
};

/** Estado de um pagamento, já traduzido para os status internos da loja. */
export type ProviderPayment = {
  provider: string;
  providerPaymentId: string;
  /** ID do pedido (o external_reference que enviamos ao criar o checkout). */
  orderId: string | null;
  status: PaymentStatus;
  rawStatus: string;
  statusDetail: string | null;
  method: string | null;
  amountCents: number;
  refundedCents: number;
};

export type WebhookVerification =
  | {
      valid: true;
      eventType: string;
      paymentId: string | null;
      /** O provedor só avisou que o cliente aprovou: a loja precisa pedir a cobrança (captura) antes de consultar. */
      capture?: boolean;
    }
  | { valid: false; reason: string; eventType?: string | null; paymentId?: string | null };

export interface PaymentProvider {
  readonly id: string;
  /** Nome para mostrar ao cliente e ao administrador. */
  readonly label: string;
  /** Caminho (dentro do site) que o provedor chama quando um pagamento muda de estado. */
  readonly webhookPath: string;
  /** false enquanto as credenciais não foram preenchidas (a loja então não aceita pedidos). */
  isConfigured(): boolean;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
  /** Consulta o estado REAL do pagamento direto na API do provedor. */
  getPayment(providerPaymentId: string): Promise<ProviderPayment>;
  /** Confere a assinatura do webhook. Não confia no conteúdo do corpo. */
  verifyWebhook(request: { headers: Headers; url: URL; body?: string }): WebhookVerification | Promise<WebhookVerification>;
  /**
   * Só para provedores em que o cliente "aprova" e a loja então COBRA (PayPal): pede a cobrança do que o cliente aprovou.
   * Não decide nada sozinho: depois disso o estado é sempre consultado com `getPayment`.
   */
  capturePayment?(providerPaymentId: string): Promise<void>;
  /** Se o link de pagamento já criado ainda serve. Sem este método, o link guardado é sempre reaproveitado. */
  canReuseCheckout?(providerPaymentId: string): Promise<boolean>;
  /**
   * Provedores sem reembolso por API (InfinitePay): o dono devolve o dinheiro pelo app do provedor e o painel só
   * registra o reembolso (pedido "Reembolsado" e estoque devolvido). `refund` não chama nada.
   */
  readonly manualRefund?: boolean;
  /**
   * Provedores em que o cliente volta à loja com dados do pagamento na URL (InfinitePay): monta a CONSULTA à API a partir deles.
   * O que vem na URL nunca prova nada; só serve de pergunta, e a resposta da API é quem vale.
   */
  getPaymentOnReturn?(orderRef: string, query: URLSearchParams): Promise<ProviderPayment>;
  /** Reembolso total do pagamento (ou parcial, se `amountCents` for informado). */
  refund(providerPaymentId: string, amountCents?: number): Promise<void>;
}
