CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "is_collectible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "scale" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "series" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "release_year" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "condition" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "packaging_state" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "conservation_notes" text;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_hash_unique" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree (lower("brand"));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_condition_valid" CHECK ("products"."condition" IS NULL OR "products"."condition" IN ('LACRADO', 'SOLTO'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_release_year_valid" CHECK ("products"."release_year" IS NULL OR ("products"."release_year" >= 1880 AND "products"."release_year" <= 2100));--> statement-breakpoint
-- Identidade da loja: troca SOMENTE os textos de demonstração antigos (iguais aos do seed original).
-- Quem já personalizou o nome, a frase ou a descrição em Configurações não é afetado.
UPDATE "settings"
SET "value" = jsonb_set("value", '{storeName}', '"RT Multicolecionismo"'::jsonb), "updated_at" = now()
WHERE "key" = 'store' AND "value"->>'storeName' IN ('Minha Loja de Carrinhos', 'Loja de Carrinhos (demonstração)');--> statement-breakpoint
UPDATE "settings"
SET "value" = jsonb_set("value", '{tagline}', '"Miniaturas colecionáveis e muito mais"'::jsonb), "updated_at" = now()
WHERE "key" = 'store' AND "value"->>'tagline' = 'Carrinhos para o dia a dia';--> statement-breakpoint
UPDATE "settings"
SET "value" = jsonb_set("value", '{description}', '"Carrinhos colecionáveis em miniatura, lacrados e soltos, e também outros produtos selecionados. Loja de Curitiba."'::jsonb), "updated_at" = now()
WHERE "key" = 'store' AND "value"->>'description' = 'Loja de demonstração. Troque estes textos em Configurações.';
--> statement-breakpoint
-- Contatos FICTÍCIOS do seed antigo: a loja não tem endereço físico e não deve exibir telefone/WhatsApp inventado.
-- Só valores IDÊNTICOS aos do seed antigo são limpos; qualquer dado digitado pelo administrador é preservado.
UPDATE "settings"
SET "value" = jsonb_set("value", '{whatsapp}', '""'::jsonb), "updated_at" = now()
WHERE "key" = 'store' AND "value"->>'whatsapp' = '11900000000';--> statement-breakpoint
UPDATE "settings"
SET "value" = jsonb_set("value", '{phone}', '""'::jsonb), "updated_at" = now()
WHERE "key" = 'store' AND "value"->>'phone' = '1130000000';--> statement-breakpoint
UPDATE "settings"
SET "value" = jsonb_set("value", '{email}', '""'::jsonb), "updated_at" = now()
WHERE "key" = 'store' AND "value"->>'email' = 'contato@loja.local';--> statement-breakpoint
UPDATE "settings"
SET "value" = jsonb_set("value", '{addressText}', '""'::jsonb), "updated_at" = now()
WHERE "key" = 'store' AND "value"->>'addressText' = 'Endereço da loja: configure em Configurações';--> statement-breakpoint
UPDATE "settings"
SET "value" = jsonb_set("value", '{businessHours}', '""'::jsonb), "updated_at" = now()
WHERE "key" = 'store' AND "value"->>'businessHours' = 'Segunda a sexta, 8h às 18h';--> statement-breakpoint
UPDATE "settings"
SET "value" = jsonb_set(jsonb_set("value", '{shipping,pickupEnabled}', 'false'::jsonb), '{shipping,pickupInstructions}', '""'::jsonb), "updated_at" = now()
WHERE "key" = 'store' AND "value"->'shipping'->>'pickupInstructions' = 'Retire na loja em horário comercial.';
