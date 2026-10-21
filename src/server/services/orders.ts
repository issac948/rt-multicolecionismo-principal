import { and, asc, desc, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { AWAITING_PAYMENT_STATUSES, type OrderStatus } from "@/lib/constants";
import { effectivePriceCents, formatBRL } from "@/lib/money";
import { escapeLike, onlyDigits } from "@/lib/text";
import type { SessionUser } from "../auth/session";
import { db } from "../db";
import {
  addresses,
  cartItems,
  carts,
  orderItems,
  orders,
  payments,
  productImages,
  products,
  users,
  type AddressSnapshot,
  type Order,
  type OrderItem,
  type Payment,
} from "../db/schema";
import { AuthError, BusinessRuleError, ExternalServiceError, NotFoundError, ValidationError } from "../errors";
import { getPaymentProvider } from "../payments";
import { resolveShippingOption, type ShippingOption, type ShippingQuoteInput } from "../shipping";
import { reserveStock, restoreStockForOrder } from "./inventory";
import { getSettings } from "./settings";

export type OrderDetail = Order & { items: OrderItem[]; payments: Payment[] };

/* ------------------------------------------------------------------ */
/* Criação do pedido                                                   */
/* ------------------------------------------------------------------ */

export type CreateOrderInput = {
  userId: string;
  cartId: string;
  addressId: string | null;
  shippingCode: string;
  /** Frete que a pessoa viu na tela (opcional). Se o valor recalculado for diferente, o pedido NÃO é criado e ela confere o novo total. */
  expectedShippingCents?: number | null;
  note: string | null;
};

/** Assinatura dos dados que definem o frete (itens, peso, medidas, subtotal e CEP): se não mudou, a cotação feita antes vale. */
function shippingQuoteKey(input: ShippingQuoteInput): string {
  return JSON.stringify([
    input.subtotalCents,
    input.destinationCep,
    [...input.items].sort((a, b) => a.productId.localeCompare(b.productId)).map((i) => [i.productId, i.quantity, i.weightGrams, i.lengthCm, i.widthCm, i.heightCm]),
  ]);
}

/**
 * Cota o frete ANTES de abrir a transação: com o frete calculado por CEP há uma chamada de rede (até alguns segundos), e ela não deve
 * segurar travas de estoque nem uma conexão do banco. Dentro da transação os dados são conferidos de novo; só se algo mudou nesse
 * meio-tempo (rarissimo) a cotação é refeita lá. Erros de regra (ex.: opção indisponível) já saem daqui; falhas inesperadas viram `null`
 * e a transação refaz o caminho completo, com as mensagens de sempre.
 */
async function quoteShippingBeforeTransaction(input: CreateOrderInput): Promise<{ key: string; option: ShippingOption } | null> {
  try {
    const rows = await db
      .select({ item: cartItems, product: products })
      .from(cartItems)
      .innerJoin(products, eq(products.id, cartItems.productId))
      .where(eq(cartItems.cartId, input.cartId));
    if (rows.length === 0) return null;

    let cep: string | null = null;
    if (input.addressId) {
      const [address] = await db
        .select({ cep: addresses.cep })
        .from(addresses)
        .where(and(eq(addresses.id, input.addressId), eq(addresses.userId, input.userId)));
      cep = address?.cep ?? null;
    }

    const quoteInput: ShippingQuoteInput = {
      subtotalCents: rows.reduce((sum, { item, product }) => sum + effectivePriceCents(product) * item.quantity, 0),
      destinationCep: cep,
      items: rows.map(({ item, product }) => ({
        productId: product.id,
        quantity: item.quantity,
        weightGrams: product.weightGrams,
        lengthCm: product.lengthCm,
        widthCm: product.widthCm,
        heightCm: product.heightCm,
      })),
    };
    return { key: shippingQuoteKey(quoteInput), option: await resolveShippingOption(input.shippingCode, quoteInput) };
  } catch (error) {
    if (error instanceof BusinessRuleError) throw error;
    return null;
  }
}

/**
 * Cria o pedido a partir do carrinho, em UMA transação:
 *  1. trava as linhas dos produtos (ordem fixa, sem deadlock);
 *  2. lê os preços REAIS do banco (o navegador nunca informa preço);
 *  3. calcula subtotal, frete (pelo ShippingProvider) e total;
 *  4. grava pedido e itens (com cópia do nome/preço/endereço);
 *  5. baixa o estoque de forma atômica;
 *  6. esvazia o carrinho.
 * Se qualquer etapa falhar, nada é gravado e o estoque não muda.
 */
export async function createOrderFromCart(input: CreateOrderInput): Promise<Order> {
  const settings = await getSettings();
  const preQuote = await quoteShippingBeforeTransaction(input);
  const expiresAt = new Date(Date.now() + settings.payment.windowMinutes * 60 * 1000);

  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, input.userId));
    if (!user || !user.active) throw new AuthError(401);

    const [cart] = await tx
      .select({ id: carts.id })
      .from(carts)
      .where(and(eq(carts.id, input.cartId), eq(carts.userId, input.userId)));
    if (!cart) throw new BusinessRuleError("Carrinho não encontrado.");

    const rows = await tx
      .select({ item: cartItems, product: products })
      .from(cartItems)
      .innerJoin(products, eq(products.id, cartItems.productId))
      .where(eq(cartItems.cartId, cart.id))
      .orderBy(asc(products.id))
      .for("update", { of: products });

    if (rows.length === 0) throw new BusinessRuleError("Seu carrinho está vazio.");

    for (const { item, product } of rows) {
      if (!product.active) {
        throw new BusinessRuleError(`"${product.name}" não está mais disponível. Remova-o do carrinho para continuar.`);
      }
      if (item.quantity > product.stock) {
        throw new BusinessRuleError(
          product.stock > 0
            ? `Só temos ${product.stock} unidade(s) de "${product.name}". Ajuste a quantidade no carrinho.`
            : `"${product.name}" está sem estoque. Remova-o do carrinho para continuar.`,
        );
      }
    }

    // Preços SEMPRE do banco, nunca do navegador.
    const priced = rows.map(({ item, product }) => {
      const unit = effectivePriceCents(product);
      return { product, quantity: item.quantity, unitPriceCents: unit, totalCents: unit * item.quantity };
    });
    const subtotalCents = priced.reduce((sum, l) => sum + l.totalCents, 0);

    // Endereço (cópia congelada no pedido).
    let address: typeof addresses.$inferSelect | undefined;
    if (input.addressId) {
      [address] = await tx
        .select()
        .from(addresses)
        .where(and(eq(addresses.id, input.addressId), eq(addresses.userId, input.userId)));
      if (!address) throw new ValidationError({ addressId: "Endereço não encontrado." });
    }

    const quoteInput: ShippingQuoteInput = {
      subtotalCents,
      destinationCep: address?.cep ?? null,
      items: priced.map((l) => ({
        productId: l.product.id,
        quantity: l.quantity,
        weightGrams: l.product.weightGrams,
        lengthCm: l.product.lengthCm,
        widthCm: l.product.widthCm,
        heightCm: l.product.heightCm,
      })),
    };
    const shipping = preQuote && preQuote.key === shippingQuoteKey(quoteInput) ? preQuote.option : await resolveShippingOption(input.shippingCode, quoteInput);

    if (shipping.requiresAddress && !address) {
      throw new ValidationError({ addressId: "Escolha ou cadastre o endereço de entrega." });
    }

    if (input.expectedShippingCents != null && input.expectedShippingCents !== shipping.priceCents) {
      throw new ValidationError({
        shippingCode: `O valor do frete foi atualizado para ${formatBRL(shipping.priceCents)}. Confira o total e finalize de novo.`,
      });
    }

    const snapshot: AddressSnapshot | null =
      shipping.requiresAddress && address
        ? {
            recipientName: address.recipientName,
            phone: address.phone,
            cep: address.cep,
            street: address.street,
            number: address.number,
            complement: address.complement,
            neighborhood: address.neighborhood,
            city: address.city,
            state: address.state,
          }
        : null;

    const totalCents = subtotalCents + shipping.priceCents;

    const [order] = await tx
      .insert(orders)
      .values({
        userId: user.id,
        status: "PENDENTE",
        paymentStatus: "PENDENTE",
        subtotalCents,
        shippingCents: shipping.priceCents,
        discountCents: 0,
        totalCents,
        shippingMethodCode: shipping.code,
        shippingMethodLabel: shipping.label,
        shippingEstimate: shipping.estimate,
        shippingAddress: snapshot,
        customerName: user.name,
        customerEmail: user.email,
        customerPhone: address?.phone ?? user.phone,
        customerNote: input.note,
        expiresAt,
      })
      .returning();

    // Primeira foto de cada produto (miniatura), para exibir no pedido.
    const productIds = priced.map((l) => l.product.id);
    const thumbs = await tx
      .select({ productId: productImages.productId, thumbKey: productImages.thumbKey })
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(asc(productImages.position));
    const thumbByProduct = new Map<string, string>();
    for (const t of thumbs) if (t.productId && !thumbByProduct.has(t.productId)) thumbByProduct.set(t.productId, t.thumbKey);

    await tx.insert(orderItems).values(
      priced.map((l) => ({
        orderId: order.id,
        productId: l.product.id,
        name: l.product.name,
        sku: l.product.sku,
        imageKey: thumbByProduct.get(l.product.id) ?? null,
        unitPriceCents: l.unitPriceCents,
        quantity: l.quantity,
        totalCents: l.totalCents,
      })),
    );

    await reserveStock(
      tx,
      priced.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      order.id,
    );

    await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    return order;
  });
}

/* ------------------------------------------------------------------ */
/* Pagamento do pedido                                                 */
/* ------------------------------------------------------------------ */

/**
 * Gera (ou reaproveita) o link de pagamento do pedido. Também é usado quando o
 * cliente volta ao pedido e clica em "Pagar agora".
 */
export async function startPaymentForOrder(orderId: string, ownerId: string): Promise<{ url: string }> {
  const provider = getPaymentProvider();
  if (!provider.isConfigured()) {
    throw new ExternalServiceError("O pagamento online ainda não está disponível. Fale com a loja para concluir sua compra.");
  }

  const order = await getOrderDetail(orderId);
  if (!order || order.userId !== ownerId) throw new NotFoundError("Pedido não encontrado.");
  if (!(AWAITING_PAYMENT_STATUSES as readonly string[]).includes(order.status)) {
    throw new BusinessRuleError("Este pedido não está aguardando pagamento.");
  }
  if (order.expiresAt && order.expiresAt.getTime() <= Date.now()) {
    throw new BusinessRuleError("O prazo para pagar este pedido terminou. Faça um novo pedido.");
  }
  if (order.paymentCheckoutUrl && order.paymentProvider === provider.id) {
    const reusable = provider.canReuseCheckout && order.paymentCheckoutRef ? await provider.canReuseCheckout(order.paymentCheckoutRef) : true;
    if (reusable) return { url: order.paymentCheckoutUrl };
  }

  const settings = await getSettings();
  const { getEnv } = await import("../env");
  const session = await provider.createCheckout({
    orderId: order.id,
    orderNumber: order.number,
    items: order.items.map((i) => ({ title: i.name, quantity: i.quantity, unitPriceCents: i.unitPriceCents })),
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    payer: { name: order.customerName, email: order.customerEmail, phone: order.customerPhone },
    expiresAt: order.expiresAt ?? new Date(Date.now() + settings.payment.windowMinutes * 60_000),
    siteUrl: getEnv().siteUrl,
    methods: {
      pix: settings.payment.pix,
      card: settings.payment.card,
      boleto: settings.payment.boleto,
      maxInstallments: settings.payment.maxInstallments,
    },
  });

  await db
    .update(orders)
    .set({
      paymentProvider: provider.id,
      paymentCheckoutRef: session.ref,
      paymentCheckoutUrl: session.url,
      status: "PAGAMENTO_PENDENTE",
    })
    .where(and(eq(orders.id, order.id), inArray(orders.status, [...AWAITING_PAYMENT_STATUSES])));

  return { url: session.url };
}

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: { items: true, payments: { orderBy: [desc(payments.createdAt)] } },
  });
  return (order as OrderDetail | undefined) ?? null;
}

/** Pedido só é devolvido ao dono dele (cliente) — administradores usam `getOrderDetail`. */
export async function getOrderForUser(orderId: string, userId: string): Promise<OrderDetail | null> {
  const order = await getOrderDetail(orderId);
  return order && order.userId === userId ? order : null;
}

export async function listOrdersForUser(userId: string): Promise<Array<Order & { items: OrderItem[] }>> {
  const rows = await db.query.orders.findMany({
    where: eq(orders.userId, userId),
    orderBy: [desc(orders.createdAt)],
    with: { items: true },
    limit: 100,
  });
  return rows as Array<Order & { items: OrderItem[] }>;
}

export type AdminOrderFilters = {
  status?: OrderStatus | "ALL";
  q?: string;
  /** Somente pedidos com aviso para o administrador (ex.: pagamento aprovado depois do cancelamento). */
  attention?: boolean;
  page?: number;
  pageSize?: number;
};

export async function adminListOrders(filters: AdminOrderFilters = {}) {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = filters.pageSize ?? 20;
  const conditions: SQL[] = [];

  if (filters.status && filters.status !== "ALL") conditions.push(eq(orders.status, filters.status));
  if (filters.attention) conditions.push(isNotNull(orders.attentionNote));

  const q = filters.q?.trim();
  if (q) {
    const digits = onlyDigits(q);
    const like = `%${escapeLike(q)}%`;
    const byNumber = /^#?\d{1,9}$/.test(q) && digits ? sql`${orders.number} = ${Number(digits)}` : undefined;
    const byText = sql`(${orders.customerName} ILIKE ${like} OR ${orders.customerEmail} ILIKE ${like})`;
    conditions.push((byNumber ? sql`(${byNumber} OR ${byText})` : byText) as SQL);
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(orders).where(where),
  ]);

  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/* ------------------------------------------------------------------ */
/* Mudanças de status                                                  */
/* ------------------------------------------------------------------ */

/** Transições que o administrador pode fazer. Reembolso tem fluxo próprio (`refundOrder`). */
const ADMIN_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDENTE: ["CANCELADO"],
  PAGAMENTO_PENDENTE: ["CANCELADO"],
  PAGO: ["PROCESSANDO", "ENVIADO"],
  PROCESSANDO: ["ENVIADO"],
  ENVIADO: ["ENTREGUE"],
  ENTREGUE: [],
  CANCELADO: [],
  REEMBOLSADO: [],
};

export function allowedNextStatuses(status: OrderStatus): OrderStatus[] {
  return ADMIN_TRANSITIONS[status];
}

export async function updateOrderStatus(input: {
  orderId: string;
  next: OrderStatus;
  trackingCode?: string | null;
  actorId: string;
}): Promise<Order> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update");
    if (!order) throw new NotFoundError("Pedido não encontrado.");

    if (!ADMIN_TRANSITIONS[order.status].includes(input.next)) {
      throw new BusinessRuleError(`Não é possível mudar o pedido de "${order.status}" para "${input.next}".`);
    }

    const now = new Date();
    const patch: Partial<typeof orders.$inferInsert> = { status: input.next };

    if (input.next === "ENVIADO") {
      patch.shippedAt = now;
      if (input.trackingCode) patch.trackingCode = input.trackingCode.slice(0, 80);
    }
    if (input.next === "ENTREGUE") patch.deliveredAt = now;
    if (input.next === "CANCELADO") {
      patch.cancelledAt = now;
      patch.paymentStatus = "CANCELADO";
    }

    const [updated] = await tx.update(orders).set(patch).where(eq(orders.id, order.id)).returning();
    if (input.next === "CANCELADO") {
      await restoreStockForOrder(tx, order.id, `Pedido #${order.number} cancelado`, input.actorId);
    }
    return updated;
  });
}

/** Cancelamento feito pelo próprio cliente — só enquanto o pedido ainda não foi pago. */
export async function cancelOrderByCustomer(orderId: string, user: SessionUser): Promise<Order> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order || order.userId !== user.id) throw new NotFoundError("Pedido não encontrado.");

    if (!(AWAITING_PAYMENT_STATUSES as readonly string[]).includes(order.status)) {
      throw new BusinessRuleError("Este pedido já foi pago ou encerrado. Para cancelar, entre em contato com a loja.");
    }

    const [updated] = await tx
      .update(orders)
      .set({ status: "CANCELADO", paymentStatus: "CANCELADO", cancelledAt: new Date() })
      .where(eq(orders.id, order.id))
      .returning();
    await restoreStockForOrder(tx, order.id, `Pedido #${order.number} cancelado pelo cliente`, user.id);
    return updated;
  });
}

/**
 * Cancela pedidos que passaram do prazo sem pagamento e devolve o estoque.
 * Cada pedido é tratado em transação própria; se um pagamento chegar ao mesmo
 * tempo, a trava da linha do pedido garante que só um dos dois processos vence.
 */
export async function expireUnpaidOrders(now = new Date()): Promise<number> {
  const candidates = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(inArray(orders.status, [...AWAITING_PAYMENT_STATUSES]), sql`${orders.expiresAt} < ${now}`))
    .limit(200);

  let expired = 0;
  for (const { id } of candidates) {
    const done = await db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
      if (!order || !(AWAITING_PAYMENT_STATUSES as readonly string[]).includes(order.status)) return false;
      if (!order.expiresAt || order.expiresAt >= now) return false;

      await tx
        .update(orders)
        .set({ status: "CANCELADO", paymentStatus: "CANCELADO", cancelledAt: now })
        .where(eq(orders.id, id));
      await restoreStockForOrder(tx, id, `Pedido #${order.number} expirou sem pagamento`);
      return true;
    });
    if (done) expired++;
  }
  return expired;
}
