-- Limpeza SEGURA de dados que não vieram do dono da loja. Nada é apagado: só ficam de fora da vitrine ou voltam ao "não configurado".
-- Cada comando só toca em registros identificados com certeza (valores IDÊNTICOS aos do seed antigo); o que o dono digitou é preservado.

-- 1) Produtos de DEMONSTRAÇÃO do seed antigo (carrinhos infantis, de bebê, de carga, de feira...): nome idêntico a um dos nove
--    do seed antigo E descrição curta começando com "Produto de demonstração". Viram rascunho (o painel tem o botão para apagar de vez).
UPDATE "products"
SET "active" = false, "updated_at" = now()
WHERE "active" = true
  AND "name" IN (
    'Carrinho Infantil Vermelho',
    'Carrinho Infantil Azul',
    'Carrinho de Bebê Dobrável',
    'Carrinho de Bebê Passeio Leve',
    'Carrinho de Carga Reforçado',
    'Carrinho Plataforma Dobrável',
    'Carrinho de Feira com Rodinhas',
    'Carrinho de Feira Dobrável Compacto',
    'Carrinho Utilitário (rascunho)'
  )
  AND "short_description" LIKE 'Produto de demonstração%';--> statement-breakpoint

-- 2) Categorias antigas de demonstração que ficaram sem nenhum produto publicado deixam de existir na loja (a categoria continua no painel).
UPDATE "categories"
SET "active" = false, "updated_at" = now()
WHERE "active" = true
  AND "name" IN ('Carrinhos infantis', 'Carrinhos de bebê', 'Carrinhos de carga', 'Carrinhos de feira')
  AND NOT EXISTS (SELECT 1 FROM "products" p WHERE p."category_id" = "categories"."id" AND p."active" = true);--> statement-breakpoint

-- 3) Frase e descrição da loja: só trocam se ainda forem os textos de exemplo anteriores.
UPDATE "settings"
SET "value" = jsonb_set("value", '{tagline}', '"Miniaturas de carros e colecionáveis"'::jsonb), "updated_at" = now()
WHERE "key" = 'store' AND "value"->>'tagline' IN ('Miniaturas colecionáveis e muito mais', 'Carrinhos para o dia a dia');--> statement-breakpoint
UPDATE "settings"
SET "value" = jsonb_set("value", '{description}', '"Miniaturas de carros colecionáveis, lacradas e soltas, além de bonecos, figuras e outros colecionáveis para a sua coleção. Loja de Curitiba."'::jsonb), "updated_at" = now()
WHERE "key" = 'store' AND "value"->>'description' IN (
  'Miniaturas colecionáveis, lacradas e soltas, e também outros produtos selecionados. Loja de Curitiba.',
  'Carrinhos colecionáveis em miniatura, lacrados e soltos, e também outros produtos selecionados. Loja de Curitiba.',
  'Loja de demonstração. Troque estes textos em Configurações.'
);--> statement-breakpoint

-- 4) Frete: R$ 30,00 e "3 a 7 dias úteis" eram um valor de exemplo do sistema, não uma condição definida pelo dono.
--    Se o frete ainda é EXATAMENTE esse padrão, a entrega volta a "não configurada" (a loja não mostra nem cobra um frete inventado).
--    Quem já alterou qualquer um desses valores não é afetado.
UPDATE "settings"
SET "value" = jsonb_set(
      jsonb_set(jsonb_set("value", '{shipping,deliveryEnabled}', 'false'::jsonb), '{shipping,flatRateCents}', '0'::jsonb),
      '{shipping,estimate}', '""'::jsonb
    ),
    "updated_at" = now()
WHERE "key" = 'store'
  AND "value"#>>'{shipping,deliveryEnabled}' = 'true'
  AND "value"#>>'{shipping,flatRateCents}' = '3000'
  AND COALESCE("value"#>>'{shipping,estimate}', '') = '3 a 7 dias úteis'
  AND "value"#>>'{shipping,freeAboveCents}' IS NULL;
