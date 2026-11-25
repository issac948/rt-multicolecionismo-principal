# TESTS — RT Multicolecionismo

Atualizado: 2026-11-22.

## Como rodar (Windows PowerShell)

```powershell
npm.cmd run typecheck          # tsc --noEmit
npm.cmd test                   # vitest run (usa o banco loja_test)
npm.cmd run check:repo         # repositório completo? (imports, pacotes, .gitignore)
npm.cmd run db:check           # SOMENTE LEITURA no banco do DATABASE_URL (veja DEPLOYMENT.md)
npm.cmd run build              # roda o check:repo antes (prebuild)
```

Os testes de integração usam um PostgreSQL **separado** (`loja_test`, ou `TEST_DATABASE_URL`). `tests/global-setup.ts` recusa
rodar se o nome do banco não terminar em `_test`, para nunca apagar o banco de desenvolvimento ou de produção.
Detalhes de instalação do banco local: README.

## Resultado mais recente (2026-11-22, Linux, cópia de trabalho)

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | 0 erros |
| `vitest run` | 29 arquivos, 477 testes passando (55 s) |
| `next build` | passa (a 1ª execução dentro do ambiente do Claude para com um aviso do Next CLI; veja `SECURITY.md`) |

## Arquivos de teste (`tests/*.test.ts`)

| Arquivo | Assunto |
|---|---|
| `auth` | cadastro, login, sessão, recuperação de senha |
| `admin` | permissões e ações do painel |
| `vitrine`, `categorias`, `colecionaveis` | catálogo, filtros, categorias hierárquicas, campos de colecionáveis |
| `cadastro-rapido`, `importacao` | cadastro rápido e importação CSV com prévia |
| `orders`, `inventory` | pedidos, estoque transacional, reservas, cancelamento, concorrência |
| `payments`, `paypal`, `infinitepay` | pagamento (servidores simulados), webhooks, idempotência, valor igual ao total |
| `frete` | cotação SuperFrete (simulada), frete fixo de reserva |
| `armazenamento`, `s3`, `transferencia-fotos`, `manutencao-espaco` | drivers de fotos, S3 simulado, cópia entre drivers, espaço e manutenção |
| `eventos`, `eventos-api` | calendário de eventos, modelos, participações |
| `ai`, `assistente` | IA do painel e assistente de compras (provedor simulado) |
| `migracao-pendente` | detecção de migração pendente |
| `utils` | utilitários |
| `scan-secrets` | achados mascarados, exemplos/placeholders ignorados, `.env` no projeto, histórico do Git, projeto limpo |
| `backup` | exportação somente leitura, verificação (SHA-256, contagens, JSON), restauração idêntica em banco vazio, recusa de banco não vazio |
| `reservas` | liberação de reservas vencidas (produto, catálogo, carrinho, criar pedido), intervalo, pago intocado, concorrência |
| `check-repo` | verificador de repositório completo (10 testes) |
| `db-guard` | máscara de destino/e-mail, redação de erros, migrações pendentes (regra do Drizzle), trava do `db:migrate` |
| `db-check` | relatório somente leitura: erro de escrita, contagens iguais, admin mascarado, admin padrão, demo, pedido vencido, migração pendente, coluna ausente, sem vazamento |

## Lacunas conhecidas (o que **não** está coberto)

- Nenhum teste contra serviços reais: InfinitePay, PayPal, SuperFrete, Cloudflare R2, Telegram, e-mail, Netlify e Neon (**Não validado**).
- Não há suíte E2E de navegador no repositório: a navegação e o celular foram conferidos à mão com Playwright durante as revisões.
- Medição de Core Web Vitals e de consumo de créditos da Netlify: pendente (P1-14); créditos só se veem no painel da Netlify.
- Teste de carga: não existe.

## Regras

- Teste que altera dados roda só em banco `*_test`.
- Resultado de teste nunca é escrito sem ter sido executado.
