# STATUS — RT Multicolecionismo

Atualizado: 2026-11-22 (domingo). Base: **v2** entregue em 30/10/2026 + cópia de trabalho `rt-bf2026`.
Campanha: **Black Friday sexta 27/11/2026** (Cyber Monday 30/11).

## Como ler

| Nível | Significa |
|---|---|
| **Implementado** | existe no código |
| **Testado localmente** | testes automáticos e/ou execução em Linux, com banco de teste separado (`*_test`) |
| **Testado em produção** | executado de verdade em rtmulticolecionismo.com.br |
| **Parcial** | existe, mas falta parte do que foi pedido |
| **Pendente** | ainda não existe |
| **Bloqueado** | depende de serviço externo ou de acesso que o Claude não tem |

Nada está marcado "Testado em produção": o Claude não tem acesso à produção, à Netlify, ao Neon nem aos gateways.

## O que foi analisado do repositório real

- Em 22/11 você enviou o ZIP do GitHub (`rt-multicolecionismo-principal`, branch `master`, 247 arquivos). Resultado da comparação com a v2:
  só `.gitignore` (já corrigido para `/storage/`: `src/server/storage/` está no repositório) e os scripts `test`/`test:watch` do `package.json`.
  `package-lock.json` idêntico. `check:repo` OK, `tsc` 0 erros, 421 testes passando e build passando numa cópia desse ZIP (Linux).
- **Não validado:** o **histórico** do Git (o ZIP não traz `.git`), a conexão Netlify ↔ repositório, as variáveis na Netlify, o banco de produção.
  Para o histórico: rodar `git log --oneline` aí e colar (ou vincular o GitHub ao Claude).

## Verificação feita nesta data (cópia de trabalho, Linux)

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | 0 erros |
| `vitest run` (banco `loja_test`) | 37 arquivos, **555 testes passando** (75 s) — revisão final de 24/11 |
| `next build` | compila; 1ª execução dentro do ambiente do Claude para com exit 1 por um aviso do Next CLI (veja SECURITY.md); a repetição passa (exit 0) |
| Todas as rotas | dinâmicas (`ƒ`): nenhuma página é servida de cache |
| `npm run check:repo` | OK (267 arquivos) |
| `npm audit --omit=dev` | 0 vulnerabilidades no site; 4 avisos moderados só em ferramenta de desenvolvimento (`drizzle-kit`→`esbuild`), fora do código publicado |
| Next.js | **16.4.6** no `package.json` e no lock; `npm ci` limpo + `next --version` = v16.4.6; build limpo 2× sem `SecurityFatalError` |
| Varredura de segredos na v2 | nenhum segredo real; só exemplos (`.env.example`, README), senha do banco local de testes e a chave de exemplo da AWS usada em `tests/s3.test.ts` |

## Divergências entre os arquivos anexados em 21/11 e a v2

| Arquivo anexado | É a v2? | Diferença |
|---|---|---|
| `package.json` (1,2 KB) | **não** | Next **16.4.0**, zod 4.6.5, **sem** `@fontsource-variable/archivo` e `@fontsource/lobster`, sem `storage:migrate`, sem `--env-file-if-exists` |
| `package.json` (1,6 KB) | não | é o da primeira revisão (anterior à v2) |
| `next.config.ts` | **não** | igual à v2 + `output: "standalone"` |
| `vitest.config.ts` | não | versão antiga (a v2 usa `vitest.config.mts`) |
| `README.md` (45 KB) e `PROGRESSO.md` (1,5 KB) | não | versões antigas (PROGRESSO de 11/10) |
| `README.md` (77 KB), `PROGRESSO.md` (18 KB), `vitest.config.mts`, `tsconfig.json`, `postcss.config.mjs`, `drizzle.config.ts` | sim | idênticos |

Consequência medida: com o `package.json` antigo, `npm run check:repo` falha em 3 imports de CSS
(`@fontsource-variable/archivo/wdth.css`, `@fontsource/lobster/latin-400.css`, `@fontsource/lobster/latin-ext-400.css`),
ou seja, **o build quebraria**. Se algum desses arquivos antigos estiver no repositório novo, ele não é a v2.

## Achado P0 do `.gitignore` (resolvido no repositório real)

O `.gitignore` da v2 tinha `storage/`, que ignora também `src/server/storage/` (8 arquivos de código). No repositório real isso **já está
corrigido** (`/storage/`); o `check:repo` continua como proteção contra a volta do problema.

## Funcionalidades

| Área | Item | Nível | Observação |
|---|---|---|---|
| Repositório | `.gitignore` correto | Testado localmente | confirmado no ZIP do GitHub de 22/11 |
| Repositório | `check:repo` (imports, pacotes, arquivos fora do Git) | Testado localmente | 10 testes em `tests/check-repo.test.ts`; ainda não está no repositório real (vem no pacote P0) |
| Repositório | Histórico de commits do GitHub | Bloqueado | ZIP não traz `.git` |
| Deploy | Conexão Netlify ↔ repositório novo | Bloqueado | depende do painel da Netlify (você) |
| Deploy | Build na Netlify real | Pendente | só se prova com um deploy (15 créditos) |
| Conta | Cadastro, login, sessão, recuperação de senha (link gerado pelo admin) | Testado localmente | `tests/auth.test.ts` e outros |
| Vitrine | Catálogo, busca, filtros (preço, marca, escala, série, condição, promoção, estoque), categorias | Testado localmente | `tests/vitrine.test.ts`, `tests/categorias.test.ts` |
| Vitrine | Página de produto, galeria com zoom, produtos relacionados, WhatsApp, JSON-LD de produto | Implementado | verificado em navegador na auditoria |
| Carrinho | Visitante e conta, mesclagem no login | Testado localmente | |
| Carrinho | Limite de requisições nas ações do carrinho | Pendente | `rate-limit.ts` não é usado nelas |
| Checkout | Exige login (visitante é levado ao login e o carrinho vai junto) | Implementado | compra sem conta: descartada (decisão do dono em 24/11) |
| Checkout | Preenchimento de endereço pelo CEP (ViaCEP, feito no navegador) e máscaras de CEP/telefone | Testado localmente | funções testadas; busca real no ViaCEP e máscara no celular: Não validado. CPF: não existe campo |
| Pedidos | Criação, estoque transacional, expiração de não pagos, cancelamento, status até REEMBOLSADO | Testado localmente | `tests/orders.test.ts`, `tests/inventory.test.ts` |
| Pedidos | Janela de reserva de pedido não pago | Testado localmente | padrão **45 min** (15–4.320) para instalações sem valor salvo; **a produção mantém o valor salvo em Configurações** (o `db:check` mostra qual é). Reservas vencidas são liberadas ao abrir catálogo/produto/carrinho, ao adicionar ao carrinho e ao criar pedido (no máx. 1x/30 s por instância), além da manutenção horária. `tests/reservas.test.ts` |
| Pagamento | InfinitePay (link, `payment_check`, webhook com token, valor igual ao total) | Testado localmente | servidor simulado; **real não testado** |
| Pagamento | PayPal | Testado localmente | simulado; real não testado |
| Pagamento | Mercado Pago | Implementado | simulado; não habilitado no negócio |
| Frete | SuperFrete (cotação) + frete fixo de reserva | Testado localmente | respostas simuladas; real não testado |
| Frete | Calculadora na página do produto, barra de frete grátis | Pendente | hoje só no carrinho |
| Frete | Etiqueta/rastreio automáticos | Pendente | rastreio é digitado no painel |
| Fotos | Drivers `database`, `local`, `s3`; WebP 1400/560; rota `/uploads/...` com cache longo | Testado localmente | `tests/s3.test.ts` usa servidor S3 falso; **bucket real (R2) não testado** |
| Manutenção | Rota `/api/cron/maintenance` + função agendada da Netlify (de hora em hora) | Testado localmente | função agendada na Netlify: não testada |
| Painel | Produtos, categorias, estoque, pedidos, clientes, eventos, configurações | Testado localmente | |
| Painel | Cadastro de produto (formulário longo), duplicar, importação CSV com prévia | Testado localmente | CSV não traz fotos |
| Painel | IA de texto (rascunho, nunca publica sozinha) | Testado localmente | provedor simulado; real depende de chave |
| Loja | Assistente de compras com IA e passagem para o WhatsApp | Testado localmente | |
| Painel | Dashboard (vendas, pendências, estoque baixo) | Implementado | sem carrinhos, funil ou conversão |
| Backup | `npm run backup` (um `.jsonl` por tabela + manifesto com SHA-256), `backup:verify`, `backup:restore` (só em banco migrado e vazio) | Testado localmente | `tests/backup.test.ts` (9): somente leitura, arquivo adulterado detectado, restauração idêntica incl. foto binária e número do pedido. **Backup da produção e ensaio de restauração: pendentes (você)**. Restore do Neon grátis: só 6 h |
| Banco | Trava do `db:migrate` (mostra destino mascarado, `--simular`, banco remoto só com `--confirmar=<banco>`) | Testado localmente | `tests/db-guard.test.ts`; fluxo contra Neon real: não validado |
| Banco | `db:check` somente leitura (migrações, esquema, contas ADMIN mascaradas, demo, pedidos vencidos, webhooks, manutenção) | Testado localmente | `tests/db-check.test.ts`; **rodar na produção: pendente (você)** |
| Alertas | Telegram ao dono quando um pedido é pago (só número e valor; sem dados do cliente) | Testado localmente | precisa de TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID (servidor simulado); envio real: Não validado. E-mail ao cliente/dono: Pendente (sem biblioteca de e-mail) |
| Preços | Promoções programadas, histórico de preços | Testado localmente | migração 0006 (aditiva), ainda NÃO aplicada em produção |
| Preços | Cupons (percentual/fixo, validade, mínimo, limite total e por cliente, uso devolvido ao cancelar/expirar) | Testado localmente | migração 0007 (aditiva), NÃO aplicada em produção; pagamento real com desconto: Não validado |
| Campanha | Tema Black Friday sem contador: liga/desliga por datas ou manual (Automático / Ligado / Desligado) | Testado localmente | visual conferido em tela local; precisa de conferência do dono |
| Carrinhos | Prova social pública e painel "ao vivo" | Testado localmente | |
| Painel | Romaneio para imprimir, copiar endereço, exportar CSV | Testado localmente | impressão em papel: Não validado |
| Painel | Cadastro rápido no celular, fotos pelo SKU, publicação agendada | Parcial | "Novo produto" já copia categoria/marca/escala do anterior para cadastrar em leva; fluxo foto→nome→preço em 1 tela: Pendente |
| Páginas | Privacidade, trocas e devoluções, termos | Parcial | texto-base sem dados do vendedor (CNPJ/endereço não inventados); revisar com contador/advogado. FAQ: Pendente |
| SEO | Sitemap, JSON-LD de loja e de produto, Open Graph | Implementado | canonical, robots e alt text: a auditar |
| Marketing | UTM / origem dos pedidos | Pendente | |
| Desempenho | Cache de páginas públicas | Pendente | `force-dynamic` no layout raiz |
| Segurança | Next 16.4.6 (corrige os 7 avisos moderados do Next 16.4.3 no `npm audit`) | Testado localmente | cópia separada e cópia de trabalho: `tsc` 0 erros, 477 testes, build OK (1ª execução já sem o aviso do Next CLI). **Precisa da sua aprovação**: você autorizou só a 16.4.3. Sobram 4 avisos moderados do `esbuild` dentro do `drizzle-kit` (ferramenta de desenvolvimento, não vai para o site) |
| Segurança | Varredura de segredos (`npm run scan:secrets` e `scan:secrets:historico`) | Testado localmente | arquivos atuais e commits da cópia: limpos; **histórico do repositório real: pendente (você roda dentro do clone)** |

## Pendências que dependem de você

Veja a seção "Autorizações" em `ROADMAP.md`.

## Entrega de 23/11 (visual + campanha + pedidos)

- **Visual:** acabamento premium em toda a loja (cartões com elevação, botões e campos refinados, entrada suave, cabeçalho fixo no computador). Só CSS/aparência; nenhuma regra de compra, preço ou pagamento foi alterada. Logo e identidade RT preservadas.
- **Black Friday:** faixa + destaque na home + cores da campanha na loja toda, sem contador. Painel > Configurações > Campanha: Controle Automático (datas) / Ligado agora / Desligado. Fora do período, a loja volta sozinha ao normal. Nenhum desconto é inventado (promoções vêm dos produtos e cupons cadastrados).
- **Cupons:** painel `/admin/cupons`, campo no checkout, conferência no servidor.
- **Pedidos:** "Exportar planilha (CSV)", "Romaneio (imprimir)", "Copiar endereço", desconto/cupom no detalhe e aviso por Telegram (opcional).
- **Pendente:** e-mail ao cliente/dono, cadastro rápido em 1 tela, cache/UTM, FAQ, calculadora de frete na página do produto, aplicar migrações 0006 e 0007 e deploy (precisam de autorização).
- **Conferência de variáveis:** `npm.cmd run env:check` (Testado localmente) mostra o que falta para InfinitePay, SuperFrete, IA, manutenção e banco, sem revelar segredos. Integrações reais: Não validado (veja DEPLOYMENT.md > Checklist de integrações).

## Revisão final de 24/11 (evidências reais, cópia local)

- **Corrigido:** (1) `loading.tsx` da loja removido: fazia produto inexistente responder 200 (soft-404) e atrasava redirecionamentos; agora 404/307 corretos. (2) **Backup:** a restauração falharia com cupom usado (ordem das tabelas) — corrigido e coberto por teste que confere todas as chaves estrangeiras; restauração real conferida. (3) Cupom desligado responde igual a código inexistente; limite de usos com teto (não estoura o inteiro do banco); exclusão de cupom que acabou de ser usado dá mensagem clara. (4) Acessibilidade: 0 violações do axe em 9 páginas (computador e celular, tema BF ligado), sem rolagem horizontal. (5) Política de privacidade: texto da senha corrigido (hash, não "criptografia"), ViaCEP e assistente de IA citados; aceite dos termos no cadastro.
- **Testado localmente:** InfinitePay com cupom (itens+frete = total; valor sem desconto não quita); reembolso e cancelamento do admin devolvem o cupom; migração 0005→0007 num banco descartável com dados (pedido, pagamento, promoção manual preservados); exportação CSV: anônimo 401, cliente 403, admin 200; área admin some (404) para cliente; BF liga/desliga/volta ao normal sozinha (renderização real).
- **Não validado:** InfinitePay/PayPal/SuperFrete/IA/Telegram reais, ViaCEP real, impressão, celulares reais, Netlify, banco de produção (rode `npm.cmd run db:check` e as migrações 0006/0007 só depois de backup), texto jurídico (revisar com profissional), identificação do vendedor (CNPJ/razão social/endereço) ainda não cadastrada no site.
- **Sem CSP:** o site ainda não envia `Content-Security-Policy` (outros cabeçalhos de segurança estão ativos). Limite de tentativas é em memória (fraco em ambiente sem servidor fixo).

