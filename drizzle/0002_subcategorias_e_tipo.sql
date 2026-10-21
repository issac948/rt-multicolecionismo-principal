ALTER TABLE "categories" ADD COLUMN "kind" text DEFAULT 'OUTROS' NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_kind_valid" CHECK ("categories"."kind" IN ('CARROS', 'COLECIONAVEL', 'OUTROS'));
--> statement-breakpoint
-- Categorias que já eram marcadas como colecionáveis passam a ser do tipo CARROS (só ajusta o tipo; nada é apagado).
UPDATE "categories" SET "kind" = 'CARROS' WHERE "is_collectible" = true;
