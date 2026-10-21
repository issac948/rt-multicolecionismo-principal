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
10. [Publicar na internet (produção)](#publicar-na-internet-produção)
11. [PayPal (pagamento)](#paypal-pagamento)
12. [InfinitePay (pagamento, maquininha)](#infinitepay-pagamento)
13. [Mercado Pago (opcional)](#mercado-pago-opcional)
14. [Frete pelo CEP (SEDEX / SuperFrete)](#frete)
15. [Assistente de IA (painel e clientes)](#assistente-de-ia)
16. [Imagens, manutenção, backup, segurança, testes, estrutura](#imagens-armazenamento)

---

## O que é

**Negócio:** a RT **não tem loja física**; o dono vende em feiras e agora também aqui, que é a loja online oficial. O sistema não inventa endereço, rede social nem data de feira: isso só aparece depois que o dono cadastra em **Configurações**. O WhatsApp/telefone (+55 41 9141-9031) e o grupo de clientes do WhatsApp já vêm preenchidos com o que o dono informou (confira o número, veja abaixo).

**Para o cliente:** página inicial (miniaturas de carros em primeiro lugar, com Destaques e Novidades; bonecos e colecionáveis em área própria), catálogo com filtros (categoria, marca, escala, série, lacrado/solto, tipo, preço, promoção, estoque — só aparecem filtros que têm o que escolher), categorias, busca, página de cada produto, carrinho (guardado mesmo sem login), checkout, **frete calculado pelo CEP** (SEDEX/PAC, quando o dono liga), pagamento (**PayPal, InfinitePay ou Mercado Pago**, o que o dono escolher), "Minha conta", "Meus pedidos", acompanhamento do pedido e um **assistente de compras com IA** (opcional) que ajuda a achar miniaturas e responde dúvidas de entrega e pagamento. A retirada é "em mãos", combinada com a loja. Há botões de WhatsApp (inclusive "Perguntar sobre este produto no WhatsApp", que já leva o nome e o link do produto), telefone e grupo de clientes.

**Para o dono (`/admin`):** resumo, cadastro/edição de produtos com várias fotos (os dados de colecionador — marca, modelo, escala, série, ano, lacrado/solto, estado da embalagem, conservação — são **todos opcionais**), categorias, estoque com histórico, pedidos (enviar, rastreio, reembolsar), clientes (gera link para o cliente criar nova senha), configurações (nome, logo, WhatsApp, telefone, link do grupo de WhatsApp, **seu endereço de postagem e como o frete é calculado**, assistente da loja) e um assistente de IA que **sugere** o cadastro (nada é publicado sem o dono confirmar).

**Tecnologia:** Next.js 16 (React 19, TypeScript), PostgreSQL 16, Drizzle ORM, Tailwind CSS 4. Dinheiro em **centavos inteiros**.

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
| Publicação em servidor com domínio e HTTPS | **IMPLEMENTADA, MAS NÃO VERIFICADA** (precisa de servidor e domínio reais). |

---

## O que o dono precisa configurar

1. **Em `/admin/configuracoes`:** confira o **WhatsApp/telefone** (já vem +55 41 9141-9031; veja se precisa do 9 na frente) e o grupo; Instagram/e-mail (opcionais); **entrega** (obrigatório escolher: valor fixo, ou calculado pelo CEP com o **seu endereço de postagem**, ou só retirada em mãos); instruções de retirada; o **aviso sobre feiras** (opcional; só aparece na loja se você escrever); e se o **assistente de compras** aparece para os clientes. Se não tiver endereço de loja, deixe em branco. A logo oficial já vem aplicada.
2. **Pagamento:** escolha `PAYMENT_PROVIDER` no `.env` e preencha as chaves do serviço: [PayPal](#paypal-pagamento), [InfinitePay](#infinitepay-pagamento) ou [Mercado Pago](#mercado-pago-opcional). Sem isso a loja mostra o catálogo, mas **não finaliza compras** (e avisa o cliente).
3. **Categorias:** em `/admin/categorias`, clique em **Criar categorias sugeridas** (Miniaturas de carros › Hot Wheels, Mini GT, Matchbox, Outras marcas; Outras miniaturas e veículos; Bonecos e colecionáveis; Expositores e acessórios). Cada categoria tem um **tipo** (carros, bonecos/colecionáveis ou outros) que define quais campos aparecem ao cadastrar o produto; subcategorias herdam o tipo da mãe. Na loja só aparecem categorias com produto publicado.
4. **Produtos reais:** cadastre em `/admin/produtos/novo` e depois use **Resumo → Remover produtos de demonstração**.
5. **Frete pelo CEP (opcional):** crie o token na sua conta SuperFrete, coloque em `SUPERFRETE_TOKEN` no `.env`, preencha seu endereço de postagem e use a seção **Testar o frete** (veja [Frete](#frete)).
6. **IA (opcional):** `AI_PROVIDER` + `AI_API_KEY` no `.env` ligam o assistente do painel (`/admin/ia`) e o assistente de compras dos clientes (veja [Assistente de IA](#assistente-de-ia)).

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
| `UPLOAD_DIR` | Recomendada | Pasta das fotos enviadas pelo painel. Em produção, use uma pasta **persistente** (padrão `./storage/uploads`). |
| `PAYMENT_PROVIDER` | Não | `paypal` (padrão), `infinitepay` ou `mercadopago` |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | Para vender | Credenciais do app no PayPal Developer |
| `PAYPAL_WEBHOOK_ID` | Para vender | ID do webhook cadastrado no PayPal. Sem ele, o aviso automático do PayPal é recusado. |
| `PAYPAL_ENV` | Sim | `sandbox` (testes, sem dinheiro de verdade; padrão) ou `live` (vendas reais) |
| `PAYPAL_API_BASE` | Não | **Deixe em branco.** Só para testes contra um servidor simulado. |
| `INFINITEPAY_HANDLE` / `INFINITEPAY_WEBHOOK_TOKEN` | Só se usar InfinitePay | Sua InfiniteTag e um segredo de 16+ caracteres. Veja [InfinitePay](#infinitepay-pagamento). `INFINITEPAY_API_BASE`: deixe em branco. |
| `MERCADOPAGO_*` | Só se usar Mercado Pago | Veja [Mercado Pago (opcional)](#mercado-pago-opcional) |
| `SUPERFRETE_TOKEN` | Só para frete pelo CEP | Token da sua conta SuperFrete. Opcionais: `SUPERFRETE_CONTACT_EMAIL`, `SUPERFRETE_TIMEOUT_MS` (padrão 6000); `SUPERFRETE_API_BASE`: deixe em branco. Veja [Frete](#frete). |
| `CRON_SECRET` | Opcional | Segredo (16+ caracteres) para chamar `/api/cron/maintenance` de fora. |
| `TRUST_PROXY` | Em produção atrás de proxy | `true` se a loja está atrás de Nginx/Caddy/Cloudflare. |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` / `AI_BASE_URL` | Não | IA: `anthropic`, `openai` (API compatível) ou `none` (padrão) |
| `AI_SHOP_DAILY_LIMIT` | Não | Teto de perguntas por dia no assistente dos **clientes** (padrão 500), para limitar seu gasto com a IA. |

---

## Banco de dados e migrations

As tabelas são criadas por **migrations** versionadas (pasta `drizzle/`), **aditivas** (não apagam dados). O comando é seguro para repetir:

```powershell
npm.cmd run db:migrate
```

Rode-o na primeira instalação e **a cada atualização** (aplica `0001` a `0004`; a `0003` só esconde produtos/categorias de demonstração do seed antigo e devolve ao "não configurado" textos e frete que ainda sejam os de exemplo; a `0004` só preenche WhatsApp, telefone e grupo se estiverem em branco — o que o dono digitou é sempre preservado). As configurações novas (frete pelo CEP, assistente) não precisam de migração: são guardadas como configuração com valores padrão. Faça um backup do banco antes de atualizar (veja [Atualizar a loja e fazer backup](#atualizar-a-loja-e-fazer-backup)).

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

## Imagens (armazenamento)

- As fotos enviadas pelo painel são **validadas e regravadas como WebP** (some qualquer arquivo que não seja imagem de verdade; SVG é recusado), em duas versões (grande e miniatura).
- Ficam na pasta `UPLOAD_DIR`. **Ela precisa ser persistente e entrar no backup.**
- Para guardar em outro lugar (Amazon S3, Cloudflare R2...): crie uma classe que implemente `StorageProvider` em `src/server/storage/index.ts` (métodos `put`, `get`, `delete`, `publicUrl`) e devolva-a em `getStorage()`. O resto do sistema só conhece chaves como `products/abc.webp`.

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

## Manutenção automática

Pedidos que ninguém pagou no prazo são cancelados e o estoque volta. Isso roda **sozinho a cada 5 minutos dentro da própria loja**, sem configurar nada. A mesma rotina também limpa sessões vencidas, fotos "soltas" e registros antigos de webhooks.

Opcional (vários servidores ou mais garantia): agende no cron do servidor

```bash
*/10 * * * * cd /opt/loja && npm run maintenance
# ou, de fora:  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://seu-dominio/api/cron/maintenance
```

---

## Atualizar a loja e fazer backup

**Backup (faça antes de atualizar e também de forma agendada):**

```bash
pg_dump -U loja -h localhost loja | gzip > backup-$(date +%F).sql.gz
tar czf uploads-$(date +%F).tgz /var/loja/uploads
```

Guarde as cópias **fora** do servidor. Para restaurar: `gunzip -c backup.sql.gz | psql -U loja -h localhost loja` e extraia as fotos de volta.

**Atualizar:**

```bash
cd /opt/loja
git pull
npm ci
npm run db:migrate
npm run build
sudo systemctl restart loja
```

---

## Segurança

O que está implementado:

- Senhas com **scrypt** + sal; sessões com token aleatório (só o **hash** fica no banco), cookie `HttpOnly`, `SameSite=Lax` e `Secure` em HTTPS; administrador dura menos que cliente.
- Papéis **CLIENTE/ADMIN** verificados **no servidor, no banco, a cada requisição** (cookie não carrega o papel). Toda ação e página do admin exige ADMIN; cliente comum recebe 404 nas páginas do `/admin`.
- Administrador só é criado por `npm run admin:create`.
- Limite de tentativas em login (por e-mail e por IP), cadastro, finalização de compra, upload, cálculo de frete, assistente da loja e IA (em memória; reinicia com o servidor). Senhas de clientes: mínimo 8 caracteres.
- Validação de todos os dados no servidor (zod). SQL só por consultas parametrizadas (sem montar SQL com texto do usuário). Textos exibidos são escapados pelo React. O único `dangerouslySetInnerHTML` do projeto é o JSON de dados estruturados do Google (SEO), sempre gerado com `JSON.stringify` e com `<` escapado.
- CSRF: Server Actions protegidas pelo Next.js (Origin/Host) e a API de upload exige Origin do próprio site.
- Cabeçalhos de segurança (HSTS em produção, `X-Frame-Options`, `nosniff`...). Webhook com assinatura HMAC e comparação em tempo constante.
- Segredos só em variáveis de ambiente do servidor.

**Checklist antes de abrir ao público:** HTTPS ativo · `SITE_URL` com `https://` · `TRUST_PROXY=true` atrás do proxy · `.env` com permissão 600 · senha forte do administrador · backup agendado (banco e fotos) · **seed nunca executado** em produção · compra de teste real aprovada e reembolsada.

Dependências: `npm audit --omit=dev` (o que roda em produção) não aponta vulnerabilidades. O `npm audit` completo mostra 4 avisos de severidade moderada na cadeia `drizzle-kit → esbuild`, que é só ferramenta de desenvolvimento (gera migrations no seu computador) e não vai para o servidor em uso. Rode `npm audit` de tempos em tempos e atualize as dependências.

Limite conhecido: o limite de tentativas é por processo. Com mais de um servidor, use também limitação no proxy (Cloudflare/Nginx).

---

## Testes automatizados

```bash
npm test            # exige PostgreSQL rodando
npm run typecheck
```

Os testes usam um banco **separado** chamado `loja_test` (padrão `postgres://loja:loja_dev_pw@localhost:5432/loja_test`; para mudar, defina `TEST_DATABASE_URL`). Eles **recriam esse banco do zero a cada execução**, por isso o nome do banco precisa terminar em `_test` (senão se recusam a rodar, para nunca apagar a loja real). Crie-o uma vez: `sudo -u postgres psql -c "CREATE DATABASE loja_test OWNER loja;"`.

Cobertura: frete pelo CEP (pacote, SuperFrete simulada, reserva, cache, valor recalculado no servidor); InfinitePay simulado; assistente de compras; senhas/sessões/permissões/CSRF; carrinho; criação de pedido com estoque (incluindo compras simultâneas do último item); expiração e devolução de estoque; ciclo de status; webhook do Mercado Pago e do PayPal (assinatura, idempotência, valor divergente, recusado, captura, reembolso); catálogo de colecionáveis e filtros (inclui série e categoria); vitrine (Destaques/Novidades sem produto repetido, textos e frete sem valores inventados, migração `0003`); recuperação de senha; permissões de **todas** as ações do painel; upload de imagem (formatos falsos, SVG, tamanho); números do dashboard; assistente de IA com provedor simulado; utilitários de dinheiro/texto/formulários.

Os testes de PayPal, InfinitePay, Mercado Pago, SuperFrete e IA usam servidores/respostas **simulados**: provam a lógica da loja, não a integração com os serviços reais.

---

## Estrutura do projeto

```
src/app/(shop)/      páginas públicas (/, /produtos, /carrinho, /checkout, /minha-conta...)
src/app/admin/       painel do dono
src/app/api/         webhooks (PayPal, InfinitePay, Mercado Pago), upload, frete, assistente da loja, rotina de manutenção
src/components/      interface (ui.tsx, shop/, admin/)
src/lib/             regras puras: dinheiro, textos, validações (zod)
src/server/          TUDO que roda só no servidor:
  db/                tabelas (schema.ts) e conexão
  services/          regras de negócio: produtos, estoque, carrinho, pedidos, pagamentos...
  actions/           Server Actions (formulários)
  payments/          PaymentProvider + PayPal (padrão) + InfinitePay + Mercado Pago (opcional)
  shipping/          ShippingProvider: valor fixo e SuperFrete (SEDEX/PAC/Mini), pacote, cache
  storage/           StorageProvider (imagens)
  ai/                AiProvider + assistente de produtos (painel) + assistente de compras (loja)
  auth/ security/    sessões, senhas, permissões, CSRF, limite de tentativas
drizzle/             migrations SQL
scripts/             migrate, seed (só adiciona demonstração), create-admin, maintenance, make-brand-assets
tests/               testes automatizados (vitest)
```

Regra do projeto: componentes do navegador só podem importar **tipos** de `@/server/*` (exceto as Server Actions), para que código e segredos do servidor nunca cheguem ao navegador.
