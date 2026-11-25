CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"sale_price_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "promo_price_cents" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sale_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sale_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_history_product_idx" ON "price_history" USING btree ("product_id","created_at");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_promo_lt_price" CHECK ("products"."promo_price_cents" IS NULL OR ("products"."promo_price_cents" >= 0 AND "products"."promo_price_cents" < "products"."price_cents"));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_sale_window_valid" CHECK ("products"."sale_starts_at" IS NULL OR "products"."sale_ends_at" IS NULL OR "products"."sale_ends_at" > "products"."sale_starts_at");--> statement-breakpoint
UPDATE "products" SET "promo_price_cents" = "sale_price_cents" WHERE "sale_price_cents" IS NOT NULL;--> statement-breakpoint
INSERT INTO "price_history" ("product_id", "price_cents", "sale_price_cents") SELECT "id", "price_cents", "sale_price_cents" FROM "products";--> statement-breakpoint
CREATE FUNCTION "record_price_change"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "price_history" ("product_id", "price_cents", "sale_price_cents") VALUES (NEW."id", NEW."price_cents", NEW."sale_price_cents");
  ELSIF NEW."price_cents" IS DISTINCT FROM OLD."price_cents" OR NEW."sale_price_cents" IS DISTINCT FROM OLD."sale_price_cents" THEN
    INSERT INTO "price_history" ("product_id", "price_cents", "sale_price_cents") VALUES (NEW."id", NEW."price_cents", NEW."sale_price_cents");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "products_price_history" AFTER INSERT OR UPDATE OF "price_cents", "sale_price_cents" ON "products" FOR EACH ROW EXECUTE FUNCTION "record_price_change"();
