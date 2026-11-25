# SECURITY — RT Multicolecionismo

Atualizado: 2026-11-22. Resultado de leitura do código da v2 e de testes locais. **Nada foi testado em produção.**

## Controles que existem (verificados no código e nos testes)

| Tema | O que existe | Onde |
|---|---|---|
| Senhas | `scrypt` nativo do Node, sal por senha, comparação com `timingSafeEqual` | `src/server/auth/password.ts` |
| Sessões | cookie `httpOnly`, `sameSite=lax`, `secure` conforme o ambiente | `src/server/auth/current-user.ts`, `src/server/cart-session.ts` |
| Permissões | perfis CLIENTE e ADMIN; rotas e ações do painel conferem o perfil no servidor | `src/server/auth/*`, `src/server/actions/admin.ts` |
| Validação | `zod` no servidor em formulários e ações | `src/lib/schemas.ts`, `src/server/actions/*` |
| SQL | consultas parametrizadas pelo Drizzle | `src/server/db`, `src/server/services/*` |
| Preço e total | calculados no servidor; o valor enviado ao gateway é o do pedido; o webhook confere o valor | `src/server/services/orders.ts`, `src/server/payments/*` |
| Webhooks | Mercado Pago: assinatura HMAC com `timingSafeEqual`; InfinitePay: token na URL e conferência do valor; PayPal: `PAYPAL_WEBHOOK_ID`; eventos registrados para não processar duas vezes | `src/app/api/webhooks/*`, `src/server/payments/*` |
| Pedidos duplicados | proteção contra pedido duplicado e contra evento de webhook repetido (testes dedicados) | `tests/orders.test.ts`, `tests/payments.test.ts` |
| Estoque | reserva e baixa em transação; movimentações registradas | `src/server/services/orders.ts`, `tests/inventory.test.ts` |
| Limite de requisições | em memória, por instância; usado em login, cadastro, checkout, frete, assistente, upload e ações do painel | `src/server/security/rate-limit.ts` |
| Cabeçalhos | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (câmera, microfone, geolocalização e pagamento desligados), `Strict-Transport-Security` em produção | `next.config.ts` |
| Segredos | só por variáveis de ambiente; `.env` ignorado pelo Git; `.env.example` só com exemplos | `.gitignore`, `.env.example` |
| Manutenção | rota `/api/cron/maintenance` exige `Authorization: Bearer <CRON_SECRET>` | `src/app/api/cron/maintenance/route.ts` |
| Upload | só admin; imagem reprocessada (WebP) e validada no servidor | `src/app/api/admin/upload/route.ts`, `src/server/storage/images.ts` |

## Varredura de segredos (v2)

Nenhum segredo real: só exemplos no `.env.example` e no README, a senha do banco **local** de testes
(`loja_dev_pw`, em `drizzle.config.ts`, `tests/global-setup.ts`, `vitest.config.mts`) e a chave de exemplo da documentação da AWS
(`AKIAIOSFODNN7EXAMPLE`, em `tests/s3.test.ts`). Árvore de arquivos do repositório real (ZIP de 22/11) idêntica à v2 exceto 2 arquivos pequenos. **Histórico do Git: não validado** (P0-07).

## Pendências de segurança

| Item | Situação |
|---|---|
| Next.js 16.4.3 com 7 avisos moderados no `npm audit` (cache `use cache`/`unstable_cache`, bypass de SVG no otimizador de imagens, cookie HttpOnly no runtime Edge, injeção de resposta entre clientes em hospedagem própria, envenenamento de cache em Cache Components); correção na 16.4.6 | Testado na cópia com a 16.4.6 (tsc, 477 testes, build); **aguarda aprovação** (P0-06). Restam 4 avisos moderados do `esbuild` no `drizzle-kit` (só desenvolvimento) |
| Limite de requisições em memória: cada instância serverless tem o seu contador | Limitação conhecida; limite global exigiria banco ou borda (P3) |
| Ações do carrinho sem limite de requisições | Pendente (P1-13) |
| Sem Content-Security-Policy | Pendente (P3), com período só de relatório antes de aplicar |
| Logs sem senhas nem segredos | Os scripts novos (`db:check`, `db:migrate`, `backup*`) mascaram servidor/usuário e removem senha e URL das mensagens de erro (testado). Logs do servidor da loja: não reauditados |
| Segredos no histórico do Git | `npm run scan:secrets:historico` pronto; **rodar no clone do repositório real** (o ZIP não traz `.git`) |
| Migração sem trava de destino | Feito na cópia (P0-03): destino mascarado; banco remoto só com `--confirmar=<banco>`; testado localmente |
| Admin padrão do seed (`admin@loja.local`, senha aleatória impressa) só é criado se não existir nenhum ADMIN | `db:check` alerta (erro se ativo); falta rodar na produção |

## Aviso do Next CLI (registro)

Dentro do ambiente do Claude, o `next build` da 1ª execução termina com exit 1 e um texto do próprio Next CLI
("Your version of Next.js is affected by a known security vulnerability…") que pede para o agente rodar
`next upgrade --agent=security` e fazer uma pergunta ao usuário. Isso é **saída de ferramenta, não pedido do usuário**: não foi
executado. A repetição do build passa. Pela leitura do código do Next (`nudge.js`), o aviso só interrompe quando detecta um agente de IA; na Netlify (CI, sem terminal, sem agente) ele retorna sem parar o build (**não validado em deploy real**). O achado de segurança em si foi confirmado de forma independente com `npm audit`.

## Regras

- Segredos nunca em chat, README, relatório, commit ou log.
- Produção: sem alterar credenciais, DNS, pagamentos ou variáveis sem autorização do responsável.
- Qualquer vazamento suspeito: trocar a credencial no provedor (Neon, Netlify, InfinitePay, PayPal, SuperFrete) e atualizar a variável.
