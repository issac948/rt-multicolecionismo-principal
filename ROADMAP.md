# ROADMAP — RT Multicolecionismo (Black Friday 27/11/2026 e depois)

Atualizado: 2026-11-22 (domingo). Estado de cada item: veja `STATUS.md`.

## Regras do trabalho

- Todo o desenvolvimento acontece em **cópia de trabalho**; a produção (Netlify + Neon, rtmulticolecionismo.com.br) não é tocada.
- **Sem autorização expressa não há**: push no GitHub, deploy, migração em produção, mudança de DNS, de variáveis de ambiente, de
  pagamentos ou de credenciais, criação de contas externas (Cloudflare, Telegram, e-mail), upgrade da Netlify.
- Migrações só **aditivas**. Testes só em banco separado (`*_test`). Nunca `db:seed -- --reset`.
- Só dados reais: nada de avaliação, venda, estoque, desconto, urgência ou contador inventados.
- InfinitePay e SuperFrete são preservados.
- Nada é marcado "concluído" sem teste real; o que não pode ser testado aqui fica como **Não validado**.

## Riscos reais para colocar a loja em produção (do mais grave ao menor)

1. ~~Repositório incompleto (`.gitignore` com `storage/`).~~ **Resolvido no repositório real** (ZIP de 22/11 confere); o `check:repo` evita a volta.
2. ~~Mistura de versões.~~ O repositório real tem o `package.json` da v2 (Next 16.4.3 e fontes `@fontsource`); os arquivos soltos de 21/11 eram antigos.
3. **Créditos da Netlify (plano grátis: 300/mês, sem recarga).** Acabou, os sites da conta saem do ar. Hoje toda visita é renderizada no servidor e as fotos saem pela Netlify (1 GB de banda = 20 créditos). Estimativa, não medida: 5 mil visitas gastam 100–300 créditos.
4. **Conexão Netlify ↔ repositório novo não verificada**: risco de deploy acidental (15 créditos) ou de produção parada no código antigo.
5. **Backup e restauração** feitos e testados na cópia (P0-04); falta gerar o backup da produção e ensaiar a restauração. O restore do Neon grátis cobre só 6 h.
6. **Pagamentos e frete nunca testados de verdade** (só com servidores simulados). Webhook em produção: não validado.
7. ~~Estoque preso~~ Feito na cópia (P0-05): padrão 45 min e liberação ao abrir produto/carrinho e ao criar pedido. Falta ajustar o valor salvo na produção (Configurações).
8. **Você não é avisado de nada** (sem e-mail, sem Telegram): venda nova só aparece se abrir o painel.
9. **Credenciais**: confirmar que não existe o admin padrão `admin@loja.local` do seed e que `CRON_SECRET` e o token do webhook estão definidos.
10. **Next 16.4.3**: 7 avisos moderados no `npm audit`. Corrigidos na 16.4.6 (testado na cópia); falta a sua aprovação para subir a versão.
11. **Sem páginas legais nem dados do vendedor** (privacidade/LGPD, trocas e arrependimento, prazos, termos, FAQ, CNPJ/CPF e contato).
12. **Limite de requisições em memória** (por instância serverless) e ausente no carrinho.
13. ~~Migração sem trava.~~ Feito na cópia (P0-03): destino mascarado e confirmação para banco remoto.

## Autorizações que dependem de você

| # | Ação | Para quê |
|---|---|---|
| 1 | Enviar o ZIP do GitHub (Code → Download ZIP) **ou** vincular o GitHub (claude.ai → Settings → Connectors, com acesso ao repositório) | auditar o repositório real |
| 2 | Aplicar `.gitignore` corrigido, `scripts/check-repo.mjs` e o resto no repositório (por você, ou por mim só se você der acesso de escrita e mandar) | P0-01 |
| 3 | Conferir no painel da Netlify: repositório, branch de produção, "auto publish", build command, variáveis | P0-02, P0-07 |
| 4 | Rodar `npm.cmd run db:check` com o `DATABASE_URL` de produção (somente leitura) e colar a saída | P0-03, P0-07 |
| 5 | Gerar o backup antes de qualquer publicação | P0-04 |
| 6 | Aprovar o Next 16.4.6 (a 16.4.3 foi a única versão que você autorizou) | P0-06 |
| 7 | Aplicar a migração 0006 na produção, depois do backup | P1-03, P1-06, P1-07, P1-12 |
| 8 | Deploy único, depois da sua revisão | tudo |
| 9 | Criar conta/bucket Cloudflare R2 e variáveis `S3_*` | P1-02 |
| 10 | Criar o bot do Telegram e as variáveis | P1-08 |
| 11 | Netlify Personal (US$ 9/mês) em novembro | seguro contra o limite de créditos |
| 12 | Teste real de pagamento e frete (valor baixo) | P0-08 |
| 13 | Dados do vendedor (razão social, CNPJ/CPF, e-mail, endereço de contato) e valores reais de ofertas, cupons e frete grátis | P1-10, P1-12 |

## Sequência de implementação

| Dia | Itens | Entrega |
|---|---|---|
| Dom 22 | P0-01, P0-03, P0-04, P0-05, P0-06 | pacote P0 para você aplicar no repositório (patch + ZIP) |
| Seg 23 | P1-03, P1-04, P1-01, P1-13 | promoções programadas, campanha, cache; capturas da direção visual |
| Ter 24 | P1-05, P1-06, P1-08 | visual novo, carrinhos ao vivo, Telegram |
| Qua 25 | P1-07, P1-09, P1-10, P1-11 (P1-12 se couber) | cadastro rápido, operação, páginas legais, CEP; suíte completa; **ZIP de revisão à noite** |
| Qui 26 | revisão, ajustes, P0-08, P1-14 | backup, migração 0006 e **deploy único**, só com sua autorização |
| Sex 27 | monitoramento | checklist da Black Friday |

O que não passar nos testes **sai do escopo da Black Friday** e vai para a fase seguinte. Compra sem conta (P2-01) só entra se sobrar tempo e todos os testes de pedido, estoque, pagamento e webhook passarem.

---

## P0 — Obrigatório para produção

### P0-01 · Repositório completo e build reproduzível — feito na cópia; falta o repositório real
- **Benefício:** acaba o "módulo não encontrado" no deploy; garante que o GitHub tem tudo o que roda.
- **Arquivos:** `.gitignore`, `scripts/check-repo.mjs`, `tests/check-repo.test.ts`, `package.json` (`prebuild`, `check:repo`).
- **Dependências / externo:** acesso ao repositório real (GitHub).
- **Risco:** baixo. **Migração:** não.
- **Teste:** `npm run check:repo` em 3 cenários (v2 corrigida: OK; `.gitignore` antigo: 8 arquivos; `package.json` antigo: 3 imports de CSS) e 10 testes automáticos.
- **Concluído quando:** `npm run check:repo` dá OK num clone/ZIP do GitHub e o build da Netlify passa.

### P0-02 · Conexão Netlify ↔ repositório novo e deploy sem acidente
- **Benefício:** produção só atualiza do repositório certo, só quando você autorizar.
- **Arquivos:** nenhum (painel da Netlify); passo a passo em `DEPLOYMENT.md`.
- **Dependências / externo:** você, no painel da Netlify. **Risco:** alto se mal feito (deploy acidental de 15 créditos ou produção parada). **Migração:** não.
- **Teste:** checklist com capturas de tela suas; nenhum deploy sem autorização. **Não validado** por mim.
- **Concluído quando:** você confirma repositório, branch, "auto publish" e variáveis como combinado.

### P0-03 · Migração com trava e checagem somente leitura do banco de produção — feito e testado na cópia; falta você rodar `db:check` na produção
- **Benefício:** nunca migrar o banco errado; saber o estado real da produção.
- **Arquivos:** `scripts/migrate.ts` (mostrar destino mascarado; confirmar fora do localhost), novo `scripts/db-check.ts`, `package.json` (`db:check`), testes.
- **Dependências / externo:** `DATABASE_URL` de produção só na sua máquina (nunca em chat). **Risco:** baixo (só `SELECT`). **Migração:** não.
- **Arquivos reais:** `scripts/lib/db-target.ts`, `scripts/lib/db-report.ts`, `scripts/db-check.ts`, `scripts/migrate.ts`, `tests/db-guard.test.ts`, `tests/db-check.test.ts`.
- **Teste:** 22 testes novos (máscara, trava, relatório, somente leitura, migração pendente, coluna ausente) + execução em banco vazio (simular → aplicar → repetir); você roda `npm.cmd run db:check` em produção.
- **Concluído quando:** `db:check` lista as migrações aplicadas (0000–0005), contas ADMIN (e-mail mascarado), produtos DEMO, driver de fotos, tamanho e contagens, sem erro, e alerta `admin@loja.local`.

### P0-04 · Backup, verificação e restauração — feito e testado na cópia; falta o backup da produção
- **Benefício:** voltar atrás se migração ou deploy falhar (restore do Neon grátis: só 6 h).
- **Arquivos:** novos `scripts/backup.ts`, `scripts/backup-verify.ts`, `scripts/backup-restore.ts` (só para banco de teste); `DEPLOYMENT.md` (restauração pelo Neon e por `pg_dump`).
- **Dependências / externo:** sua máquina com acesso ao banco; Neon (leitura). **Risco:** baixo. **Migração:** não.
- **Arquivos reais:** `scripts/lib/backup.ts`, `scripts/backup.ts`, `scripts/backup-verify.ts`, `scripts/backup-restore.ts`, `package.json` (`backup`, `backup:verify`, `backup:restore`), `tests/backup.test.ts`.
- **Decisões:** fica de fora `sessions` e `password_reset_tokens`; entram hashes de senha (sem eles ninguém consegue entrar depois de restaurar) — por isso o backup deve ficar fora do projeto. Restauração só em banco migrado e vazio, numa transação.
- **Teste:** 9 testes (somente leitura, adulteração, restauração idêntica) + execução pela linha de comando em banco local.
- **Concluído quando:** backup de produção gerado e verificado por você, e restauração ensaiada em banco de teste.

### P0-05 · Reserva de estoque e compras simultâneas — feito e testado na cópia; falta ajustar o prazo salvo na produção
- **Benefício:** peça única não fica presa; evita "esgotado" falso e venda dupla.
- **Arquivos:** `src/server/services/settings.ts` (janela padrão 120 → 45 min), `src/server/services/orders.ts` e `cart.ts` (liberar reservas vencidas ao criar pedido e ao consultar o item), `src/server/services/maintenance.ts`, `tests/orders.test.ts`, `tests/inventory.test.ts`.
- **Dependências / externo:** nenhuma; se a produção já tiver a janela salva em Configurações, ajustar lá. **Risco:** médio (mexe em estoque). **Migração:** não.
- **Arquivos reais:** `src/server/services/reservations.ts` (novo), `settings.ts`, `actions/admin.ts`, `orders.ts`, `cart.ts`, `products.ts`, `tests/reservas.test.ts`, `tests/manutencao-espaco.test.ts` (ajustado).
- **Decisão registrada:** antes, a loja pública nunca escrevia no banco por conta própria. Agora catálogo/produto/carrinho podem cancelar pedidos vencidos (consulta indexada, no máximo 1x/30 s por instância, até 200 pedidos, nunca lança erro na página).
- **Teste:** reserva vencida libera ao abrir produto, catálogo, carrinho e ao criar pedido; intervalo de 30 s; pedido pago intocado; falha do banco não derruba a página; 6 liberações simultâneas devolvem o estoque uma vez. Já existiam: 10 e 20 compradores em paralelo (`inventory.test.ts`) e pagamento tardio de pedido expirado (`payments.test.ts`).
- **Concluído quando:** testes novos passam, suíte completa verde, padrão de 45 min.

### P0-06 · Next.js 16.4.6 (patch de segurança) — testado na cópia; aguarda sua aprovação
- **Benefício:** fecha 7 avisos moderados do `npm audit` da 16.4.3.
- **Arquivos:** `package.json`, `package-lock.json`.
- **Dependências / externo:** sua aprovação. **Risco:** baixo a médio (patch). **Migração:** não.
- **Teste:** `npm audit`, `tsc`, suíte completa, `next build`, navegação manual.
- **Concluído quando:** lockfile em 16.4.6 e tudo verde.

### P0-07 · Segredos, credenciais e variáveis de produção — scanner pronto; falta rodar no histórico real e conferir a Netlify
- **Benefício:** nada exposto; admin padrão fora; `CRON_SECRET`, token do webhook InfinitePay e `SITE_URL` corretos.
- **Arquivos:** `.env.example`, `SECURITY.md`, `DEPLOYMENT.md`, `db:check`.
- **Dependências / externo:** você (variáveis na Netlify). **Risco:** baixo. **Migração:** não.
- **Teste:** varredura de segredos no código e no histórico Git do repositório real (feita só na v2: limpa); `db:check` lista admins.
- **Concluído quando:** checklist de variáveis confirmado por você; sem segredos no histórico.

### P0-08 · Teste real ponta a ponta em produção (pagamento, frete, webhook)
- **Benefício:** só dizer "funciona" depois de funcionar.
- **Arquivos:** roteiro em `DEPLOYMENT.md`.
- **Dependências / externo:** sua autorização e contas InfinitePay/PayPal/SuperFrete. **Risco:** médio (dinheiro real, valor baixo). **Migração:** não.
- **Teste:** pedido → pagamento → webhook → PAGO → estoque baixado → cancelar/reembolsar e registrar.
- **Concluído quando:** um pedido real de valor baixo percorre todo o ciclo e o resultado fica em `STATUS.md` como "Testado em produção".

---

## P1 — Obrigatório para a Black Friday

### P1-01 · Cache das páginas públicas (fim do `force-dynamic` global)
- **Benefício:** cada visita deixa de renderizar no servidor e de consultar o Neon: menos créditos, mais velocidade.
- **Arquivos:** `src/app/layout.tsx`, `src/app/(shop)/page.tsx`, `produtos/page.tsx`, `produtos/[slug]/page.tsx`, `categoria/[slug]/page.tsx`, `src/components/shop/site-header.tsx` e `header-client.tsx` (parte pessoal vira cliente), `src/server/services/products.ts` e `settings.ts`, ações do painel (revalidação).
- **Dependências / externo:** nenhuma; o comportamento do cache na Netlify real só se prova com deploy. **Risco:** médio a alto (preço/estoque desatualizados na vitrine). Mitigação: revalidar ao salvar produto/estoque/pedido e a cada 60 s; carrinho e checkout continuam validando no servidor. **Migração:** não.
- **Teste:** o build mostra home, categoria e produto como cacheáveis; editar preço/estoque no painel atualiza a vitrine; usuário logado vê nome e carrinho; consultas ao banco por visita medidas antes e depois.
- **Concluído quando:** rotas públicas cacheáveis no build, edição refletida em até 5 s, suíte verde.

### P1-02 · Fotos no Cloudflare R2 (plano pronto; execução só com sua autorização)
- **Benefício:** tira a maior parte da banda da Netlify (1 GB = 20 créditos) e o espaço do Neon (1 GB). R2: 10 GB grátis, sem cobrança de saída (página oficial, 21/11).
- **Arquivos:** `src/server/storage/s3.ts` e `scripts/storage-migrate.ts` (já existem), `.env.example`, `DEPLOYMENT.md` (bucket, chave de acesso, URL pública ou domínio de imagens, variáveis `S3_*` e `STORAGE_PUBLIC_BASE_URL`, cópia, conferência de integridade por tamanho e hash, **rollback** = voltar `STORAGE_DRIVER=database`, fotos só saem do banco depois da sua confirmação).
- **Dependências / externo:** conta Cloudflare, bucket, chaves, variáveis na Netlify (tudo seu). **Risco:** médio (URLs, CORS). **Migração:** não.
- **Teste:** `tests/s3.test.ts` e `tests/transferencia-fotos.test.ts` (existentes) + teste de integridade e de rollback. **Bucket real: não validado.**
- **Concluído quando:** todas as fotos copiadas com hash conferido, site servindo do bucket em teste e rollback ensaiado.

### P1-03 · Promoções programadas e histórico de preços — exige migração 0006
- **Benefício:** a promoção liga e desliga sozinha; "de/por" só com preço realmente praticado.
- **Arquivos:** `src/server/db/schema.ts` e `drizzle/0006_*.sql` (colunas `sale_starts_at`, `sale_ends_at`; tabela `product_price_events`), `src/lib/pricing.ts` (novo), `src/server/services/products.ts`, `src/components/shop/product-card.tsx`, página de produto, `cart.ts`/`orders.ts` (preço efetivo no servidor), `src/components/admin/product-form.tsx`, ferramenta de promoção em massa no painel.
- **Dependências / externo:** aprovar a 0006 (produção só depois do backup). **Risco:** médio (preço do pedido). **Migração:** **sim**, aditiva.
- **Teste:** preço efetivo antes/durante/depois da janela (relógio simulado, fuso America/Sao_Paulo); pedido mantém o preço de quando foi criado; histórico registra cada mudança; alerta se o preço de referência subiu nos últimos 30 dias.
- **Concluído quando:** promoção 27/11 00:00 a 30/11 23:59 liga e desliga sozinha nos testes e nenhum "de" aparece sem histórico.

### P1-04 · Módulo de campanha "Black Friday RT"
- **Benefício:** banner, página `/black-friday`, produtos realmente em oferta, contagem regressiva só com data real; encerra sozinha.
- **Arquivos:** `src/server/services/settings.ts` (campanha: título, datas, textos, ativa), `src/app/admin/campanha/page.tsx` (novo), `src/app/(shop)/black-friday/page.tsx` (novo), `src/components/shop/campaign-banner.tsx` (novo), `src/app/(shop)/page.tsx`.
- **Dependências / externo:** P1-03. **Risco:** baixo. **Migração:** não (usa `settings`).
- **Teste:** campanha inativa ou fora da janela não aparece; contagem usa a data cadastrada; a página lista só produtos com promoção ativa.
- **Concluído quando:** ligar/desligar pelo painel e encerramento automático comprovados em teste e no navegador.

### P1-05 · Visual: design system, home, cards, produto, navegação mobile
- **Benefício:** identidade profissional mantendo preto, dourado, vermelho e a logo oficial; celular em primeiro lugar; a identidade continua boa depois do dia 27.
- **Arquivos:** `src/app/globals.css` (tokens), `src/components/ui.tsx`, `src/components/shop/*` (cabeçalho, rodapé, cards, galeria, filtros), `src/app/(shop)/page.tsx`, `produtos/[slug]/page.tsx`; novos: barra inferior, gaveta de filtros, mini-carrinho, barra fixa de compra.
- **Dependências / externo:** sua aprovação da direção visual (capturas na segunda). **Risco:** médio (regressões visuais e de acessibilidade). **Migração:** não.
- **Teste:** capturas em 320, 375, 768 e 1280 px; foco e contraste AA; tipos, suíte e build; peso e Core Web Vitals locais antes/depois.
- **Concluído quando:** você aprova as capturas e não há regressão nos testes.

### P1-06 · Carrinhos ao vivo (prova social real + painel)
- **Benefício:** mostra atividade real sem pressão falsa e te dá visão dos carrinhos.
- **Arquivos:** novos `src/server/services/cart-activity.ts`, `src/app/api/atividade/route.ts` (cache curto), `src/components/shop/cart-activity-badge.tsx`, `src/app/admin/ao-vivo/page.tsx`; `src/server/services/dashboard.ts`; opcional tabela `cart_events` para o funil (0006).
- **Dependências / externo:** P1-01 (cache) e P1-08 (alertas). **Risco:** baixo a médio (robôs inflando números; privacidade). Mitigação: limite de requisições, só mostra se houver outro carrinho ativo nos últimos 30 min, sem nomes, dados pessoais só no painel. **Migração:** só para o funil.
- **Teste:** contagem exclui o próprio carrinho e os antigos; nada aparece com zero; texto "não reservado até finalizar"; endpoint com cache; painel mostra visitante ou cliente, valor, tempo, abandonados e ranking.
- **Concluído quando:** selo e painel funcionam com dados reais no teste E2E e o endpoint faz no máximo uma consulta por janela de cache.

### P1-07 · Cadastro rápido no celular, lote, fotos pelo SKU, publicação agendada
- **Benefício:** cadastrar produto em poucos toques; centenas de itens sem cansar.
- **Arquivos:** novos `src/app/admin/produtos/rapido/page.tsx`, `src/app/admin/produtos/lote/page.tsx`, `src/components/admin/quick-product-form.tsx`; `src/lib/product-csv.ts` e `product-import-form.tsx` (fotos pelo SKU); `src/server/services/products.ts` (rascunhos, `publish_at`); `src/server/ai/product-assistant.ts` (colar/ditar várias linhas; a IA nunca publica).
- **Dependências / externo:** chave de IA só para o recurso de IA. **Risco:** médio. **Migração:** sim (coluna `publish_at`, aditiva).
- **Teste:** foto → nome → preço → estoque → publicar e próximo; lote de 20 fotos = 20 rascunhos; foto `SKU.jpg` associada ao produto certo; publicação agendada só aparece na hora; IA não inventa escala, ano nem raridade.
- **Concluído quando:** um produto é cadastrado e publicado em 5 passos no celular (teste manual em 375 px) e os testes automáticos passam.

### P1-08 · Alertas no Telegram (opcional)
- **Benefício:** você sabe na hora de pedido novo, pago, estoque baixo, última unidade no carrinho, carrinho acima de um valor e erro importante.
- **Arquivos:** novo `src/server/notifications/telegram.ts`; chamadas em `orders.ts`, `cart-activity.ts`, estoque; `.env.example` (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`); `SECURITY.md`.
- **Dependências / externo:** bot do Telegram e variáveis na Netlify (você). **Risco:** baixo (envio assíncrono, com tempo limite; falha nunca derruba o pedido). **Migração:** não.
- **Teste:** servidor Telegram simulado; token nunca aparece em log; falha não bloqueia pedido. **Mensagem real: não validada.**
- **Concluído quando:** os 6 eventos geram mensagem no teste simulado e uma mensagem real de teste chega ao seu Telegram.

### P1-09 · Operação de pedidos e painel "Modo Black Friday"
- **Benefício:** separar e enviar mais rápido; indicadores reais.
- **Arquivos:** `src/app/admin/pedidos/page.tsx` e `[id]/page.tsx`, `src/components/admin/order-admin-actions.tsx`, novo `src/app/api/admin/pedidos/exportar/route.ts` (CSV), página de impressão, `src/server/services/dashboard.ts`, `src/app/admin/dashboard/page.tsx`.
- **Dependências / externo:** nenhuma. **Risco:** baixo. **Migração:** não.
- **Teste:** CSV com acentos e valores corretos; só ADMIN acessa; indicadores vazios mostram "sem dados".
- **Concluído quando:** exportar CSV, copiar endereço, imprimir separação e marcar enviado com rastreio funcionam e os números batem com o banco de teste.

### P1-10 · Páginas legais e dados do vendedor
- **Benefício:** confiança e adequação (LGPD, CDC): privacidade, trocas e devoluções, direito de arrependimento, prazos de entrega, termos, FAQ e contato.
- **Arquivos:** novas rotas em `src/app/(shop)/` (`politica-de-privacidade`, `trocas-e-devolucoes`, `prazos-e-entrega`, `termos-de-uso`, `faq`, `contato`), `src/components/shop/site-footer.tsx`, `src/server/services/settings.ts` e `settings-form.tsx` (razão social, CNPJ/CPF, e-mail, endereço de contato; só aparece o que for preenchido), `src/app/sitemap.ts`.
- **Dependências / externo:** você revisa (e, se quiser, um profissional jurídico). O Claude não é advogado: são **textos-base**. **Risco:** baixo. **Migração:** não.
- **Teste:** páginas existem e entram no sitemap; o rodapé só mostra dados preenchidos; links no checkout.
- **Concluído quando:** 6 páginas no ar, links no rodapé e no checkout, textos aprovados por você.

### P1-11 · Checkout: CEP automático, máscaras e frete na página do produto
- **Benefício:** menos digitação e menos desistência.
- **Arquivos:** `src/components/shop/checkout-form.tsx`, `use-shipping-quote.ts*`, `shipping-calculator.tsx`, página de produto, novo `src/lib/cep.ts` (ViaCEP/BrasilAPI, com falha tolerada), `src/app/api/frete/route.ts`.
- **Dependências / externo:** ViaCEP/BrasilAPI (gratuitos; disponibilidade **não validada**). **Risco:** baixo (campos continuam editáveis). **Migração:** não.
- **Teste:** máscara e validação de CPF e telefone; CEP com API simulada e com falha; cotação na página do produto.
- **Concluído quando:** digitar o CEP preenche rua, bairro, cidade e UF, e o frete aparece na página do produto.

### P1-12 · Cupons e barra de frete grátis — exige migração 0006 (entra se couber)
- **Benefício:** cupons para o grupo do WhatsApp; incentivo a aumentar o pedido.
- **Arquivos:** schema e `drizzle/0006_*.sql` (`coupons`, `coupon_redemptions`, `orders.discount_cents` e `coupon_code`), novo `src/server/services/coupons.ts`, `orders.ts`, carrinho e checkout, `src/app/admin/cupons/page.tsx`, `freeShippingThresholdCents` em `settings`.
- **Dependências / externo:** você define cupons e valores reais. **Risco:** médio a alto (mexe no total e no valor enviado ao InfinitePay, que precisa ser igual ao total do pedido). **Migração:** sim, aditiva.
- **Teste:** percentual e fixo, validade, mínimo, limite de usos (corrida entre dois pedidos), desativado, registro no pedido; valor enviado ao InfinitePay = total com desconto; barra só com valor configurado.
- **Concluído quando:** todos os casos passam e um pedido com cupom fecha o ciclo no servidor simulado do InfinitePay.

### P1-13 · Limite de requisições e proteção de rotas caras
- **Benefício:** evita carrinhos falsos, abuso do assistente de IA e do frete.
- **Arquivos:** `src/server/security/rate-limit.ts`, `src/server/actions/cart.ts`, `src/app/api/assistente/route.ts`, `src/app/api/frete/route.ts`, `src/app/api/atividade/route.ts`.
- **Dependências / externo:** nenhuma. **Risco:** baixo (limites generosos). **Migração:** não. Limitação registrada: o limite continua por instância serverless.
- **Teste:** passar do limite devolve 429 com mensagem clara; uso normal não é afetado.
- **Concluído quando:** ações do carrinho e do assistente têm limite testado.

### P1-14 · Medição de desempenho e estimativa de créditos
- **Benefício:** decidir com números, não com palpite.
- **Arquivos:** novo `scripts/medir-paginas.mjs` (Playwright: peso, requisições, LCP/CLS locais), `TESTS.md`, `DEPLOYMENT.md`.
- **Dependências / externo:** o consumo real de créditos só aparece no painel da Netlify (você). **Risco:** baixo. **Migração:** não.
- **Teste:** relatório antes e depois.
- **Concluído quando:** tabela com KB, nº de requisições e LCP/CLS locais de home, categoria, produto e carrinho, e estimativa de créditos para 1.000 e 5.000 visitas (marcada como estimativa).

---

## P2 — Importante para o crescimento

| ID | Melhoria | Migração | Serviço externo | Observação |
|---|---|---|---|---|
| P2-01 | Compra sem conta (convidado), acompanhamento por link com código | sim (`orders.user_id` opcional, token de acesso) | não | **etapa separada**; mexe em pedidos e no acesso a dados pessoais; só com testes rigorosos de pedido, estoque, pagamento e webhook |
| P2-02 | E-mails: pedido recebido, pago, enviado, rastreio, senha | não | provedor de e-mail + DNS (SPF/DKIM) | não afirmar que funciona sem envio real |
| P2-03 | Origem dos pedidos (UTM, WhatsApp, Instagram) | sim, aditiva (`orders.utm_*`) | não | sem cookie de terceiros |
| P2-04 | SEO: canonical, robots, alt text, Open Graph por produto | não | não | sitemap e JSON-LD já existem |
| P2-05 | Recuperação de carrinho assistida pelo painel | não | não | contato manual, discreto |
| P2-06 | Histórico de alterações de produtos (auditoria) | sim | não | |
| P2-07 | Feed de produtos para Google Merchant e catálogo do Instagram | não | conta Google/Meta | |
| P2-08 | Relatórios comerciais (ticket médio, mais vendidos, conversão, campanhas) | não | não | só dados reais |

## P3 — Evolução futura

Lista de desejos · aviso de reposição ("avise-me quando chegar") · avaliações verificadas de compradores · Web Push do painel ·
CSP e endurecimento de segurança · limite de requisições global (banco/borda) · combos e kits · IA com leitura de foto para cadastro ·
recomendações inteligentes · relatórios avançados · monitoramento de disponibilidade.
