import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { EVENT_STATUSES, type EventStatus } from "../../lib/events";
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  PRODUCT_CONDITIONS,
  STOCK_MOVEMENT_TYPES,
  USER_ROLES,
  type OrderStatus,
  type PaymentStatus,
  type StockMovementType,
  type UserRole,
} from "../../lib/constants";

/* ------------------------------------------------------------------ */
/* Tipos auxiliares guardados em colunas JSON                          */
/* ------------------------------------------------------------------ */

export type ProductFeature = { label: string; value: string };

/** Cópia do endereço no momento da compra (editar o endereço depois não altera pedidos antigos). */
export type AddressSnapshot = {
  recipientName: string;
  phone: string;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
};

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

// As listas de valores ficam em lib/constants.ts (compartilhadas com o navegador).
export const userRoleEnum = pgEnum("user_role", USER_ROLES);
export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);
export const paymentStatusEnum = pgEnum("payment_status", PAYMENT_STATUSES);
export const stockMovementTypeEnum = pgEnum("stock_movement_type", STOCK_MOVEMENT_TYPES);

export type { UserRole, OrderStatus, PaymentStatus, StockMovementType };

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ------------------------------------------------------------------ */
/* Usuários e sessões                                                  */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    role: userRoleEnum("role").notNull().default("CLIENTE"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_lower_unique").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 do token do cookie. O token em si nunca é gravado no banco. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

/**
 * Links de redefinição de senha. O administrador gera o link no painel e envia ao cliente
 * (WhatsApp, por exemplo). Só o HASH do token fica no banco; cada link vale uma vez e expira.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("password_reset_tokens_hash_unique").on(t.tokenHash),
    index("password_reset_tokens_user_idx").on(t.userId),
  ],
);

/* ------------------------------------------------------------------ */
/* Catálogo                                                            */
/* ------------------------------------------------------------------ */

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    position: integer("position").notNull().default(0),
    active: boolean("active").notNull().default(true),
    /** Categoria de carrinhos/miniaturas colecionáveis: abre os campos de marca, escala e condição no cadastro e ganha destaque na loja. */
    isCollectible: boolean("is_collectible").notNull().default(false),
    /** CARROS | COLECIONAVEL | OUTROS: decide quais campos o cadastro de produto mostra. Subcategoria herda o tipo da categoria-mãe. */
    kind: text("kind").notNull().default("OUTROS"),
    /** Categoria-mãe (um único nível de subcategorias). Nulo = categoria principal. */
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("categories_slug_unique").on(t.slug),
    index("categories_parent_idx").on(t.parentId),
    check("categories_kind_valid", sql`${t.kind} IN ('CARROS', 'COLECIONAVEL', 'OUTROS')`),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sku: text("sku"),
    shortDescription: text("short_description").notNull().default(""),
    description: text("description").notNull().default(""),
    /** Todos os valores em centavos (inteiros) para evitar erro de arredondamento. */
    priceCents: integer("price_cents").notNull(),
    salePriceCents: integer("sale_price_cents"),
    /** Estoque atual. A única forma de alterá-lo é pelo serviço de estoque (com histórico). */
    stock: integer("stock").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(3),
    /** Produto publicado aparece na loja. Desativado fica só no painel. */
    active: boolean("active").notNull().default(false),
    featured: boolean("featured").notNull().default(false),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    features: jsonb("features").$type<ProductFeature[]>().notNull().default(sql`'[]'::jsonb`),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    promoText: text("promo_text"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    weightGrams: integer("weight_grams"),
    lengthCm: integer("length_cm"),
    widthCm: integer("width_cm"),
    heightCm: integer("height_cm"),
    /* Dados de colecionáveis: todos OPCIONAIS (produtos de outros tipos deixam em branco). */
    brand: text("brand"),
    model: text("model"),
    /** Escala no formato "1:64". */
    scale: text("scale"),
    /** Série ou coleção (ex.: "Treasure Hunt 2024"). */
    series: text("series"),
    releaseYear: integer("release_year"),
    condition: text("condition").$type<(typeof PRODUCT_CONDITIONS)[number]>(),
    packagingState: text("packaging_state"),
    conservationNotes: text("conservation_notes"),
    /** Texto normalizado (minúsculo, sem acentos) usado pela busca. */
    searchText: text("search_text").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("products_slug_unique").on(t.slug),
    uniqueIndex("products_sku_unique").on(t.sku),
    index("products_category_idx").on(t.categoryId),
    index("products_active_idx").on(t.active, t.featured),
    index("products_brand_idx").on(sql`lower(${t.brand})`),
    check("products_condition_valid", sql`${t.condition} IS NULL OR ${t.condition} IN ('LACRADO', 'SOLTO')`),
    check("products_release_year_valid", sql`${t.releaseYear} IS NULL OR (${t.releaseYear} >= 1880 AND ${t.releaseYear} <= 2100)`),
    check("products_price_nonneg", sql`${t.priceCents} >= 0`),
    check("products_stock_nonneg", sql`${t.stock} >= 0`),
    check(
      "products_sale_lt_price",
      sql`${t.salePriceCents} IS NULL OR (${t.salePriceCents} >= 0 AND ${t.salePriceCents} < ${t.priceCents})`,
    ),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Nulo enquanto a imagem foi enviada mas o produto ainda não foi salvo. */
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    thumbKey: text("thumb_key").notNull(),
    alt: text("alt"),
    position: integer("position").notNull().default(0),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("product_images_storage_key_unique").on(t.storageKey),
    index("product_images_product_idx").on(t.productId, t.position),
  ],
);

/* ------------------------------------------------------------------ */
/* Carrinho e endereços                                                */
/* ------------------------------------------------------------------ */

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Nulo para carrinho de visitante (identificado pelo cookie). */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("carts_user_unique").on(t.userId)],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("cart_items_cart_product_unique").on(t.cartId, t.productId),
    check("cart_items_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label"),
    recipientName: text("recipient_name").notNull(),
    phone: text("phone").notNull(),
    cep: text("cep").notNull(),
    street: text("street").notNull(),
    number: text("number").notNull(),
    complement: text("complement"),
    neighborhood: text("neighborhood").notNull(),
    city: text("city").notNull(),
    state: text("state").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("addresses_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Pedidos e pagamentos                                                */
/* ------------------------------------------------------------------ */

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Número amigável mostrado ao cliente (#1001, #1002...). */
    number: integer("number").notNull().generatedAlwaysAsIdentity({ startWith: 1001 }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    status: orderStatusEnum("status").notNull().default("PENDENTE"),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("PENDENTE"),
    paymentMethod: text("payment_method"),

    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),

    shippingMethodCode: text("shipping_method_code").notNull(),
    shippingMethodLabel: text("shipping_method_label").notNull(),
    shippingEstimate: text("shipping_estimate"),
    /** Nulo quando o cliente escolhe retirar na loja. */
    shippingAddress: jsonb("shipping_address").$type<AddressSnapshot>(),
    trackingCode: text("tracking_code"),

    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone"),
    customerNote: text("customer_note"),

    /** Link de pagamento ativo no provedor (Mercado Pago) e sua referência. */
    paymentProvider: text("payment_provider"),
    paymentCheckoutRef: text("payment_checkout_ref"),
    paymentCheckoutUrl: text("payment_checkout_url"),

    /** Pedido não pago até esta data é cancelado e o estoque volta para a loja. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Marca que o estoque deste pedido já foi devolvido (impede devolver duas vezes). */
    stockReleasedAt: timestamp("stock_released_at", { withTimezone: true }),
    /** Aviso para o administrador (ex.: pagamento aprovado após cancelamento). */
    attentionNote: text("attention_note"),

    paidAt: timestamp("paid_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_number_unique").on(t.number),
    index("orders_user_idx").on(t.userId, t.createdAt),
    index("orders_status_idx").on(t.status, t.createdAt),
    index("orders_expires_idx").on(t.expiresAt),
    check("orders_amounts_nonneg", sql`${t.subtotalCents} >= 0 AND ${t.shippingCents} >= 0 AND ${t.discountCents} >= 0 AND ${t.totalCents} >= 0`),
    check("orders_total_consistent", sql`${t.totalCents} = ${t.subtotalCents} + ${t.shippingCents} - ${t.discountCents}`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** Fica nulo se o produto for excluído; o histórico continua no snapshot abaixo. */
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    sku: text("sku"),
    imageKey: text("image_key"),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    totalCents: integer("total_cents").notNull(),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    index("order_items_product_idx").on(t.productId),
    check("order_items_quantity_positive", sql`${t.quantity} > 0`),
    check("order_items_total_consistent", sql`${t.totalCents} = ${t.unitPriceCents} * ${t.quantity}`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    /** ID do pagamento no provedor (ex.: id do pagamento no Mercado Pago). */
    providerPaymentId: text("provider_payment_id").notNull(),
    method: text("method"),
    status: paymentStatusEnum("status").notNull().default("PENDENTE"),
    amountCents: integer("amount_cents").notNull(),
    refundedCents: integer("refunded_cents").notNull().default(0),
    /** Status bruto devolvido pelo provedor, útil para diagnóstico. */
    rawStatus: text("raw_status"),
    statusDetail: text("status_detail"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("payments_provider_payment_unique").on(t.provider, t.providerPaymentId),
    index("payments_order_idx").on(t.orderId),
  ],
);

/** Registro de auditoria de tudo que chega no webhook (aceito ou recusado). */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventType: text("event_type"),
    externalId: text("external_id"),
    signatureValid: boolean("signature_valid").notNull(),
    outcome: text("outcome").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("webhook_events_created_idx").on(t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Estoque e configurações                                             */
/* ------------------------------------------------------------------ */

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    productName: text("product_name").notNull(),
    type: stockMovementTypeEnum("type").notNull(),
    /** Positivo = entrou no estoque, negativo = saiu. */
    quantityChange: integer("quantity_change").notNull(),
    stockAfter: integer("stock_after").notNull(),
    reason: text("reason"),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("stock_movements_product_idx").on(t.productId, t.createdAt),
    index("stock_movements_order_idx").on(t.orderId),
  ],
);

export const settings = pgTable(
  "settings",
  {
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.key] })],
);

/* ------------------------------------------------------------------ */
/* Arquivos guardados no banco (fotos) e eventos                       */
/* ------------------------------------------------------------------ */

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * Fotos guardadas no próprio PostgreSQL (armazenamento padrão em hospedagem sem disco permanente, como o Netlify).
 * A chave é a mesma usada no resto do sistema ("products/abc.webp"): trocar de armazenamento não muda nenhuma outra tabela.
 */
export const storedFiles = pgTable(
  "stored_files",
  {
    key: text("key").primaryKey(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("stored_files_created_idx").on(t.createdAt)],
);

/** Modelo reutilizável de evento (ex.: "Feira de Colecionadores do Parque"). Serve só como ponto de partida das participações. */
export const eventTemplates = pgTable(
  "event_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    location: text("location").notNull().default(""),
    /** HH:MM */
    defaultStartTime: text("default_start_time"),
    defaultEndTime: text("default_end_time"),
    imageKey: text("image_key"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("event_templates_start_valid", sql`${t.defaultStartTime} IS NULL OR ${t.defaultStartTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check("event_templates_end_valid", sql`${t.defaultEndTime} IS NULL OR ${t.defaultEndTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  ],
);

/**
 * Uma participação da loja em uma data. Os dados são COPIADOS do modelo na hora de criar:
 * editar o modelo depois nunca muda participações já marcadas (só se o dono pedir, explicitamente).
 */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Fica nulo para evento único (sem modelo) ou se o modelo for excluído. */
    templateId: uuid("template_id").references(() => eventTemplates.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    location: text("location").notNull().default(""),
    /** Data de calendário (sem fuso). */
    eventDate: date("event_date", { mode: "string" }).notNull(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    imageKey: text("image_key"),
    status: text("status").$type<EventStatus>().notNull().default("PUBLICADO"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("events_date_idx").on(t.eventDate),
    index("events_template_idx").on(t.templateId),
    check("events_status_valid", sql`${t.status} IN (${sql.raw(EVENT_STATUSES.map((s) => `'${s}'`).join(", "))})`),
    check("events_start_valid", sql`${t.startTime} IS NULL OR ${t.startTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check("events_end_valid", sql`${t.endTime} IS NULL OR ${t.endTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  ],
);

export const eventTemplatesRelations = relations(eventTemplates, ({ many }) => ({
  events: many(events),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  template: one(eventTemplates, { fields: [events.templateId], references: [eventTemplates.id] }),
}));

/* ------------------------------------------------------------------ */
/* Relações (para db.query.*)                                          */
/* ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  addresses: many(addresses),
  orders: many(orders),
  cart: one(carts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  images: many(productImages),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, { fields: [carts.userId], references: [users.id] }),
  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  product: one(products, { fields: [cartItems.productId], references: [products.id] }),
}));

export const addressesRelations = relations(addresses, ({ one }) => ({
  user: one(users, { fields: [addresses.userId], references: [users.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
  payments: many(payments),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, { fields: [stockMovements.productId], references: [products.id] }),
  order: one(orders, { fields: [stockMovements.orderId], references: [orders.id] }),
  user: one(users, { fields: [stockMovements.userId], references: [users.id] }),
}));

/* ------------------------------------------------------------------ */
/* Tipos inferidos                                                     */
/* ------------------------------------------------------------------ */

export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type Cart = typeof carts.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
export type Address = typeof addresses.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type EventTemplate = typeof eventTemplates.$inferSelect;
export type EventRow = typeof events.$inferSelect;
