# ARCHITECTURE — RT Multicolecionismo

Atualizado: 2026-11-22. Base: v2 (Next.js 16.4.3, React 19, Drizzle ORM, PostgreSQL 16, zod 4, Tailwind 4).

## Visão geral

- **Loja pública** (`src/app/(shop)`): início, catálogo, categorias, produto, busca, carrinho, checkout, pedidos, conta, eventos.
- **Painel** (`src/app/admin`): resumo, produtos (cadastro, duplicar, importação CSV), categorias, estoque, pedidos, clientes, eventos, configurações, IA.
- **API** (`src/app/api`): frete, assistente de compras, eventos, upload e eventos do painel, manutenção (`/api/cron/maintenance`) e webhooks (InfinitePay, PayPal, Mercado Pago).
- **Fotos** (`/uploads/[...key]`): servidas pela aplicação a partir do driver de armazenamento.
- Hospedagem: **Netlify** (site e função agendada `netlify/functions/manutencao.mts`, de hora em hora) + **Neon** (PostgreSQL).
- O layout raiz usa `force-dynamic`: **todas as páginas são renderizadas a cada visita** (sem cache). Plano de mudança: P1-01.

## Pastas

| Pasta | Conteúdo |
|---|---|
| `src/app` | rotas (App Router), Server Actions chamadas pelos formulários |
| `src/components` | `shop/` (vitrine), `admin/` (painel), `events/`, `ui.tsx`, `brand.tsx` |
| `src/lib` | regras puras: dinheiro, textos, schemas zod, CSV, colecionáveis, constantes |
| `src/server/db` | schema Drizzle e conexão |
| `src/server/services` | regras de negócio: produtos, carrinho, pedidos, estoque, configurações, eventos, manutenção, dashboard |
| `src/server/actions` | Server Actions (autenticação, carrinho, checkout, painel, importação) |
| `src/server/auth` | sessões, senha (scrypt), usuário atual |
| `src/server/payments` | provedores: InfinitePay, PayPal, Mercado Pago (simulado) |
| `src/server/shipping` | SuperFrete e frete fixo de reserva |
| `src/server/storage` | drivers de fotos: `database`, `local`, `s3`, cópia entre eles, imagens (WebP 1400/560) |
| `src/server/ai` | assistente do painel e da loja; só texto; nunca publica sozinho |
| `src/server/security` | limite de requisições (em memória) |
| `drizzle` | migrações SQL aditivas `0000`–`0005` |
| `scripts` | `migrate`, `seed` (nunca `--reset`), `create-admin`, `maintenance`, `storage-migrate`, `check-repo` |
| `tests` | Vitest com banco PostgreSQL separado |
| `netlify/functions` | função agendada de manutenção |

## Fluxos principais

- **Carrinho**: no servidor. Visitante usa o cookie `loja_cart` (30 dias, `httpOnly`); logado usa o carrinho da conta; no login os dois são mesclados. Adicionar ao carrinho **não** reserva estoque.
- **Pedido**: cria-se a partir do carrinho, numa transação: confere estoque, **reserva** (baixa) e grava o pedido com `expiresAt` (janela de pagamento; padrão 45 min, configurável de 15 a 4.320; a produção usa o valor salvo em Configurações). Preços e totais são recalculados no servidor.
- **Pagamento**: o provedor cria a cobrança com o valor do pedido; o webhook confirma (assinatura ou token, valor igual ao total) e o pedido vira PAGO. Eventos de webhook são registrados para não processar duas vezes.
- **Expiração**: pedidos não pagos vencidos são cancelados e o estoque volta (`expireUnpaidOrders`) pela manutenção horária **e** de forma oportunista (`reservations.ts`: catálogo, produto, carrinho, adicionar ao carrinho e criar pedido; no máx. 1x/30 s por instância).
- **Frete**: cotação SuperFrete por CEP (`/api/frete`); se não houver cotação, frete fixo configurado.
- **Fotos**: upload pelo painel → WebP 1400 px e miniatura 560 px → driver configurado (`STORAGE_DRIVER`).
- **Manutenção**: `/api/cron/maintenance` (Bearer `CRON_SECRET`) expira pedidos e limpa sessões; a função agendada da Netlify chama essa rota. Em hospedagem própria há um laço interno (`src/instrumentation.ts`).

## Estados

- Pedido: PENDENTE, PAGAMENTO_PENDENTE, PAGO, PROCESSANDO, ENVIADO, ENTREGUE, CANCELADO, REEMBOLSADO.
- Pagamento: PENDENTE, APROVADO, RECUSADO, CANCELADO, REEMBOLSADO.
- Movimentação de estoque: CADASTRO, ENTRADA, AJUSTE, VENDA, RESTAURACAO.

## Decisões e limites conhecidos

- Netlify grátis tem 300 créditos/mês (sem recarga); Neon grátis tem 100 CU-h, 1 GB e restore de 6 h. Isso orienta cache (P1-01), fotos no R2 (P1-02) e backup (P0-04).
- O limite de requisições é por instância (memória); um limite global exigiria banco ou borda.
- Migrações são aditivas; produção só migra com backup e destino conferido.
