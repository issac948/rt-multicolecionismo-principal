-- Contatos informados pelo dono (WhatsApp/telefone +55 41 9141-9031 e grupo de clientes).
-- ADITIVA e segura: só preenche o que está em branco; se o dono já digitou outro número ou link, nada muda.
-- Em instalações novas (sem configurações salvas) os mesmos valores vêm dos padrões do sistema.
UPDATE "settings"
SET "value" = jsonb_set("value", '{whatsapp}', '"4191419031"'::jsonb), "updated_at" = now()
WHERE "key" = 'store' AND COALESCE("value"->>'whatsapp', '') = '';--> statement-breakpoint
UPDATE "settings"
SET "value" = jsonb_set("value", '{phone}', '"4191419031"'::jsonb), "updated_at" = now()
WHERE "key" = 'store' AND COALESCE("value"->>'phone', '') = '';--> statement-breakpoint
UPDATE "settings"
SET "value" = jsonb_set("value", '{whatsappGroupUrl}', '"https://chat.whatsapp.com/GbvNJdKd8Tc88muhZKjgFE"'::jsonb), "updated_at" = now()
WHERE "key" = 'store' AND COALESCE("value"->>'whatsappGroupUrl', '') = '';
