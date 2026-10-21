# PROGRESSO — RT Multicolecionismo

Atualizado: 2026-10-19

## Fatos do negócio (da última mensagem do dono)
- Sem loja física; o pai vende em feiras (Curitiba). WhatsApp próprio + grupo de WhatsApp. NÃO inventar telefone/endereço/redes/feiras.
- Pagamento: o dono tem conta PayPal e conta da maquininha **InfinitePay**; escolhe o serviço por `PAYMENT_PROVIDER` (paypal | infinitepay | mercadopago). Viabilidade online de cada conta a confirmar com o serviço.
- Contatos reais informados em 2026-10-17: WhatsApp/telefone +55 41 9141-9031 (8 dígitos depois do DDD: CONFIRMAR se falta o 9) e grupo de clientes do WhatsApp (link na migração `0004`).
- Frete: o dono vai usar SEDEX ou SuperFrete; quer cadastrar o próprio endereço no painel.
- Banco: nunca `db:seed -- --reset`, nunca apagar dados; testes só em bancos `*_test`/`loja_e2e`.

## Concluído (verificado = tsc ok + visto no navegador; testes novos ainda por escrever/rodar)
- Auditoria inicial; migração aditiva `0001` (colecionáveis, tokens de senha, textos RT, limpeza dos contatos fictícios do seed antigo) — verificada em `loja_e2e`/`loja_mig`.
- Catálogo: marca/modelo/escala/série/ano/condição/embalagem/conservação (opcionais), filtros marca/escala/condição/tipo + facetas, busca nos novos campos.
- Identidade: logo oficial em `public/brand` (+ `scripts/make-brand-assets.mjs`), ícones, OG image, tokens preto/dourado/vermelho, Lobster, header/footer/home/admin sidebar.
- Home nova (hero, marcas, miniaturas, categorias, "E também…", feiras, promoção); ficha do produto com dados de colecionável.
- Seed novo (só adiciona, SKU `DEMO-`, sem --reset); botão "Remover produtos de demonstração" no Resumo (`services/demo.ts`).
- Painel: formulário de produto reorganizado (essencial no topo, colecionável opcional, mais opções, barra fixa, confirma publicar sem foto); categoria "colecionável".
- Recuperação de senha: link gerado pelo admin (`/redefinir-senha/[token]`, 60 min, uso único, hash no banco, encerra sessões).

- Testes: `tests/colecionaveis.test.ts` (14). Suíte completa: 182/182 passando (2026-10-13).
- Pagamento PayPal (Orders v2): `payments/paypal.ts`, webhook `/api/webhooks/paypal` (verifica assinatura na API do PayPal), retorno `/pedido/[id]/retorno` (loja captura e consulta; nunca confia na volta do navegador), textos/painel/dashboard/config por provedor, `.env.example` (PAYMENT_PROVIDER, PAYPAL_*). Testado SÓ contra PayPal SIMULADO (`tests/paypal.test.ts`, 22). PayPal real: BLOQUEADO até haver Client ID/Secret/Webhook ID (sandbox primeiro).
- Config: campo do grupo de WhatsApp (antes era apagado ao salvar!), textos "sem loja física", logo oficial por padrão.

- IA: campos de colecionável + lista `missing` calculada pelo sistema (testes ai.test.ts). SIMULADA (sem chave real).
- Verificado em 2026-10-13: `tsc` limpo, `npm run build` ok, vitest 185/185, sem estouro horizontal a 390/320 px (home, produtos, login, cadastro, admin dashboard/config/produto novo/IA/pedidos), checagens ao vivo (admin sem login → /login, upload sem login 403, webhook sem assinatura 401/503, retorno com id inválido seguro).
- README reescrito para Windows/PowerShell + seção PayPal. Zip regenerado.

- 2026-10-14: categorias hierárquicas (migração 0002: parent_id, kind CARROS/COLECIONAVEL/OUTROS; testada em loja_e2e com dados e em banco novo), botão "Criar categorias sugeridas", tipo do produto = tipo da categoria (filtros `tipo=miniaturas|bonecos|outros`), home com seção própria de bonecos, menu/página de categoria com subcategorias (só com produto publicado), formulário de produto muda campos/rótulos conforme o tipo, seed com bonecos demo, IA já cobre colecionáveis. vitest 194/194, tsc ok, build ok, produção sem erros de console e sem overflow 390/320.

- 2026-10-15/17 — REVISÃO COMPLETA contra o pedido "MISSÃO: loja profissional de miniaturas e colecionáveis":
  - Dados de origem: seed só com miniaturas/bonecos/acessórios de coleção (DEMO-001..016); migração `0003` esconde demo antigo (infantil/bebê/carga/feira) e devolve a "não configurado" textos/frete que ainda eram os de exemplo (testada em `loja_up` + vitest). Frete NÃO vem mais inventado (entrega desligada até o dono definir; painel e checkout avisam).
  - Home: hero de carros, Marcas (só reais), Destaques, Novidades (sem repetir produto), Miniaturas de carros, área própria de Bonecos e colecionáveis, categorias, acessórios, promoções só se reais, aviso de feiras configurável (`fairsNote`). Estado "Foto em breve" (`NoPhoto`) sem usar imagem de outro produto.
  - Catálogo: filtros categoria/marca/escala/série/condição/preço/promoção/estoque (só os que têm o que escolher; categoria respeita o tipo escolhido); títulos/SEO por tipo; sitemap só com categorias que têm produto.
  - Painel: atributos do produto visíveis por tipo; aviso "defina a entrega"; correção: mensagem "Produto salvo..." sumia ao editar (o formulário era recriado a cada salvamento).
  - Corrigido: selos "Últimas unidades"/"Lacrado" se sobrepunham em cartões estreitos no celular.
  - Verificação real: `tsc` limpo; vitest 206/206; `npm run build` ok; roteiro de navegador em build de produção (banco `loja_final`, PayPal SIMULADO) 24/24 passos OK: vitrine, filtros, sitemap/robots, 404, sem estouro 390/320 px em 9 páginas, painel (config de frete, cadastro carro/boneco, sem foto, publicar/despublicar, validações), compra completa → PAGO, webhook assinado (falso/sem assinatura = 401), reembolso devolve estoque, histórico do cliente. Console: só os 404 intencionais; log do servidor sem erros.
  - NÃO verificado: PayPal real, IA real, servidor com domínio/HTTPS, e-mails (não implementado).

- 2026-10-17/19 — RODADA "IA, InfinitePay, contatos, frete e praticidade":
  - Contatos reais do dono (migração aditiva `0004`, só preenche em branco), botões de WhatsApp/telefone/grupo no rodapé e home, e **"Perguntar sobre este produto no WhatsApp"** na página do produto (mensagem com nome + link). IMPLEMENTADA E VERIFICADA (testes + navegador).
  - **InfinitePay** como forma de pagamento (Checkout Integrado: link de pagamento, retorno, webhook com segredo no endereço, conferência na API antes de marcar "Pago", valor pago >= total, reembolso manual registrado no painel). `tests/infinitepay.test.ts`. **SIMULADA**: só contra InfinitePay simulado; real NÃO validado (precisa InfiniteTag + `INFINITEPAY_WEBHOOK_TOKEN`; campos/valores em centavos assumidos da documentação pública).
  - **Frete pelo CEP** (`src/server/shipping/*`): painel com modo (valor fixo | calculado), endereço de origem, serviços SEDEX/PAC/Mini Envios, acréscimo, dias para postar, declarar valor, item padrão, valor de reserva e **Testar frete**; carrinho "Calcular o frete"; checkout com opções de envio; servidor recalcula SEMPRE, avisa se o valor mudou; cotação feita antes da transação; cache 15 min; reserva só se > 0. Frases da home/produto/assistente não mostram mais o valor de reserva no modo calculado (defeito achado e corrigido nesta rodada). Aviso no Resumo se faltar token/CEP. `tests/frete.test.ts` (+ navegador contra SuperFrete SIMULADA, inclusive serviço fora do ar). **SuperFrete REAL: NÃO validada** (documentação oficial inacessível; endpoint `/api/v0/calculator`, ids PAC 1/SEDEX 2/Mini 17 e resposta são suposições cautelosas; o botão "Testar frete" com o token real confirma). Etiqueta/postagem automática: NÃO IMPLEMENTADA.
  - **Assistente de compras para o cliente** (`/api/assistente`, `shop-assistant.tsx`): só catálogo publicado, cartões de produto com preço/estoque do banco, barreira contra preço/quantidade/percentual inventados, limite por visitante + teto diário (`AI_SHOP_DAILY_LIMIT`), botão de WhatsApp quando só a loja resolve, liga/desliga no painel, escondido sem chave. Corrigido bug real do chat (Esc/foco). `tests/assistente.test.ts` + navegador contra IA **SIMULADA**; IA real NÃO validada.
  - Docs: README e `.env.example` atualizados (InfinitePay, SuperFrete, IA da loja, contatos, migração `0004`).
  - Revisão do caminho do dinheiro (2026-10-19), 3 defeitos reais corrigidos, cada um com teste (que falha sem a correção): (1) no frete pelo CEP, home/produto/assistente mostravam o valor fixo de reserva ou "entrega grátis"; (2) InfinitePay: se a API não conferir o vínculo da transação com o pedido, o endereço de volta de um pedido pago podia quitar outro pedido de mesmo valor, agora um `transaction_nsu`/`slug` só vale para UM pedido (`services/payments.ts`); (3) nome da loja com emoji/travessão/quebra de linha derrubava toda consulta à SuperFrete (cabeçalho User-Agent), agora é higienizado; token com aspas curvas/acento dá aviso claro.
  - Verificação final (2026-10-19): `tsc` limpo; vitest 301/301; `npm run build` ok; roteiro novo de navegador (frete, assistente, painel) 19/19 e roteiro antigo (vitrine, painel, compra → PAGO, webhook, reembolso) 26/26, cada um em banco de teste NOVO, sem erro no log do servidor além das falhas simuladas de propósito; capturas conferidas em 1280/390 px. Os roteiros de navegador não estão no projeto (ficaram fora do zip).
  - NÃO verificado: PayPal/InfinitePay/SuperFrete/IA reais, servidor com domínio e HTTPS, e-mails (não implementado).

## Pendente
- Depende do dono: confirmar o número de WhatsApp (9º dígito); credenciais do pagamento escolhido (PayPal: Client ID/Secret/Webhook ID; InfinitePay: InfiniteTag + segredo do webhook); token da SuperFrete + endereço de postagem + "Testar frete"; chave de IA (`AI_PROVIDER`/`AI_API_KEY`); peso/medidas reais dos produtos (padrão 100 g, 16x11x3 cm é só exemplo); produtos reais; servidor https.
- Não verificado: serviços reais (PayPal, InfinitePay, SuperFrete, IA), publicação em servidor.
- Ideias (não feitas): etiqueta/postagem pela SuperFrete, e-mails de pedido, rastreio automático.

## Retomar
`pg_ctlcluster 16 main start` · `VITE_CONFIG_NATIVE_IGNORE_WARNING=true npx vitest run` · `npx tsc --noEmit` · `npm.cmd run db:migrate`
