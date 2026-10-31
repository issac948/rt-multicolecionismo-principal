CREATE TABLE "event_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"default_start_time" text,
	"default_end_time" text,
	"image_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_templates_start_valid" CHECK ("event_templates"."default_start_time" IS NULL OR "event_templates"."default_start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "event_templates_end_valid" CHECK ("event_templates"."default_end_time" IS NULL OR "event_templates"."default_end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"event_date" date NOT NULL,
	"start_time" text,
	"end_time" text,
	"image_key" text,
	"status" text DEFAULT 'PUBLICADO' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_status_valid" CHECK ("events"."status" IN ('PUBLICADO', 'RASCUNHO', 'CANCELADO')),
	CONSTRAINT "events_start_valid" CHECK ("events"."start_time" IS NULL OR "events"."start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "events_end_valid" CHECK ("events"."end_time" IS NULL OR "events"."end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
CREATE TABLE "stored_files" (
	"key" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_template_id_event_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."event_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_date_idx" ON "events" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "events_template_idx" ON "events" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "stored_files_created_idx" ON "stored_files" USING btree ("created_at");--> statement-breakpoint
-- Texto do aviso "feiras" -> "eventos". ADITIVA e segura: só troca se o dono ainda não mudou o texto padrão antigo.
UPDATE "settings"
SET "value" = jsonb_set("value", '{fairsNote}', '"Além da loja online, também participamos de eventos, em Curitiba."'::jsonb), "updated_at" = now()
WHERE "key" = 'store' AND "value"->>'fairsNote' = 'Além da loja online, também vendemos em feiras, em Curitiba.';
