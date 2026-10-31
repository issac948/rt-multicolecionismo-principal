# RT Multicolecionismo — loja virtual

Loja virtual (vitrine, carrinho, checkout, pagamento, pedidos, estoque e painel administrativo) da **RT Multicolecionismo**, de Curitiba: miniaturas de carros colecionáveis (Hot Wheels, Mini GT, Matchbox e outras, lacradas ou soltas), bonecos e outros colecionáveis. O dono gerencia tudo pelo navegador, **sem mexer em código**.

> **Leia primeiro:** [O que está pronto e o que ainda depende de você](#o-que-está-pronto-e-o-que-ainda-depende-de-você). Ela diz com honestidade o que foi testado de verdade e o que precisa de credenciais reais.

---

## Sumário

1. [O que é](#o-que-é)
2. [O que está pronto e o que ainda depende de você](#o-que-está-pronto-e-o-que-ainda-depende-de-você)
3. [O que o dono precisa configurar](#o-que-o-dono-precisa-configurar)
4. [Requisitos](#requisitos)
5. [Rodar no seu computador (Windows PowerShell)](#rodar-no-seu-computador-windows-powershell)
6. [Variáveis de ambiente](#variáveis-de-ambiente)
7. [Banco de dados e migrations](#banco-de-dados-e-migrations)
8. [Criar o administrador e recuperar senhas](#criar-o-administrador-e-recuperar-senhas)
9. [Produtos de demonstração](#produtos-de-demonstração)
10. [Publicar na internet: servidor próprio (VPS)](#publicar-na-internet-produção)
11. [Publicar no Netlify + Neon (planos gratuitos): limites e cuidados](#publicar-no-netlify--neon-planos-gratuitos)
12. [PayPal (pagamento)](#paypal-pagamento)
13. [InfinitePay (pagamento, maquininha)](#infinitepay-pagamento)
14. [Mercado Pago (opcional)](#mercado-pago-opcional)
15. [Frete pelo CEP (SEDEX / SuperFrete)](#frete)
16. [Assistente de IA (painel e clientes)](#assistente-de-ia)
17. [Eventos (calendário público e painel)](#eventos-calendário)
18. [Importação de produtos por planilha (CSV)](#importação-de-produtos-por-planilha-csv)
19. [Imagens e armazenamento (banco, pasta ou serviço externo)](#imagens-e-armazenamento)
20. [Manutenção automática](#manutenção-automática)
21. [Backup, segurança, testes e estrutura](#atualizar-a-loja-e-fazer-backup)

---

## O que é

**Negócio:** a RT **não tem loja física**; o dono vende em feiras e agora também aqui, que é a loja online oficial. O sistema não inventa endereço, rede social nem data de evento: isso só aparece depois que o dono cadastra em **Configurações** e em **Eventos**. O WhatsApp/telefone (+55 41 9141-9031) e o grupo de clientes do WhatsApp já vêm preenchidos com o que o dono informou (confira o número, veja abaixo).

**Para o cliente:** página inicial (miniaturas de carros em primeiro lugar, com Destaques e Novidades; bonecos e colecionáveis em área própria), catálogo com filtros (categoria, marca, escala, série, lacrado/solto, tipo, preço, promoção, estoque — só aparecem filtros que têm o que escolher), categorias, busca, página de cada produto, carrinho (guardado mesmo sem login), checkout, **frete calculado pelo CEP** (SEDEX/PAC, quando o dono liga), pagamento (**PayPal, InfinitePay ou Mercado Pago**, o que o dono escolher), "Minha conta", "Meus pedidos", acompanhamento do pedido e um **assistente de compras com IA** (opcional) que ajuda a achar miniaturas e responde dúvidas de entrega e pagamento. A retirada é "em mãos", combinada com a loja. Há botões de WhatsApp (inclusive "Perguntar sobre este produto no WhatsApp", que já leva o nome e o link do produto), telefone e grupo de clientes. O **calendário de eventos** (`/eventos` e um bloco na página inicial) mostra, mês a mês, onde e quando a loja estará presente. O visual foi pensado primeiro para o **celular** (menu em gaveta, busca, faixas de produtos que rolam de lado, foto do produto que amplia até o tamanho real) e também funciona em tablet e computador.

**Para o dono (`/admin`):** resumo, cadastro/edição de produtos com várias fotos (os dados de colecionador — marca, modelo, escala, série, ano, lacrado/solto, estado da embalagem, conservação — são **todos opcionais**), categorias, estoque com histórico, pedidos (enviar, rastreio, reembolsar), clientes (gera link para o cliente criar nova senha), configurações (nome, logo, WhatsApp, telefone, link do grupo de WhatsApp, **seu endereço de postagem e como o frete é calculado**, assistente da loja), **eventos** (datas, horários, local e foto, com **modelos** reutilizáveis), **cadastro rápido de produtos** (duplicar, filtros, edição ágil), **importação de produtos por planilha (CSV)** com pré-visualização e confirmação, um **medidor de espaço das fotos** no Resumo, e um assistente de IA que **sugere** o cadastro (nada é publicado sem o dono confirmar).

**Tecnologia:** Next.js 16 (React 19, TypeScript), PostgreSQL 16, Drizzle ORM, Tailwind CSS 4. Dinheiro em **centavos inteiros**. Roda em servidor próprio (VPS) ou no **Netlify + Neon** (veja [os limites dos planos gratuitos](#publicar-no-netlify--neon-planos-gratuitos)).

---

## O que está pronto e o que ainda depende de você

| Área | Situação |
|---|---|
| Loja pública, catálogo com filtros de colecionáveis, carrinho, checkout, login/cadastro, minha conta, pedidos | **IMPLEMENTADA E VERIFICADA** (testes automatizados + navegador Chromium; sem estouro de tela em 390 px e 320 px nas páginas verificadas) |
| Identidade visual (logo oficial, preto/dourado/vermelho), home, cabeçalho, rodapé | **IMPLEMENTADA E VERIFICADA** (conferida em capturas de tela) |
| Preços, estoque e total recalculados no servidor; estoque transacional | **IMPLEMENTADA E VERIFICADA** (testes, inclusive compras simultâneas) |
| Painel administrativo (produtos, categorias, estoque, pedidos, clientes, configurações) | **IMPLEMENTADA E VERIFICADA** |
| Login, permissões CLIENTE/ADMIN, proteção CSRF, recuperação de senha por link gerado pelo admin | **IMPLEMENTADA E VERIFICADA** |
| Migração do banco (aditiva, sem apagar dados) | **IMPLEMENTADA E VERIFICADA** em bancos de teste |
| Produtos de demonstração (seed aditivo + botão para remover) | **IMPLEMENTADA E VERIFICADA** |
| **Pagamento PayPal** (criar pedido, cliente aprova, loja cobra e confere na API, webhook assinado, reembolso) | **SIMULADA.** Lógica testada **somente contra um PayPal simulado** (`tests/paypal.test.ts`). **PayPal real: BLOQUEADA** até o dono informar Client ID, Secret e Webhook ID (sandbox primeiro). Não validado com o PayPal real. |
| **Pagamento InfinitePay** (link de pagamento Pix/cartão, volta à loja, webhook, conferência na API antes de marcar "Pago") | **SIMULADA.** Lógica testada **somente contra um InfinitePay simulado** (`tests/infinitepay.test.ts`). **InfinitePay real: NÃO validado.** Precisa da sua InfiniteTag e de um segredo do webhook no `.env`; confirme com o InfinitePay que a sua conta tem o "Checkout Integrado". O reembolso é **manual** (você devolve pelo app e marca no pedido). |
| Assistente de IA do painel (campos de colecionável, lista do que faltou) | **SIMULADA.** Testado com respostas simuladas; **não validado** com um serviço de IA real (falta a chave). |
| **Assistente de compras para o cliente** (chat na loja: acha produtos, explica entrega e pagamento) | **SIMULADA.** Interface, limites, proteções e testes (`tests/assistente.test.ts` + navegador) feitos contra uma IA **simulada**; **não validado** com IA real. Preços e estoque mostrados vêm do banco, nunca do texto da IA; aparece só com chave configurada e pode ser desligado no painel. |
| **Frete pelo CEP** (SEDEX, PAC, Mini Envios pela SuperFrete; origem, acréscimo, prazo de postagem, peso e medidas padrão configuráveis no painel; valor fixo de reserva; retirada em mãos) | **IMPLEMENTADA E VERIFICADA contra uma SuperFrete SIMULADA** (`tests/frete.test.ts` + navegador, inclusive SuperFrete fora do ar e valor mudando na hora do pagamento). **SuperFrete REAL: NÃO validada** (a documentação oficial não pôde ser consultada). Use a seção **Testar o frete** do painel com o seu token antes de ligar. |
| Emissão de etiqueta / postagem automática (SuperFrete) | **NÃO IMPLEMENTADA.** A loja só calcula o preço e o prazo; a etiqueta e a postagem você faz pela SuperFrete ou agência. |
| Contatos do dono (WhatsApp/telefone e grupo) | **IMPLEMENTADA E VERIFICADA** (migração aditiva `0004` só preenche o que estiver em branco). **Confira o número:** foi informado com 8 dígitos depois do DDD; celular costuma ter 9. |
| Limpeza de dados antigos de demonstração (migração `0003`) | **IMPLEMENTADA E VERIFICADA** em banco de teste com o formato antigo: esconde só os produtos/categorias de demonstração do seed antigo (nome e texto idênticos aos do seed) e troca textos/frete só se ainda forem os de exemplo. Nada é apagado. |
| E-mails (confirmação de pedido, recuperação de senha por e-mail) | **NÃO IMPLEMENTADA.** O cliente acompanha o pedido no site e pelo WhatsApp. |
| **Visual novo e uso no celular** (cabeçalho com gaveta e busca, faixas de produtos, filtros em coluna no computador, ampliação de foto até o tamanho real, tabelas do painel viram cartões no celular, estados de carregando/vazio/erro/sucesso) | **IMPLEMENTADA E VERIFICADA** no Chromium: celular emulado (320, 360 e 390 px), tablet (768 px) e computador (1024 e 1280 px), sem estouro lateral nas páginas conferidas; auditoria de acessibilidade com axe-core sem violações; roteiro de interação do celular e do computador. **NÃO testado em aparelhos reais** (Android/iPhone) nem em Safari/Firefox. |
| **Calendário de eventos** (público, bloco na página inicial, painel, modelos reutilizáveis, participação por data, cancelar e excluir com confirmação) | **IMPLEMENTADA E VERIFICADA** (testes automatizados + roteiro no navegador). A migração `0005` foi aplicada **só em bancos de teste**; no banco real quem aplica é você (veja [Banco de dados e migrations](#banco-de-dados-e-migrations)). |
| **Fotos no PostgreSQL** (padrão no Netlify), com teto de espaço, medidor no Resumo e compressão no navegador | **IMPLEMENTADA E VERIFICADA** em PostgreSQL local. **Neon real: NÃO validado.** O crescimento do banco é uma **estimativa** (veja [Imagens e armazenamento](#imagens-e-armazenamento)). |
| **Fotos em serviço externo** (Cloudflare R2, Neon Object Storage ou outro compatível com S3) e cópia banco → serviço (`storage:migrate`) | **IMPLEMENTADA E VERIFICADA** contra um servidor S3 **simulado** (assinatura conferida com exemplos publicados da AWS). **R2 e Neon Object Storage reais: NÃO validados.** |
| **Manutenção automática no Netlify** (função agendada de hora em hora) + rede de segurança quando o dono abre o painel | **IMPLEMENTADA E VERIFICADA** no que roda aqui (rota protegida por segredo, trava de 10 minutos, cada tarefa, testes). **O agendador do Netlify NÃO foi testado**: ele só existe depois da publicação. |
| **Importação de produtos por planilha (CSV)** | **IMPLEMENTADA E VERIFICADA** (testes + navegador). Só cria produtos **novos, como rascunho**; nunca altera preço ou estoque de produto que já existe. |
| **Cadastro rápido de produtos** (duplicar produto, filtros e ações na lista do painel) | **IMPLEMENTADA E VERIFICADA** (testes + navegador). |
| **Publicação no Netlify + Neon** (planos gratuitos) | **IMPLEMENTADA, MAS NÃO VERIFICADA**: nenhuma publicação foi feita. Precisa das suas contas e variáveis de ambiente. Leia [os limites e cuidados](#publicar-no-netlify--neon-planos-gratuitos). |
| Publicação em servidor com domínio e HTTPS | **IMPLEMENTADA, MAS NÃO VERIFICADA** (precisa de servidor e domínio reais). |

---

## O que o dono precisa configurar

1. **Em `/admin/configuracoes`:** confira o **WhatsApp/telefone** (já vem +55 41 9141-9031; veja se precisa do 9 na frente) e o grupo; Instagram/e-mail (opcionais); **entrega** (obrigatório escolher: valor fixo, ou calculado pelo CEP com o **seu endereço de postagem**, ou só retirada em mãos); instruções de retirada; o **aviso sobre eventos** (opcional; só aparece na loja se você escrever); e se o **assistente de compras** aparece para os clientes. Se não tiver endereço de loja, deixe em branco. A logo oficial já vem aplicada.
2. **Pagamento:** escolha `PAYMENT_PROVIDER` no `.env` e preencha as chaves do serviço: [PayPal](#paypal-pagamento), [InfinitePay](#infinitepay-pagamento) ou [Mercado Pago](#mercado-pago-opcional). Sem isso a loja mostra o catálogo, mas **não finaliza compras** (e avisa o cliente).
3. **Categorias:** em `/admin/categorias`, clique em **Criar categorias sugeridas** (Miniaturas de carros › Hot Wheels, Mini GT, Matchbox, Outras marcas; Outras miniaturas e veículos; Bonecos e colecionáveis; Expositores e acessórios). Cada categoria tem um **tipo** (carros, bonecos/colecionáveis ou outros) que define quais campos aparecem ao cadastrar o produto; subcategorias herdam o tipo da mãe. Na loja só aparecem categorias com produto publicado.
4. **Produtos reais:** cadastre em `/admin/produtos/novo` (ou use **Duplicar** na lista, ou a [importação por planilha](#importação-de-produtos-por-planilha-csv) para muitos de uma vez) e depois use **Resumo → Remover produtos de demonstração**.
5. **Eventos:** em `/admin/eventos`, marque as datas em que a loja participa (nome, horário, local, descrição e foto). Para eventos que se repetem, crie antes um **modelo** em `/admin/eventos/modelos`. Só o que estiver **Publicado** aparece no site, e só aparece o que você cadastrou (veja [Eventos](#eventos-calendário)).
6. **Frete pelo CEP (opcional):** crie o token na sua conta SuperFrete, coloque em `SUPERFRETE_TOKEN` no `.env`, preencha seu endereço de postagem e use a seção **Testar o frete** (veja [Frete](#frete)).
7. **IA (opcional):** `AI_PROVIDER` + `AI_API_KEY` no `.env` ligam o assistente do painel (`/admin/ia`) e o assistente de compras dos clientes (veja [Assistente de IA](#assistente-de-ia)).

---

## Requisitos

- **Node.js 22 ou mais novo** (`node -v`)
- **PostgreSQL 16** (ou 15+)

---

## Rodar no seu computador (Windows PowerShell)

No PowerShell, use `npm.cmd` (o `npm` simples pode ser bloqueado pela política de execução de scripts).

```powershell
# 1. Instalar as dependências (na pasta do projeto)
npm.cmd ci

# 2. Criar o banco: instale o PostgreSQL (https://www.postgresql.org/download/windows/),
#    abra o "SQL Shell (psql)" e rode:
#      CREATE USER loja WITH PASSWORD 'uma_senha_forte';
#      CREATE DATABASE loja OWNER loja;

# 3. Configurar o ambiente
Copy-Item .env.example .env
notepad .env          # confira DATABASE_URL (veja a tabela abaixo)

# 4. Criar as tabelas (seguro repetir; nunca apaga dados)
npm.cmd run db:migrate

# 5. (Opcional, só para ver a loja com produtos de exemplo) produtos de demonstração
npm.cmd run db:seed

# 6. Rodar
npm.cmd run dev       # http://localhost:3000
```

Para gerar um segredo aleatório (ex.: `CRON_SECRET`): `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

**Cuidado com os dados:** o `db:seed` **só adiciona** itens de demonstração (SKU `DEMO-...`) e nunca apaga nada; a opção `--reset` **foi removida de propósito**. Não apague e recrie o banco da loja real. Para trocar o banco por outro, mude o `DATABASE_URL`. O seed cria categorias e 16 produtos de exemplo (carros e bonecos fictícios, SKU `DEMO-`).

Sem as credenciais do PayPal a loja funciona normalmente, mas o botão de finalizar fica desativado com um aviso (a loja **nunca** finge que cobrou).

---

## Variáveis de ambiente

Ficam no arquivo `.env` (que **não** vai para o Git). Segredos só existem no servidor: nada disso chega ao navegador. **Nunca envie essas chaves por chat ou e-mail.**

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `DATABASE_URL` | Sim | Conexão com o PostgreSQL: `postgres://usuario:senha@servidor:5432/banco` |
| `SITE_URL` | Sim em produção | Endereço público da loja, **com `https://` e sem barra no final** (retorno do pagamento, webhook, sitemap). |
| `STORAGE_DRIVER` | Não | Onde ficam as fotos: `local` (pasta; padrão no computador e em servidor próprio), `database` (dentro do PostgreSQL; **padrão no Netlify**) ou `s3` (serviço externo). Veja [Imagens e armazenamento](#imagens-e-armazenamento). |
| `UPLOAD_DIR` | Só com `local` | Pasta das fotos enviadas pelo painel. Em servidor próprio, use uma pasta **persistente** (padrão `./storage/uploads`). |
| `STORAGE_DB_MAX_MB` | Não | Teto, em MB, das fotos guardadas no banco (padrão 300). Ao chegar, novos envios são recusados com aviso; pedidos e pagamentos não são afetados. |
| `DATABASE_PLAN_LIMIT_MB` | Recomendada no Netlify + Neon | Tamanho do seu plano de banco, em MB (padrão 512). **Neon Free: `1024`.** A loja bloqueia novas fotos quando o banco chega a 90% disso, para nunca deixar os pedidos sem espaço. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Só com `STORAGE_DRIVER=s3` | Dados do serviço externo (Cloudflare R2, Neon Object Storage ou outro compatível com S3). `S3_REGION` é `auto` se não informada. A chave secreta só existe no servidor. |
| `STORAGE_PUBLIC_BASE_URL` | Não | Só com `s3`: endereço público do bucket, sem barra no final. Com ele as fotos saem direto do serviço; sem ele, saem pela loja em `/uploads/...`. |
| `DATABASE_POOL_MAX` | Não | Conexões abertas por instância da loja (padrão 10; **3** no Netlify, para não esgotar o limite do banco). |
| `PAYMENT_PROVIDER` | Não | `paypal` (**padrão, se você não definir**), `infinitepay` ou `mercadopago`. Quem usa InfinitePay precisa definir `infinitepay`. |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | Para vender | Credenciais do app no PayPal Developer |
| `PAYPAL_WEBHOOK_ID` | Para vender | ID do webhook cadastrado no PayPal. Sem ele, o aviso automático do PayPal é recusado. |
| `PAYPAL_ENV` | Sim | `sandbox` (testes, sem dinheiro de verdade; padrão) ou `live` (vendas reais) |
| `PAYPAL_API_BASE` | Não | **Deixe em branco.** Só para testes contra um servidor simulado. |
| `INFINITEPAY_HANDLE` / `INFINITEPAY_WEBHOOK_TOKEN` | Só se usar InfinitePay | Sua InfiniteTag e um segredo de 16+ caracteres. Veja [InfinitePay](#infinitepay-pagamento). `INFINITEPAY_API_BASE`: deixe em branco. |
| `MERCADOPAGO_*` | Só se usar Mercado Pago | Veja [Mercado Pago (opcional)](#mercado-pago-opcional). `MERCADOPAGO_API_BASE`: deixe em branco. |
| `SUPERFRETE_TOKEN` | Só para frete pelo CEP | Token da sua conta SuperFrete. Opcionais: `SUPERFRETE_CONTACT_EMAIL`, `SUPERFRETE_TIMEOUT_MS` (padrão 6000); `SUPERFRETE_API_BASE`: deixe em branco. Veja [Frete](#frete). |
| `CRON_SECRET` | **Obrigatória no Netlify**; opcional em servidor próprio | Segredo (16+ caracteres). É a "senha" que a função agendada do Netlify (ou um cron seu) envia para `/api/cron/maintenance`. Sem ele, o agendador não faz nada e o painel avisa. Veja [Manutenção automática](#manutenção-automática). |
| `TRUST_PROXY` | Em produção atrás de proxy | `true` se a loja está atrás de Nginx/Caddy/Cloudflare. |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` / `AI_BASE_URL` | Não | IA: `anthropic`, `openai` (API compatível) ou `none` (padrão) |
| `AI_SHOP_DAILY_LIMIT` | Não | Teto de perguntas por dia no assistente dos **clientes** (padrão 500), para limitar seu gasto com a IA. |
| `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD`, `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_CUSTOMER_EMAIL` / `SEED_CUSTOMER_PASSWORD`, `TEST_DATABASE_URL` | Não: só para comandos no **seu computador** | **Não cadastre no Netlify.** `ADMIN_*` deixam o `npm run admin:create` rodar sem fazer perguntas; `SEED_*` definem as contas de demonstração do `db:seed` (o seed é só para testes, nunca para o banco real); `TEST_DATABASE_URL` aponta o banco dos testes (o nome precisa terminar em `_test`). |

---

## Banco de dados e migrations

As tabelas são criadas por **migrations** versionadas (pasta `drizzle/`), **aditivas** (não apagam dados). O comando é seguro para repetir:

```powershell
npm.cmd run db:migrate
```

Rode-o na primeira instalação e **a cada atualização**. Ele aplica só o que ainda não foi aplicado, **tudo dentro de uma única transação** (se algo falhar, nada fica aplicado pela metade). O que cada migração faz:

| Migração | O que faz (todas só **adicionam** ou preenchem o que está em branco) |
|---|---|
| `0000` | Tabelas iniciais (produtos, estoque, pedidos, contas, configurações). |
| `0001` | Campos de colecionável (marca, escala, série...), links de recuperação de senha, textos da RT. |
| `0002` | Subcategorias e tipo de categoria (carros, colecionáveis, outros). |
| `0003` | Esconde só os produtos/categorias de demonstração do seed antigo e devolve ao "não configurado" os textos e o frete que ainda sejam os de exemplo. |
| `0004` | Preenche WhatsApp, telefone e grupo **somente se estiverem em branco** (o que o dono digitou é sempre preservado). |
| `0005` | **Eventos e fotos no banco** (detalhes abaixo). |

As configurações novas (frete pelo CEP, assistente, aviso de eventos) não precisam de migração: são guardadas como configuração com valores padrão. **Faça um backup do banco antes de atualizar** (veja [Atualizar a loja e fazer backup](#atualizar-a-loja-e-fazer-backup)).

### Migração `0005`: o que ela faz e como aplicar no banco real com segurança

**O que faz:** cria 3 tabelas novas, `event_templates` (modelos de evento), `events` (eventos e participações por data) e `stored_files` (fotos guardadas no banco), com seus índices e regras de validação (horário no formato `HH:MM`; situação só `PUBLICADO`, `RASCUNHO` ou `CANCELADO`). Além disso, troca **uma única frase**: se (e somente se) o aviso da loja ainda for exatamente o texto padrão antigo ("Além da loja online, também vendemos em feiras, em Curitiba."), ele passa a dizer "eventos"; se você mudou o texto, ele é mantido. Fora essa frase, **não altera nem apaga nenhuma tabela ou linha existente**: produtos, pedidos, estoque, clientes e o restante das configurações ficam como estão. O comando aplica todas as migrações pendentes numa **única transação**: se algo falhar, nada é aplicado.

**Situação:** foi aplicada e testada **apenas em bancos de teste criados do zero ou com dados de exemplo**. Ela **não** foi aplicada no seu banco real. Quem aplica é você, assim:

1. **Backup antes** (obrigatório). Com o `pg_dump` (vem junto do PostgreSQL; use versão igual ou mais nova que a do servidor), pegando a conexão **direta** no painel do Neon:
   ```powershell
   pg_dump "COLE_AQUI_A_CONEXAO" -Fc -f backup-antes-0005.dump
   ```
   Guarde o arquivo fora do computador também. (O plano gratuito do Neon guarda só 6 horas de histórico para voltar no tempo: não conte só com isso.)
2. **Ensaio (opcional, recomendado):** restaure o backup num banco de teste seu (`pg_restore -d loja_ensaio backup-antes-0005.dump`) e rode a migração lá primeiro.
3. **Aplicar no banco real**, só depois do backup:
   ```powershell
   $env:DATABASE_URL = "COLE_AQUI_A_CONEXAO_DIRETA_DO_NEON"
   npm.cmd run db:migrate
   Remove-Item Env:DATABASE_URL
   ```
   Para migrações use a conexão **direta** do Neon (a do endereço **sem** `-pooler`), como a Neon recomenda para alterar tabelas. Deve terminar com "Migrations aplicadas com sucesso."
4. **Conferir:** `npm.cmd run db:migrate` de novo não faz nada (é seguro repetir); no painel, `/admin/eventos` abre vazio.
5. **Só então** publique o código novo (um único deploy). A ordem importa pouco para a segurança: a loja antiga continua funcionando com as tabelas novas presentes (ela simplesmente não as usa), então dá para migrar antes e publicar depois. Se, por engano, você publicar o código novo **antes** de migrar, a vitrine (página inicial, catálogo e `/eventos`) continua abrindo, só sem eventos, e o servidor registra o aviso "[eventos] a tabela de eventos ainda não existe"; já o painel mostra erro nas páginas de Eventos (e, quando as fotos ficam no banco, no Resumo e nos envios de foto) até você aplicar a migração. Isso foi testado em banco de teste.

**Desfazer:** não é preciso. As tabelas novas podem ficar sem uso. Se um dia quiser removê-las (`DROP TABLE`), faça backup antes; isso apaga os eventos e as fotos guardadas no banco.

**Fotos que já existem numa pasta** (loja que já rodava antes): depois de migrar, copie-as para o novo lugar com `npm run storage:migrate` (veja [Imagens e armazenamento](#imagens-e-armazenamento)).

---

## Criar o administrador e recuperar senhas

A conta do dono é criada **uma vez, pelo servidor** (não existe tela pública para isso):

```powershell
npm.cmd run admin:create
```

Ele pergunta e-mail, nome e senha (mínimo 10 caracteres). Para trocar a senha do administrador, rode de novo com o mesmo e-mail.

**Cliente esqueceu a senha** (a loja não envia e-mail): o cliente fala com você; em **Admin → Clientes** você gera um **link de redefinição** (vale 60 minutos, uso único) e envia pelo WhatsApp. Ao usar o link, as sessões antigas do cliente são encerradas.

---

## Produtos de demonstração

`npm.cmd run db:seed` adiciona produtos de exemplo (SKU `DEMO-...`, preços e fotos fictícios). Quando cadastrar os reais, abra **Resumo** e use **Remover produtos de demonstração**: ele só remove itens reconhecidos como demonstração e, se algum já aparece em um pedido, apenas o esconde da loja. **Nunca rode o seed em produção com a loja já em uso sem necessidade.**

---

## Publicar na internet (produção)

Caminho padrão: um servidor Linux (VPS Ubuntu) com domínio. Os comandos abaixo são a receita comum; **esta etapa de servidor/domínio/HTTPS não foi validada neste ambiente** (o build, as migrations, a criação do admin e o `npm start` foram). Se preferir, peça a quem cuida da hospedagem para seguir esta seção.

### 1. Preparar o servidor

```bash
sudo apt update && sudo apt install -y postgresql git curl
# Node 22: siga https://nodejs.org (ou use nvm). Confirme com: node -v
```

Crie o banco e o usuário (troque a senha):

```bash
sudo -u postgres psql -c "CREATE USER loja WITH PASSWORD 'SENHA_FORTE_AQUI';"
sudo -u postgres psql -c "CREATE DATABASE loja OWNER loja;"
```

### 2. Instalar a loja

```bash
git clone <endereço-do-repositório> /opt/loja && cd /opt/loja
npm ci                       # precisa das dependências de desenvolvimento para o build
cp .env.example .env && nano .env
```

No `.env` de produção:

```
DATABASE_URL=postgres://loja:SENHA_FORTE_AQUI@localhost:5432/loja
SITE_URL=https://www.seudominio.com.br
UPLOAD_DIR=/var/loja/uploads
TRUST_PROXY=true
CRON_SECRET=<saída de: openssl rand -hex 32>
MERCADOPAGO_ACCESS_TOKEN=<token de PRODUÇÃO>
MERCADOPAGO_WEBHOOK_SECRET=<assinatura secreta>
```

```bash
sudo mkdir -p /var/loja/uploads && sudo chown -R $USER /var/loja   # pasta das fotos
chmod 600 .env
npm run db:migrate           # cria as tabelas
npm run admin:create         # cria a conta do dono
npm run build                # compila a loja
npm start                    # sobe na porta 3000 (teste rápido; veja o passo 4)
```

**Não** rode `npm run db:seed` em produção (ele recusa rodar com `NODE_ENV=production`).

### 3. Domínio e HTTPS

Aponte o domínio para o IP do servidor (registro DNS tipo A) e coloque na frente um proxy com HTTPS automático. Exemplo com **Caddy** (`/etc/caddy/Caddyfile`):

```
www.seudominio.com.br {
    reverse_proxy localhost:3000
}
```

Depois de configurado, `SITE_URL` deve ser exatamente esse endereço `https://...` e `TRUST_PROXY=true`. **HTTPS é obrigatório** para o PayPal, o InfinitePay ou o Mercado Pago avisarem a loja sobre pagamentos (webhook).

Com `TRUST_PROXY=true` a loja usa o primeiro IP de `X-Forwarded-For` para limitar tentativas. O Caddy, na configuração padrão, não confia no `X-Forwarded-For` enviado pelo visitante e o troca pelo IP real (confira na documentação da sua versão). Se usar **Nginx**, coloque `proxy_set_header X-Forwarded-For $remote_addr;` (substitui, em vez de acrescentar ao que o visitante enviou); senão alguém poderia forjar o IP para escapar do limite.

### 4. Deixar rodando sempre (systemd)

Crie `/etc/systemd/system/loja.service`:

```ini
[Unit]
Description=Loja de Carrinhos
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/loja
ExecStart=/usr/bin/npm start
Restart=always
User=loja
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now loja
sudo journalctl -u loja -f      # ver os registros
```

(Crie o usuário do sistema `loja` e dê a ele a posse de `/opt/loja` e `/var/loja`.)

### 5. Depois de publicar, confira

1. `https://seu-dominio/` abre a loja; `https://seu-dominio/sitemap.xml` e `/robots.txt` respondem.
2. Entre em `/login` com a conta do dono → **Configurações** e preencha WhatsApp, grupo de WhatsApp, frete e retirada (a logo oficial já vem aplicada). O painel mostra, no fim da página, se o PayPal (credenciais e ID do webhook) e o `SITE_URL` estão corretos.
3. O **Resumo** do painel tem um checklist do que falta para vender.
4. Faça uma compra de teste (veja a próxima seção) **antes** de divulgar.

---

## Publicar no Netlify + Neon (planos gratuitos)

> **Situação: NÃO validado.** Nenhuma publicação foi feita durante o desenvolvimento, de propósito: o plano gratuito do Netlify tem créditos limitados e cada publicação gasta 15. Tudo abaixo foi preparado e testado **localmente**; o comportamento real no Netlify e no Neon só pode ser conferido depois da primeira publicação (lista em [Depois de publicar](#depois-de-publicar-no-netlify)).

### O que muda em relação a um servidor próprio

- O Netlify **não tem pasta permanente**: as fotos ficam **no PostgreSQL** (padrão) ou num **serviço externo**. Veja [Imagens e armazenamento](#imagens-e-armazenamento).
- Não há programa ligado o tempo todo: a manutenção (cancelar pedidos não pagos vencidos e devolver o estoque, limpezas) roda numa **função agendada** do Netlify, de hora em hora. Veja [Manutenção automática](#manutenção-automática).
- As páginas rodam em funções que "acordam" sob demanda. Depois de um tempo sem visitas, a primeira visita pode demorar mais (função e banco acordando).

### Variáveis de ambiente (Netlify → Site configuration → Environment variables)

| Variável | Valor |
|---|---|
| `DATABASE_URL` | Conexão do Neon com `?sslmode=require`. Para o **site** use a conexão **pooled** (o endereço com `-pooler`); para **migrações** use a **direta**. Nenhum recurso de sessão que o pooler do Neon não aceite é usado (conferido no código; não testado com o Neon real). |
| `SITE_URL` | O endereço da loja, com `https://` e sem barra no final. |
| `CRON_SECRET` | Texto secreto de 16+ caracteres (a manutenção agendada não roda sem ele). |
| `PAYMENT_PROVIDER` e as chaves do serviço | Se usa InfinitePay, **defina `infinitepay`**: sem isso vale `paypal`. |
| `DATABASE_PLAN_LIMIT_MB` | `1024` no Neon Free (o padrão é 512). |
| `STORAGE_DRIVER`, `S3_*` | Só se for guardar as fotos fora do banco (veja a seção de imagens). |

Nunca envie essas chaves por chat ou e-mail: cadastre direto no painel do Netlify.

### Limites reais dos planos gratuitos

Valores das documentações oficiais, consultadas em **26/10/2026** (podem mudar; confira o seu plano nos painéis do Neon e do Netlify, porque daqui não dá para ver a sua conta):

| Serviço | Limite no plano gratuito | O que acontece ao chegar nele |
|---|---|---|
| **Neon** (banco) | **1 GB** de armazenamento por projeto | Escritas que aumentam o banco **falham, inclusive novos pedidos**, até você liberar espaço ou mudar de plano. Nada é apagado. |
| Neon | **100 CU-horas** por mês (escala até 2 CU) | O banco (compute) é **suspenso até o próximo ciclo**: a loja fica sem banco. |
| Neon | **5 GB** de tráfego de saída por mês | Igual ao anterior: compute suspenso até o próximo ciclo. |
| Neon | Banco "dorme" após **5 min** sem uso (não dá para desligar) | Primeira consulta depois disso demora mais. |
| Neon | Histórico para voltar no tempo: **6 horas** (e no máximo 1 GB-mês de alterações) | Backups antigos não existem: faça seu próprio `pg_dump`. |
| Neon Object Storage (opcional) | 5 GB por projeto; regiões AWS us-east-1, us-east-2, eu-central-1 e ap-southeast-1 (**nenhuma no Brasil**) | Ver seção de imagens. |
| **Netlify** | **300 créditos por mês, limite rígido** (sem recarga no plano gratuito) | **Todos os sites da conta são pausados** ("Site not available") até o próximo ciclo. |
| Netlify: o que gasta créditos | Publicação em produção **15**; banda **20 por GB**; funções **10 por GB-hora**; requisições **2 por 10 mil** | Cada publicação extra custa 15: por isso o projeto foi preparado para **uma** publicação. |
| Netlify: planos pagos | Personal US$ 9/mês (1.000 créditos, com recarga automática opcional); Pro a partir de US$ 20/mês (3.000 créditos) | Não é preciso agora; é a saída se a loja crescer. |
| Netlify: funções | Corpo de requisição/resposta de até ~6 MB; funções agendadas até 30 s | Por isso a foto é reduzida no navegador antes de enviar (limite de 4 MB na loja). |

### O que isso significa para a loja

1. **Os dois planos têm "disjuntores" que tiram a loja do ar** (créditos do Netlify; CU-horas e tráfego do Neon). Acompanhe os painéis de uso nas primeiras semanas.
2. **Fotos pesam nos dois lados.** Cada foto servida gasta banda do Netlify (20 créditos por GB) e, se estiver guardada no banco e não vier do cache, tráfego e tempo de banco do Neon. Por isso as fotos têm cache longo no navegador e no CDN do Netlify e a miniatura da vitrine é leve (cerca de 30 KB). **Ordem de grandeza (estimativa, não medida):** uma visita que vê a página inicial, uma lista e dois produtos baixa de 1 a 3 MB de fotos com o cache vazio; **1.000 visitas ≈ 1 a 3 GB ≈ 20 a 60 créditos**. O plano gratuito atende bem uma loja pequena, mas **não é ilimitado**.
3. **A manutenção por hora acorda o banco 24 vezes por dia.** Estimativa: cerca de 15 das 100 CU-horas do mês (supondo 0,25 CU enquanto ativo), mais pouco mais de 10 créditos do Netlify. Para gastar menos, edite `schedule` em `netlify/functions/manutencao.mts` (por exemplo `0 */3 * * *`, a cada 3 horas; o pedido não pago vence por prazo mesmo assim, só demora um pouco mais para o estoque voltar).
4. **Banco cheio é o pior caso.** O sistema se protege: as fotos têm teto próprio (`STORAGE_DB_MAX_MB`, padrão 300 MB) e novos envios são recusados quando o banco chega a 90% do plano (`DATABASE_PLAN_LIMIT_MB`), para sobrar espaço para os pedidos. O Resumo do painel mostra o medidor.
5. **O limitador de tentativas (login, cadastro, checkout...) é por instância**, em memória. No Netlify há várias instâncias, então ele protege menos do que em servidor único. Use também a proteção do próprio Netlify/Cloudflare se notar abuso.
6. **Funções agendadas só rodam em publicações de produção** (não em pré-visualizações) e só depois da primeira publicação.

### Depois de publicar no Netlify

Confira, nesta ordem (nada disso pôde ser testado antes):

1. `https://seu-site/` abre, o catálogo mostra fotos e `/eventos` abre.
2. Entre no painel: o **Resumo** mostra a manutenção ("última execução") e o medidor de espaço.
3. Chame a manutenção uma vez à mão, no PowerShell: `curl.exe -X POST -H "Authorization: Bearer SEU_CRON_SECRET" https://seu-site/api/cron/maintenance`. Deve responder `200` com um resumo.
4. Na hora cheia seguinte, veja no painel do Netlify (Functions → `manutencao`) o registro da execução, e no Resumo da loja a hora da última manutenção.
5. Abra a foto de um produto no navegador (aba Rede/Network) e veja se a resposta traz `Cache-Control: public, max-age=31536000, immutable`. Na segunda visita ela deve vir do cache.
6. Na primeira semana, olhe o uso no Neon (CU-horas, tráfego de saída, tamanho) e no Netlify (créditos).
7. Faça uma compra de teste real de baixo valor antes de divulgar, como nas seções de pagamento.

**Fontes** (consultadas em 26/10/2026): [limites do Neon](https://neon.com/docs/introduction/plans), [Neon Object Storage](https://neon.com/docs/storage/get-started), [créditos do Netlify](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/), [planos do Netlify](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/), [preços do Cloudflare R2](https://developers.cloudflare.com/r2/pricing/).

---

## PayPal (pagamento)

**Como funciona (resumo):** o cliente é enviado ao PayPal, aprova o pagamento e volta à loja; **a loja então cobra e confere o resultado direto na API do PayPal**. O pedido só vira "Pago" depois dessa conferência, e o valor precisa ser **igual** ao total do pedido. Voltar à página de pedido não prova pagamento. O PayPal também avisa a loja por um **webhook assinado** (a assinatura é conferida na API do PayPal), o que cobre o caso de o cliente fechar a página antes de voltar.

### O que você precisa (não validado com o PayPal real)

1. Uma **conta PayPal Business** que possa receber pagamentos online (Checkout) no Brasil. A maquininha/leitor de cartão usado nas feiras **não ativa isso sozinho**: confirme com o PayPal. As taxas e opções de pagamento dependem da sua conta; este sistema não as define.
2. Em <https://developer.paypal.com> → **Apps & Credentials**, modo **Sandbox**: *Create App* e copie o **Client ID** e o **Secret**.
3. No mesmo app: **Webhooks → Add webhook**. URL: `https://SEU-DOMINIO/api/webhooks/paypal` (precisa ser **https** público). Eventos: *Checkout order approved* e *Payment capture completed / pending / denied / refunded / reversed*. Copie o **Webhook ID**.
4. No `.env`: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` e `PAYPAL_ENV=sandbox`. Reinicie a loja.
5. **Teste obrigatório antes de vender:** com uma conta compradora de teste (Developer → Sandbox → Accounts), faça uma compra; confira que o pedido fica **Pago**, que o reembolso pelo painel funciona e que o webhook aparece como entregue no painel do PayPal.
6. Só depois: crie as credenciais **Live**, troque `PAYPAL_ENV=live` e refaça com uma compra real de valor baixo (e reembolse).

Em `/admin/configuracoes` a seção "Ligações com outros serviços" mostra o que ainda falta (o dashboard também avisa se estiver em modo de teste).

**Testando no seu computador:** o retorno do cliente funciona em `http://localhost`, mas o PayPal **não consegue chamar o webhook** de um endereço local; use um endereço https público para testar o webhook.

---

## InfinitePay (pagamento)

**Como funciona (resumo):** a loja cria um **link de pagamento** no InfinitePay (Checkout Integrado), o cliente paga por Pix ou cartão na página do InfinitePay e volta à loja. **O pedido só vira "Pago" depois que a loja consulta o pagamento direto na API do InfinitePay** e confere que o valor pago cobre o total do pedido. Voltar à página do pedido, ou o conteúdo do aviso (webhook), não provam pagamento. O InfinitePay **não assina** os avisos; por isso o endereço do webhook leva um **segredo só seu** (`INFINITEPAY_WEBHOOK_TOKEN`) e, mesmo assim, o aviso apenas dispara a conferência na API.

### O que você precisa (não validado com o InfinitePay real)

1. A conta InfinitePay do negócio (a mesma da maquininha) com o **Checkout Integrado / link de pagamento** disponível. **Confirme isso com o InfinitePay**: a maquininha, sozinha, não garante o pagamento online.
2. Sua **InfiniteTag** (no app do InfinitePay), sem o `$` → `INFINITEPAY_HANDLE` no `.env`.
3. Um segredo seu com **16 ou mais caracteres** → `INFINITEPAY_WEBHOOK_TOKEN` (gere com `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`; **nunca** envie por chat ou e-mail).
4. `PAYMENT_PROVIDER=infinitepay` e `SITE_URL=https://seu-dominio` (o InfinitePay precisa alcançar o endereço do webhook, então o site precisa estar na internet com https). Reinicie a loja.
5. Não há webhook para cadastrar em painel nenhum: a loja informa o endereço do aviso, já com o segredo, em cada link de pagamento que cria.
6. **Teste obrigatório antes de vender:** com um produto barato, faça uma compra real; confira que o pedido fica **Pago** e que o valor bate. Depois teste o reembolso (abaixo).

**Reembolso é manual:** o InfinitePay não devolve dinheiro por API. Devolva o valor no app do InfinitePay e, no pedido (`/admin/pedidos`), clique em **Já devolvi pelo app: marcar como reembolsado** para registrar aqui (o pedido passa a "Reembolsado" e, se ainda não foi enviado, o estoque volta).

**Ponto específico a conferir no primeiro teste:** os valores enviados e recebidos pela API do InfinitePay (em centavos) e os nomes dos campos foram montados a partir da documentação pública do Checkout Integrado e testados só contra um servidor **simulado**. Se algo divergir, o ajuste fica em `src/server/payments/infinitepay.ts`.

---

## Mercado Pago (opcional)

A loja usa o **Checkout Pro**: o cliente é levado ao ambiente do Mercado Pago para pagar (os dados do cartão nunca passam pela loja) e volta para a página do pedido.

### O que você precisa

1. Uma conta no Mercado Pago (da loja do seu pai) com a conta **verificada** para receber.
2. Em <https://www.mercadopago.com.br/developers>: **Suas integrações → Criar aplicação** (produto "Checkout Pro").
3. Copiar o **Access Token** → `MERCADOPAGO_ACCESS_TOKEN`. Existem o de **teste** e o de **produção**.
4. Em **Webhooks → Configurar notificações**:
   - URL: `https://seu-dominio/api/webhooks/mercadopago` (o painel da loja mostra o endereço exato em **Configurações**)
   - Evento: **Pagamentos**
   - Copiar a **assinatura secreta** → `MERCADOPAGO_WEBHOOK_SECRET`
5. Reiniciar a loja (`sudo systemctl restart loja`).

### Como o pagamento é protegido

- O pedido só vira **Pago** quando a loja consulta o pagamento **direto na API do Mercado Pago** depois de receber um webhook com **assinatura válida** (HMAC-SHA256). O corpo do webhook e o que o navegador do cliente diz são ignorados.
- O valor aprovado precisa ser igual ao total do pedido; processar o mesmo aviso duas vezes não duplica nada.
- Recusado/cancelado: o pedido é cancelado e o estoque volta. Pendente (Pix/boleto): fica aguardando; se não pagar no prazo (configurável, padrão 120 min), o pedido expira e o estoque volta.
- Reembolso: botão no pedido (admin). Pedido ainda não enviado devolve o estoque sozinho.

### Teste antes de vender (obrigatório)

1. Com as credenciais de **teste**, use contas de teste do Mercado Pago (veja "Contas de teste" na documentação deles) e faça uma compra completa: pedido criado → pagamento → webhook → pedido **Pago**.
2. Confira no painel do Mercado Pago, em Webhooks, se as notificações chegaram com resposta 200.
3. Só depois troque para as credenciais de **produção**.

**Não validado com o Mercado Pago real.** Ponto específico a conferir no primeiro teste: a loja envia o cliente para o endereço `init_point` do Checkout Pro. Se, com credenciais de teste, o Mercado Pago exigir o endereço de sandbox (`sandbox_init_point`), é um ajuste de uma linha em `src/server/payments/mercadopago.ts`.

---

## Assistente de IA

A mesma chave (`AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`) liga **dois** assistentes, e a chave **nunca** vai para o navegador.

### 1. No painel (para o dono)

Em **Assistente de IA** no painel o dono descreve o produto com as próprias palavras e o sistema **sugere** nome, descrição, categoria, características, textos para o Google e tags. A sugestão cai num formulário **editável**; só aparece na loja quando o dono clicar em Salvar/Publicar. A IA é instruída a não inventar medidas, material ou garantia, e valores como preço e estoque só são preenchidos se o dono os escreveu.

Para ligar (no `.env` do servidor):

```
AI_PROVIDER=anthropic
AI_API_KEY=<sua chave>
AI_MODEL=<nome do modelo>
```

Para outro serviço compatível com o formato OpenAI: `AI_PROVIDER=openai`, `AI_API_KEY`, `AI_MODEL` e, se não for a OpenAI, `AI_BASE_URL`. Para um provedor diferente, crie uma classe que implemente `AiProvider` (`src/server/ai/types.ts`) e inclua-a em `src/server/ai/index.ts`. A chave nunca vai para o navegador. Sem configuração, a tela mostra "IA desligada" e o cadastro manual continua funcionando.

**Não validado com um serviço de IA real.**

### 2. Na loja (para o cliente)

Um botão **Assistente** no canto da loja abre um chat que ajuda o cliente a **achar miniaturas** e tira dúvidas sobre **entrega e pagamento**. Ele só aparece se houver chave de IA configurada **e** a opção estiver ligada em **Configurações → Assistente de compras** (dá para desligar a qualquer momento).

Como ele foi feito para não vender errado:

- Responde só com base nos **produtos publicados** e nas regras da loja; **preços, estoque e fotos aparecem em cartões montados pelo servidor com dados do banco**, nunca pelo texto da IA.
- Se a resposta da IA citar preço, quantidade ou percentual que não esteja nos dados, a loja a **troca por uma frase segura** (os cartões continuam mostrando os dados reais). Quando o assunto só a loja resolve (pedido existente, troca, reclamação, negociação), aparece o botão **Falar com a loja no WhatsApp**, já com a dúvida do cliente.
- O texto do cliente e o catálogo são tratados como **dados**, não como instruções; há **limite de perguntas por visitante** e um **teto diário** (`AI_SHOP_DAILY_LIMIT`, padrão 500) para proteger o seu gasto.
- O chat avisa que é uma inteligência artificial e que pode errar. Ele **não tem acesso a pedidos nem mexe em estoque** (só lê o catálogo publicado) e é instruído a não negociar preço nem prometer prazo ou desconto.

**Não validado com um serviço de IA real** (testado com uma IA simulada, em testes automatizados e no navegador).

---

## Frete

Em **Configurações → Entrega** você escolhe como o frete é definido:

1. **Valor fixo** (padrão): um valor por pedido (com "frete grátis acima de R$ X" opcional) e um prazo em texto livre. Não usa token nem CEP.
2. **Calculado pelo CEP do cliente (SuperFrete)**: preço e prazo de **SEDEX, PAC e/ou Mini Envios** vêm da SuperFrete, a partir do **seu endereço de postagem**, do CEP do cliente e do peso/medidas dos produtos.

A **retirada em mãos** é independente e pode ficar ligada nos dois modos. **Nada vem preenchido:** enquanto o dono não ativa a entrega (informando o valor — `0` se for grátis) ou a retirada, a loja não mostra frete e o checkout avisa que não há forma de entrega.

### Ligar o frete pelo CEP

1. Na sua conta SuperFrete, gere o **token de API** (na área de integrações/API da SuperFrete) e coloque no `.env`: `SUPERFRETE_TOKEN=...`. Opcional: `SUPERFRETE_CONTACT_EMAIL` (seu e-mail, usado no cabeçalho que a SuperFrete pede) e `SUPERFRETE_TIMEOUT_MS` (espera máxima, padrão 6000). Reinicie a loja.
2. Em **Configurações → Entrega**, escolha **Calculado pelo CEP do cliente** e preencha o **seu endereço de postagem** (o **CEP** é o que importa para o cálculo; rua, número, bairro, cidade e UF ficam registrados).
3. Marque os serviços (SEDEX e PAC vêm marcados; Mini Envios, não) e ajuste: **acréscimo por pedido** (embalagem/caixa), **dias para postar** (somados ao prazo), **declarar valor** (seguro) e o **item padrão** (peso e medidas usados quando o produto não tem os dele).
4. Deixe também um **valor fixo de reserva** (usado só se a SuperFrete estiver fora do ar; se ficar em `0`, uma falha do serviço deixa só a retirada).
5. Na seção **Testar o frete** (logo abaixo, na mesma página), informe um CEP de destino e clique em **Testar frete**: aparece o resultado **real** (ou o erro real) da SuperFrete, sem reserva e sem cache. Salve as configurações antes de testar. **Faça isso antes de divulgar a loja.**

### Como funciona para o cliente

- No **carrinho** há "Calcular o frete" (digita o CEP e vê as opções); no **checkout**, as opções aparecem depois do endereço ("3. Escolha o envio").
- O **servidor recalcula o frete sempre** ao criar o pedido; o navegador só diz qual opção foi escolhida. Se o valor mudou desde que o cliente o viu, o checkout mostra o novo valor e pede para confirmar, em vez de cobrar diferente em silêncio.
- Se a SuperFrete falhar ou demorar, a loja usa o **valor fixo de reserva** (se maior que zero) e avisa o cliente; sem reserva, só a retirada. As respostas ficam em cache por 15 minutos (mesmo CEP, pacote e serviços).
- Peso e medidas do produto (opcionais, no cadastro) montam o pacote. **Os valores padrão (100 g e 16 × 11 × 3 cm) são só exemplos: ajuste para as suas miniaturas embaladas.** Pedido acima dos limites dos Correios (30 kg, 105 cm de lado, 200 cm somando as medidas) pede ao cliente que fale com a loja.

**Não validado com a SuperFrete real** (a documentação oficial não pôde ser consultada): o endereço, os códigos dos serviços (PAC 1, SEDEX 2, Mini Envios 17) e o formato da resposta foram montados de forma cautelosa e testados só contra um servidor **simulado**. Se o **Testar frete** acusar erro, o ajuste fica em `src/server/shipping/superfrete.ts`. Também não emitimos etiqueta: a postagem continua sendo feita por você (SuperFrete ou agência).

Para usar outro serviço (Melhor Envio, Frenet, Correios direto): implemente `ShippingProvider` (`src/server/shipping/types.ts`) e devolva-a em `getShippingProvider()` (`src/server/shipping/index.ts`). O checkout, o pedido e o painel não precisam mudar.

---

## Eventos (calendário)

A RT vende em feiras e encontros; o calendário mostra aos clientes onde e quando a loja estará presente. **O site não inventa nenhuma data**: só aparece o que o dono cadastrar e deixar **Publicado**.

### Para o cliente

- **`/eventos`** e um bloco "Próximos eventos" na página inicial. O calendário é mensal, com os dias que têm evento destacados; tocar (ou usar o teclado) num dia abre os detalhes: nome, descrição, horário, local e foto. Pode haver **mais de um evento no mesmo dia**.
- Mês sem evento mostra um aviso claro. Dá para navegar de 12 meses para trás até 24 meses para frente. A página funciona com teclado e leitor de tela.
- Só aparecem eventos **Publicados e não cancelados**. Rascunhos e cancelados nunca vão para o site. A consulta pública é `GET /api/eventos?mes=AAAA-MM`.

### Para o dono (`/admin/eventos`)

- **Quatro visões:** Próximos, Calendário, Passados e Cancelados.
- **Novo evento** (`/admin/eventos/novo`): escolha um modelo (ou deixe "evento avulso"), marque **uma ou várias datas de uma vez** (até 40), ajuste nome, início, término, local, descrição e foto, e escolha se já fica publicado ou como rascunho. **Cada data vira um evento próprio** (a "participação" naquela data): você pode mudar horário, local ou foto só daquela data, sem mexer nas outras nem no modelo.
- **Modelos** (`/admin/eventos/modelos`): servem para eventos que se repetem (mesmo nome, local, horário e foto). O modelo **não aparece no site**; ele só preenche os campos quando você marca uma data.
- **Editar um modelo não muda, em silêncio, os eventos já marcados** (cada evento guarda a sua própria cópia dos dados). Para refletir uma mudança do modelo nas próximas datas, use **"Atualizar datas já marcadas"** na tela do modelo: o painel lista quais datas serão alteradas, você escolhe **quais campos** trocar e confirma. Datas passadas e canceladas nunca entram; os campos que você não marcar, e os ajustes feitos só numa data, ficam como estão; e se a lista mudou enquanto você confirmava, nada é alterado.
- **Cancelar** tira o evento do site e o guarda na aba Cancelados (dá para **reativar**). **Excluir** apaga de vez. Os dois pedem confirmação.
- **Fotos de evento** passam pelo mesmo tratamento das fotos de produto (reduzidas e regravadas em WebP, até 1200 px) e ficam no mesmo armazenamento. Uma foto que ninguém usa é limpa sozinha pela manutenção depois de 24 horas.
- **Mudanças aparecem no site sem publicar o site de novo**: os dados ficam no banco, não no código. A resposta pública fica em cache por 15 a 30 segundos, então a mudança aparece em até cerca de 1 minuto.
- Datas são dias de calendário (sem fuso) e os horários são `HH:MM`; o "hoje" do calendário usa o horário de São Paulo/Curitiba.

---

## Importação de produtos por planilha (CSV)

Para cadastrar **muitos produtos de uma vez**, em **Produtos → Importar planilha** (`/admin/produtos/importar`).

1. **Baixe o modelo** (só os nomes das colunas, nenhum produto de exemplo) e preencha no Excel ou Google Planilhas. Salve como **CSV** (separado por ponto e vírgula ou vírgula; os acentos do Excel em português são lidos corretamente).
2. **Colunas obrigatórias:** `nome`, `preco` (em reais, ex.: `49,90`) e `estoque`. **Opcionais:** `sku`, `categoria` (uma que já existe, ou `Mãe > Filha`), `marca`, `modelo`, `escala`, `serie`, `ano`, `condicao` (lacrado ou solto), `preco_promocional`, `descricao_curta`, `descricao`, `tags` (separadas por `|`), `estoque_minimo`, `peso_g`, `comprimento_cm`, `largura_cm`, `altura_cm`.
3. **Pré-visualização antes de gravar:** a loja confere cada linha com as **mesmas regras do cadastro manual** e mostra, linha por linha, o que está certo e o que precisa ser corrigido (com o motivo). **Nada é gravado nesta etapa.**
4. **Confirmação:** você confirma "importar N produtos". Se, entre a prévia e a confirmação, algo mudou e o número já não é N, **nada é gravado** e a prévia é refeita.
5. **O que acontece ao importar:** só as linhas corretas entram, **todas numa única transação** (ou entram todas, ou nenhuma). Os produtos entram como **rascunho** (a menos que você marque "Publicar na loja ao importar"), para você colocar as fotos e conferir antes. O estoque inicial fica registrado no histórico de estoque.
6. **Proteções:** produto que já existe (mesmo **nome** ou mesmo **SKU**) é **recusado**: a importação **nunca altera nem apaga** produto existente, e **não mexe em preço nem em estoque** de nada que já está na loja. Limites: **500 linhas** e **1 MB** por arquivo (arquivos maiores: divida em partes). Categoria que não existe é apontada como erro (crie antes em Categorias).

Não existe nenhum produto "de exemplo" embutido: a planilha é sempre a sua.

---

## Imagens e armazenamento

### Como a foto é tratada

1. **No navegador, antes de enviar:** a foto é reduzida para no máximo **2000 px** no maior lado e salva em JPEG; a qualidade começa em 86% e baixa em passos (78, 70, 60%) até caber em **2 MB**. Fotos já leves (até 800 KB) e GIFs seguem como estão. Se mesmo reduzida passar de **4 MB**, o navegador explica o problema em vez de tentar enviar. Isso economiza o seu plano de internet e respeita o limite do Netlify (~6 MB por requisição). É só economia de banda, **nunca garantia de segurança**.
2. **No servidor (nunca confia no navegador):** recusa arquivo vazio, acima de **8 MB** ou com mais de **40 megapixels**; só aceita JPEG, PNG, WebP e GIF **de verdade** (o conteúdo é decodificado; SVG e arquivos disfarçados são recusados). A foto é **regravada em WebP** em duas versões: **grande** (até 1400 px, qualidade 80, com cores preservadas nas bordas) e **miniatura** (até 560 px, qualidade 76). Metadados (EXIF, GPS) são descartados. Se qualquer passo falhar, nada fica gravado pela metade.
3. **Detalhe suficiente para ver o carrinho:** na página do produto a foto abre numa janela de **ampliação com "tamanho real"** (a de 1400 px). Se quiser mais detalhe, aumente o `1400` em `src/server/storage/images.ts` (com 1800 px as fotos ocupam cerca de 65% mais espaço).

### Onde as fotos ficam (`STORAGE_DRIVER`)

| Valor | Onde | Quando usar | Cuidados |
|---|---|---|---|
| `local` | Pasta `UPLOAD_DIR` | Computador e servidor próprio (padrão) | A pasta precisa ser **persistente** e entrar no backup. |
| `database` | No PostgreSQL (tabela `stored_files`) | **Padrão no Netlify** (sem pasta permanente). Zero contas novas, zero custo extra | Ocupa o espaço do banco (ver abaixo). Há teto de segurança (`STORAGE_DB_MAX_MB`, padrão 300 MB) e bloqueio quando o banco chega a 90% do plano (`DATABASE_PLAN_LIMIT_MB`). |
| `s3` | Serviço externo compatível com S3 (Cloudflare R2, Neon Object Storage...) | Catálogo grande, ou para poupar o banco, o tráfego do Neon e o backup | Precisa de conta, bucket e chaves (`S3_*`). **Não validado com serviço real.** |

### Quanto espaço as fotos ocupam: ESTIMATIVA (não é medida das suas fotos)

**Como foi calculado:** passei **fotos reais de exemplo** (8 imagens públicas: motocicleta, retrato, xícara, templo, flor, gato e duas texturas densas) pelo **mesmo tratamento do servidor** (WebP qualidade 80 e 76) e medi os **bits por pixel**: de 0,6 (flor, muito liso) a 2,9 (grama, pior caso), com as fotos comuns entre 1,0 e 1,9. Fotos de produto com fundo liso tendem a ficar abaixo disso. Aplicando 0,5 / 1,0 / 1,9 bits por pixel a uma foto de 1400 × 1050 px mais a miniatura de 560 × 420 px, cada foto (grande + miniatura) ocupa cerca de **105 KB (otimista), 210 KB (central) ou 395 KB (pessimista)**. Não tenho fotos das suas miniaturas: **o medidor do painel mostra o valor real** assim que as primeiras fotos forem enviadas (divida os MB do medidor pelo número de fotos para refazer a conta).

| Catálogo | Fotos | Otimista | Central | Pessimista |
|---|---|---|---|---|
| 100 produtos × 3 fotos | 300 | 30 MB | 61 MB | 116 MB |
| 300 produtos × 4 fotos | 1.200 | 122 MB | 244 MB | 463 MB |
| 600 produtos × 4 fotos | 2.400 | 244 MB | 488 MB | 927 MB |
| 1.000 produtos × 5 fotos | 5.000 | 508 MB | 1.016 MB | 1.931 MB |

**Leitura:** com o teto padrão de 300 MB, cabem cerca de **740 / 370 / 190 produtos de 4 fotos** (otimista / central / pessimista). Os 1.024 MB do Neon gratuito são **divididos** com pedidos, clientes e todo o resto (alguns MB, no começo). Fotos de eventos e a logo são poucas e pequenas (até ~200 KB cada).

### Impacto no desempenho e no backup quando as fotos ficam no banco

- **Leitura:** cada foto que não está no cache vira uma consulta ao banco e uma execução de função (uma miniatura tem ~30 KB; a foto grande, ~180 KB). Ela sai com cache de **1 ano** no navegador e pede ao CDN do Netlify que a guarde (`Netlify-CDN-Cache-Control`). **O efeito real do CDN só pode ser conferido depois da publicação.** Sem esse cache, uma página de lista (24 miniaturas ≈ 0,7 MB) gastaria 0,7 MB do tráfego de saída do Neon (5 GB por mês) a cada visita.
- **Neon:** foto no banco consome armazenamento (1 GB), tráfego de saída (5 GB por mês) e mantém o banco acordado (CU-horas). Estourar tráfego ou CU-horas **suspende o banco** até o próximo ciclo (a loja inteira fica sem dados). Veja [Limites dos planos gratuitos](#limites-reais-dos-planos-gratuitos).
- **Backup:** o banco fica maior, então o `pg_dump` fica maior e mais lento (WebP já é comprimido: 300 MB de fotos ≈ 300 MB a mais no backup) e a restauração demora mais. O histórico gratuito do Neon (6 horas, até 1 GB-mês de alterações) tende a ser consumido mais rápido quando se enviam muitas fotos de uma vez.
- **Com `s3`** o banco continua pequeno (poucos MB), o backup do banco é rápido e as fotos saem do tráfego e das CU-horas do Neon. O custo é ter mais um serviço e **cuidar de uma cópia das fotos** (os serviços gratuitos não fazem versões por padrão).

### Recomendação

1. **Para começar:** deixe as fotos no PostgreSQL (`database`) com o teto de 300 MB, `DATABASE_PLAN_LIMIT_MB=1024` e o medidor do Resumo à vista. Não exige conta nova nem custo.
2. **Passe para um serviço externo** quando o medidor chegar a **70%** (o painel avisa), quando o Neon se aproximar do limite de tráfego ou de CU-horas, ou se você já sabe que terá **centenas de produtos com várias fotos**.
3. Os dois serviços testados em teoria têm cota gratuita: **Cloudflare R2** (10 GB de armazenamento, 1 milhão de operações de gravação e 10 milhões de leitura por mês, **sem cobrança de tráfego de saída**; costuma pedir um meio de pagamento para ativar, confirme ao criar a conta) e **Neon Object Storage** (5 GB por projeto, mesma conta do banco, só em 4 regiões da AWS, sem região no Brasil). **Nenhum dos dois foi testado de verdade.**
4. **Trocar depois não perde nada:** o endereço das fotos (`/uploads/...`) não muda, e `npm run storage:migrate -- --de-banco --aplicar` copia as fotos do banco para o serviço, sem apagar nem sobrescrever nada.

### Passar as fotos do banco para um serviço externo (passo a passo)

1. **Crie o bucket e as chaves** no serviço escolhido. Cloudflare R2: bucket em R2, depois um token de API com permissão de leitura e escrita nesse bucket (formato habitual: endereço `https://ID_DA_CONTA.r2.cloudflarestorage.com`, região `auto`). Neon Object Storage: `neon buckets create` e `neon credentials create --scope storage:read --scope storage:write`; o endereço é o `s3_endpoint` devolvido pela API (algo como `https://br-...storage.c-2.us-east-2.aws.neon.tech`), a região é a do projeto (ex.: `us-east-2`), o "access key" é o `token_id` e a chave secreta é a `s3_secret_access_key` (mostrada **uma única vez**). Nos dois casos o endereço é no formato "caminho" (`endereço/bucket/arquivo`), que é o que a loja usa. Guarde as chaves em local seguro; nunca por chat.
2. **Simule a cópia** no PowerShell (não grava nada), com as variáveis só nesta janela:
   ```powershell
   $env:DATABASE_URL = "CONEXAO_DO_BANCO"
   $env:STORAGE_DRIVER = "s3"
   $env:S3_ENDPOINT = "https://..."; $env:S3_REGION = "auto"; $env:S3_BUCKET = "nome-do-bucket"
   $env:S3_ACCESS_KEY_ID = "..."; $env:S3_SECRET_ACCESS_KEY = "..."
   npm.cmd run storage:migrate -- --de-banco
   ```
   Ele diz quantas fotos serão copiadas, quantas já estão no destino e se alguma está sem arquivo.
3. **Copie de verdade:** `npm.cmd run storage:migrate -- --de-banco --aplicar`. Pode rodar de novo sem problema: o que já está no destino não é sobrescrito.
4. **No Netlify**, defina `STORAGE_DRIVER=s3` e as variáveis `S3_*` e publique (uma publicação gasta 15 créditos; junte com outras mudanças). Opcional: `STORAGE_PUBLIC_BASE_URL` (só com um endereço público do bucket em domínio seu; exige configurar DNS, decisão sua). Sem ele, as fotos continuam saindo pela loja em `/uploads/...`.
5. **Confira** que as fotos aparecem na loja e no painel.
6. **Opcional, só depois do passo 5 e com backup feito:** liberar o espaço no banco com `TRUNCATE stored_files;`. **Cuidado: isso apaga as cópias do banco; só faça depois de `STORAGE_DRIVER=s3` estar valendo e as fotos aparecendo.**

Fotos enviadas pelo painel e ainda não salvas no produto ficam "soltas" e são removidas sozinhas após 24 horas (manutenção). Fotos de uma **pasta** (loja que já rodava antes): `npm run storage:migrate -- --aplicar` copia da pasta para o armazenamento definido em `STORAGE_DRIVER` (`--de=CAMINHO` indica outra pasta).

Para outro tipo de armazenamento, um desenvolvedor implementa `StorageProvider` (`src/server/storage/types.ts`: `put`, `get`, `delete`, `publicUrl`) e o devolve em `getStorage()`; o resto do sistema só conhece chaves como `products/abc.webp`.

---

## Manutenção automática

### O que ela faz (exatamente, e nada além disto)

**Grupo "pedidos"** (mexe em pedidos e estoque, por isso é o mais cuidadoso):

1. Cancela pedidos **NÃO PAGOS** cujo prazo de pagamento acabou e **devolve o estoque reservado**. Só pedidos "pendente" ou "aguardando pagamento" com prazo vencido; cada pedido numa transação própria, com trava na linha (se o pagamento chegar no mesmo instante, só um dos dois vence); no máximo 200 por execução. **Pedido pago nunca é tocado.**

**Grupo "limpeza"** (não toca em pedidos, estoque nem pagamentos):

2. Apaga sessões de login vencidas.
3. Apaga fotos de produto enviadas há mais de 24 horas e nunca ligadas a um produto.
4. Apaga fotos de evento enviadas há mais de 24 horas e que nenhum evento ou modelo usa.
5. Apaga registros com mais de 90 dias do histórico de avisos de pagamento (webhooks).

É segura para rodar a qualquer momento e várias vezes ao mesmo tempo, e cada consulta usa índice (custo baixo). O Resumo do painel mostra a última execução, quem a disparou e quantos pedidos vencidos ainda esperam.

### Quem dispara (e quem NÃO dispara)

| Onde | Como | Observação |
|---|---|---|
| **Servidor próprio** | Roda **sozinha a cada 5 minutos** dentro da loja (sem configurar nada). | Opcional, para mais garantia: `*/10 * * * * cd /opt/loja && npm run maintenance` no cron do servidor. |
| **Netlify** | **Função agendada** `netlify/functions/manutencao.mts`, **de hora em hora**, que chama `POST /api/cron/maintenance` com o `CRON_SECRET`. | Precisa de `CRON_SECRET` (16+ caracteres) e `SITE_URL`. Só roda em publicações de produção. Custo: 24 execuções por dia, cada uma de poucos segundos. Para mudar a frequência, edite `schedule` no arquivo (formato cron, horário UTC). |
| **Rede de segurança (dono)** | Quando o **dono** abre o painel, a manutenção roda **depois de a página responder**, no máximo uma vez a cada 10 minutos (trava no banco, vale para várias instâncias). | Cobre o caso de o agendador ainda não estar configurado. |
| **Botão no Resumo** | "Executar manutenção agora". | Só para o dono. |
| **Visitas de clientes** | **Nunca disparam** a manutenção. | Nada pesado roda a cada requisição da loja; pedidos, estoque e pagamentos não dependem disso para funcionar. |

A rota `/api/cron/maintenance` **fica desligada** (responde 503) se `CRON_SECRET` não existir e responde 401 a quem não envia o segredo certo (comparação em tempo constante). Chamada de fora, se preferir: `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://seu-dominio/api/cron/maintenance`.

**Limite do plano gratuito:** a função agendada acorda o banco do Neon 24 vezes por dia (cerca de 15 das 100 CU-horas do mês, estimativa). Se a loja tiver pouco movimento, a cada 3 horas costuma bastar. A função agendada do Netlify tem limite de tempo curto (30 s); a rotina é pequena e tem teto de 200 pedidos por execução.

---

## Atualizar a loja e fazer backup

**Backup do banco (faça antes de atualizar e também de forma agendada).** Servidor próprio:

```bash
pg_dump -U loja -h localhost loja | gzip > backup-$(date +%F).sql.gz
tar czf uploads-$(date +%F).tgz /var/loja/uploads      # só se as fotos ficam numa pasta (STORAGE_DRIVER=local)
```

Guarde as cópias **fora** do servidor. Para restaurar: `gunzip -c backup.sql.gz | psql -U loja -h localhost loja` e extraia as fotos de volta.

**Banco no Neon (Netlify).** No PowerShell, com a conexão **direta** do painel do Neon (use aspas):

```powershell
pg_dump "CONEXAO_DIRETA_DO_NEON" -Fc -f backup-2026-01-31.dump
# restaurar num banco VAZIO (novo): pg_restore -d "CONEXAO_DO_BANCO_NOVO" backup-2026-01-31.dump
```

- O plano gratuito do Neon guarda só **6 horas** de histórico para voltar no tempo: **não** substitui o seu backup. Guarde o arquivo também fora do computador.
- **Fotos no banco** (`STORAGE_DRIVER=database`) já vão dentro do `.dump` (ele fica maior). **Fotos em serviço externo** (`s3`) **não** vão no `.dump`: guarde também uma cópia do bucket com a ferramenta do serviço.
- Nunca teste restauração ou migração no banco real: use um banco de ensaio.

**Atualizar** (servidor próprio):

```bash
cd /opt/loja
git pull
npm ci
npm run db:migrate
npm run build
sudo systemctl restart loja
```

**Atualizar no Netlify:** faça o backup, rode `npm.cmd run db:migrate` **do seu computador** contra o Neon (conexão direta; o Netlify não roda migrações), e só então publique. As migrações são aditivas, então a versão antiga da loja continua funcionando entre uma etapa e outra.

---

## Segurança

O que está implementado:

- Senhas com **scrypt** + sal; sessões com token aleatório (só o **hash** fica no banco), cookie `HttpOnly`, `SameSite=Lax` e `Secure` em HTTPS; administrador dura menos que cliente.
- Papéis **CLIENTE/ADMIN** verificados **no servidor, no banco, a cada requisição** (cookie não carrega o papel). Toda ação e página do admin exige ADMIN; cliente comum recebe 404 nas páginas do `/admin`.
- Administrador só é criado por `npm run admin:create`.
- Limite de tentativas em login (por e-mail e por IP), cadastro, finalização de compra, upload, cálculo de frete, assistente da loja e IA (em memória, **por instância**: reinicia com o servidor e, no Netlify, cada instância tem o seu). Senhas de clientes: mínimo 8 caracteres.
- Validação de todos os dados no servidor (zod). SQL só por consultas parametrizadas (sem montar SQL com texto do usuário). Textos exibidos são escapados pelo React. O único `dangerouslySetInnerHTML` do projeto é o JSON de dados estruturados do Google (SEO), sempre gerado com `JSON.stringify` e com `<` escapado.
- CSRF: Server Actions protegidas pelo Next.js (Origin/Host) e a API de upload exige Origin do próprio site.
- Cabeçalhos de segurança (HSTS em produção, `X-Frame-Options`, `nosniff`...). Webhook com assinatura HMAC e comparação em tempo constante.
- Segredos só em variáveis de ambiente do servidor.

**Checklist antes de abrir ao público:** HTTPS ativo · `SITE_URL` com `https://` · `TRUST_PROXY=true` atrás do proxy · `.env` com permissão 600 · senha forte do administrador · backup agendado (banco e fotos) · **seed nunca executado** em produção · compra de teste real aprovada e reembolsada.

**Dependências (verificado em 30/10/2026): Next.js 16.4.3 e zod 4.6.7.** Esta versão já usa as versões corrigidas; a anterior usava Next.js 16.4.0 e zod 4.6.5, que tinham avisos de segurança (3 no Next, classificados como críticos/altos, e 1 no zod, alto). Conferido no `package.json` e no `package-lock.json` (instalação do zero com `npm ci` e `npm ls` mostram uma única cópia de cada) e com `npm audit --omit=dev`: **0 avisos** nas dependências que vão para o servidor. O `npm audit` completo ainda mostra 4 avisos **moderados** na cadeia `drizzle-kit → esbuild`: é só ferramenta de desenvolvimento (gera migrations no seu computador e nunca roda no servidor), e a correção que o npm sugere (`npm audit fix --force`) **troca o drizzle-kit por uma versão antiga e incompatível**, por isso não foi aplicada. Se você já tinha a versão anterior instalada, depois de trocar os arquivos rode `npm.cmd ci` (instala exatamente o que está no `package-lock.json`). Rode `npm audit` de tempos em tempos.

Limite conhecido: o limite de tentativas é por processo/instância. **No Netlify (várias instâncias) ele protege menos**; com mais de um servidor também. Use limitação no proxy ou no próprio Netlify/Cloudflare se notar abuso.

---

## Testes automatizados

```bash
npm test            # exige PostgreSQL rodando
npm run typecheck
```

Os testes usam um banco **separado** chamado `loja_test` (padrão `postgres://loja:loja_dev_pw@localhost:5432/loja_test`; para mudar, defina `TEST_DATABASE_URL`). Eles **recriam esse banco do zero a cada execução**, por isso o nome do banco precisa terminar em `_test` (senão se recusam a rodar, para nunca apagar a loja real). Crie-o uma vez: `sudo -u postgres psql -c "CREATE DATABASE loja_test OWNER loja;"`.

**Resultado atual (30/10/2026, com Next.js 16.4.3 e zod 4.6.7): 23 arquivos, 421 testes, todos passando; `tsc --noEmit` sem erros; build de produção concluído sem avisos.** Não há configuração de ESLint no projeto (não existe verificação de estilo automática).

Cobertura: frete pelo CEP (pacote, SuperFrete simulada, reserva, cache, valor recalculado no servidor); InfinitePay simulado; assistente de compras; senhas/sessões/permissões/CSRF; carrinho; criação de pedido com estoque (incluindo compras simultâneas do último item); expiração e devolução de estoque; ciclo de status; webhook do Mercado Pago e do PayPal (assinatura, idempotência, valor divergente, recusado, captura, reembolso); catálogo de colecionáveis e filtros; vitrine; recuperação de senha; permissões de **todas** as ações do painel; upload de imagem (formatos falsos, SVG, tamanho); números do dashboard; assistente de IA com provedor simulado; utilitários de dinheiro/texto/formulários. **Novos nesta etapa:** eventos (modelos, participações por data, edição de uma data sem mexer no modelo, aplicar o modelo às próximas datas com confirmação, cancelar/reativar/excluir, janela pública do calendário, API pública e do painel, permissões); armazenamento de fotos (pasta, banco, S3 simulado com assinatura SigV4 conferida contra exemplos da AWS, teto de espaço, entrega com cache e 304, redução da foto no navegador); manutenção (cada tarefa, trava de 10 minutos, rota protegida por segredo); importação de produtos por planilha (prévia, erros por linha, confirmação, duplicados, produtos existentes intactos); cadastro rápido (duplicar, filtros); cópia de fotos entre armazenamentos; vitrine abrindo mesmo quando a migração 0005 ainda não foi aplicada.

Os testes de PayPal, InfinitePay, Mercado Pago, SuperFrete, IA e S3 usam servidores/respostas **simulados**: provam a lógica da loja, não a integração com os serviços reais.

**Roteiros de navegador** (Chromium headless com Playwright e auditoria axe-core): foram usados na verificação, em build de produção e banco de teste novo (eventos 17/17; importação e produtos 12/12; interface do celular e do computador 25/25; acessibilidade de 34 páginas do painel e do cliente sem violações; regressão da loja — vitrine, painel, compra com PayPal simulado até "pago", webhook assinado, reembolso — 26/26; frete pela SuperFrete simulada, assistente e painel 19/19; **InfinitePay simulado** — checkout, link de pagamento, webhook com segredo, pago a menos ou com valor diferente, retorno à loja — 10/10; sondas HTTP — painel exige login, manutenção 401/200, fotos sem travessia de pasta, webhook sem segredo, loja aberta sem a migração 0005 — 8/8; capturas em 320, 360, 390, 768, 1024 e 1280 px sem estouro lateral, inclusive a 320 px com as fontes da web ainda não carregadas). **Esses roteiros não fazem parte do projeto.** Não foram feitos testes em aparelhos reais nem em Safari/Firefox.

---

## Estrutura do projeto

```
src/app/(shop)/      páginas públicas (/, /produtos, /eventos, /carrinho, /checkout, /minha-conta...)
src/app/admin/       painel do dono (produtos, importação CSV, eventos e modelos, pedidos, estoque...)
src/app/api/         webhooks (PayPal, InfinitePay, Mercado Pago), upload de fotos, frete, assistente da loja,
                     eventos (público e do painel), rotina de manutenção (/api/cron/maintenance)
src/app/uploads/     entrega das fotos (/uploads/...), com cache longo
src/components/      interface (ui.tsx, brand, shop/, events/, admin/)
src/lib/             regras puras: dinheiro, textos, validações (zod), eventos, planilha CSV, redução de foto no navegador
src/server/          TUDO que roda só no servidor:
  db/                tabelas (schema.ts) e conexão
  services/          regras de negócio: produtos, estoque, carrinho, pedidos, pagamentos, eventos, importação, manutenção...
  actions/           Server Actions (formulários)
  payments/          PaymentProvider + PayPal (padrão) + InfinitePay + Mercado Pago (opcional)
  shipping/          ShippingProvider: valor fixo e SuperFrete (SEDEX/PAC/Mini), pacote, cache
  storage/           StorageProvider (pasta, PostgreSQL ou serviço S3), tratamento das imagens, medidor de espaço,
                     cópia entre armazenamentos
  ai/                AiProvider + assistente de produtos (painel) + assistente de compras (loja)
  auth/ security/    sessões, senhas, permissões, CSRF, limite de tentativas
netlify/functions/   função agendada da manutenção (só usada no Netlify)
drizzle/             migrations SQL (0000 a 0005)
scripts/             migrate, seed (só adiciona demonstração), create-admin, maintenance, storage-migrate, make-brand-assets
tests/               testes automatizados (vitest)
```

Regra do projeto: componentes do navegador só podem importar **tipos** de `@/server/*` (exceto as Server Actions), para que código e segredos do servidor nunca cheguem ao navegador.
