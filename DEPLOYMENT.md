# DEPLOYMENT — RT Multicolecionismo

Atualizado: 2026-11-22. Produção: Netlify (projeto `shimmering-creponne-07005b`, domínio `rtmulticolecionismo.com.br`) + Neon (PostgreSQL).
**Nada aqui foi executado em produção.** Detalhes de variáveis e de configuração: README.

## Regras de ouro

1. **Um deploy só**, depois da sua revisão. Cada deploy de produção custa 15 créditos (plano grátis: 300/mês, sem recarga; acabou, os sites da conta saem do ar).
2. Nada de apagar ou recriar o projeto Netlify, nem de trocar domínio, DNS, pagamentos ou credenciais sem decidir antes.
3. A produção nunca aponta para banco local ou de testes. Migração só com o destino conferido.
4. Backup verificado **antes** de migrar ou publicar.

## 1. Antes de qualquer publicação

```powershell
git status                                  # sem arquivos soltos que o .gitignore esteja escondendo
npm.cmd run check:repo                      # tudo o que o código usa vai para o GitHub?
npm.cmd run scan:secrets                    # nenhum segredo nos arquivos (valores sempre mascarados)
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Histórico do Git (uma vez, dentro de um clone com a pasta `.git`): `npm.cmd run scan:secrets:historico`. Se achar credencial real, troque-a no provedor; apagar do Git não basta.

Confira também **no GitHub** (não só no seu PC): baixe o ZIP (Code → Download ZIP), extraia numa pasta nova, rode `npm.cmd ci` e
`npm.cmd run build`. É o que a Netlify vai ver.

## 2. Conferir a conexão Netlify ↔ repositório (você, no painel)

- Projeto `shimmering-creponne-07005b` → Site configuration → Build & deploy → Continuous deployment: **repositório** e **branch de produção**
  (`master`) devem ser os do repositório novo.
- Evitar publicação automática enquanto não estiver pronto: na aba Deploys, usar "Stop auto publishing" (ou pausar os builds). *Nomes de menu
  podem variar: Não validado.*
- Variáveis (Site configuration → Environment variables): `DATABASE_URL`, `SITE_URL`, `CRON_SECRET` (mínimo 16 caracteres),
  `STORAGE_DRIVER`, `PAYMENT_PROVIDER`, `INFINITEPAY_HANDLE`, `INFINITEPAY_WEBHOOK_TOKEN`, `SUPERFRETE_TOKEN`, `SUPERFRETE_CONTACT_EMAIL`,
  e as do PayPal/IA se usadas. **Nunca cole valores em chat.** Lista completa e explicação: `.env.example` e README.

## 3. Banco de produção (somente leitura)

Não grava a senha no histórico do PowerShell e não altera nada (tudo roda em transação somente leitura):

```powershell
$env:DATABASE_URL = Read-Host "Cole a DATABASE_URL de PRODUCAO"
npm.cmd run db:check
Remove-Item Env:DATABASE_URL
```

A saída mostra o servidor mascarado (nunca a senha) e pode ser colada no chat: migrações aplicadas x código, esquema, contas ADMIN
(e-mail mascarado; alerta `admin@loja.local`), produtos DEMO publicados, fotos, pedidos vencidos, webhooks, última manutenção.
`[ERRO]` = corrigir antes de publicar; `[AVISO]` = olhar.

## 4. Backup (P0-04)

Opções, da mais simples à mais completa:

1. **Neon**: criar uma *branch* ou ponto de restauração antes de migrar. O restore do plano grátis cobre só 6 h.
2. `npm.cmd run backup` gera um arquivo `.jsonl` por tabela (produtos, pedidos, clientes, pagamentos, configurações, fotos guardadas no banco) mais `manifest.json` com contagens e SHA-256, sem alterar nada no banco. Sem as fotos: `-- --sem-fotos`. Outra pasta: `-- --saida=D:\Backups\rt-2026-11-26`. **Contém dados pessoais e hashes de senha: guarde fora do projeto.**

   ```powershell
   $env:DATABASE_URL = Read-Host "Cole a DATABASE_URL de PRODUCAO"
   npm.cmd run backup -- --saida=D:\Backups\rt-AAAA-MM-DD
   npm.cmd run backup:verify -- --pasta=D:\Backups\rt-AAAA-MM-DD
   Remove-Item Env:DATABASE_URL
   ```

   **Ensaio de restauração** (sem tocar em produção): crie um banco novo e vazio (ex.: um *branch* do Neon ou `loja_restauro_test` local), aponte o `DATABASE_URL` para ele,
   rode `npm.cmd run db:migrate` e depois `npm.cmd run backup:restore -- --pasta=<pasta>` (em banco remoto acrescente `--confirmar=<nome-do-banco>`).
   A restauração recusa banco que já tem dados e, se algo falhar, não grava nada.
3. `pg_dump` (se tiver as ferramentas do PostgreSQL): dump completo do banco.

Guarde o backup fora da pasta do projeto e **verifique que abre** antes de continuar.

## 5. Migração

Só depois do backup, e só com o destino conferido na tela (a trava do P0-03 mostra servidor e banco mascarados):

```powershell
npm.cmd run db:migrate -- --simular                 # mostra destino e pendências; não altera nada
npm.cmd run db:migrate                              # banco LOCAL: aplica; banco REMOTO (Neon): recusa e mostra o comando
npm.cmd run db:migrate -- --confirmar=<nome-do-banco>   # remoto: só aplica com o nome certo do banco
```

Migrações são aditivas (`drizzle/0000` a `0005` já existem; as novas serão `0006` em diante). Nunca rodar `db:seed -- --reset`.

## 6. Publicar (só com sua autorização)

Um único deploy. Depois: abrir a loja, o painel, um produto, o carrinho e a rota `/api/cron/maintenance` (com o segredo) e conferir o
registro da função agendada de manutenção.

## 7. Teste real (P0-08, com valor baixo)

Pedido de baixo valor → pagamento (InfinitePay e/ou PayPal) → webhook → status PAGO → estoque baixou → cancelar/reembolsar e registrar.

## 8. Voltar atrás

- Código: na Netlify, aba Deploys → publicar o deploy anterior.
- Banco: restaurar pela branch/ponto do Neon ou pelo backup (P0-04).
- Fotos (se migradas para o R2): `STORAGE_DRIVER=database` volta a servir pelo banco, porque as fotos só saem do banco depois da sua confirmação.

## Cloudflare R2 (P1-02, só com sua autorização)

Criar bucket, chave de acesso e URL pública (ou domínio de imagens); definir `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `STORAGE_PUBLIC_BASE_URL`; copiar com `npm.cmd run storage:migrate`; conferir tamanho e hash de cada foto;
manter as fotos no banco até a confirmação. **Bucket real: não validado.**

## Checklist de integrações (InfinitePay, SuperFrete, IA) — conferir ANTES de ligar

1. Rode `npm.cmd run env:check` (só confere se as variáveis existem; nunca mostra os valores). No Netlify, cadastre cada uma em Site configuration > Environment variables:
   - `PAYMENT_PROVIDER=infinitepay`, `INFINITEPAY_HANDLE` (sua InfiniteTag), `INFINITEPAY_WEBHOOK_TOKEN` (16+ caracteres, gerado por você). O InfinitePay não assina o webhook: a loja confere o pagamento direto com o InfinitePay e exige o valor igual ao total.
   - `SUPERFRETE_TOKEN` e, no painel > Configurações > Entrega, "Calculado pelo CEP" com o CEP de origem. Sem o token, vale só o frete fixo.
   - IA (opcional): `AI_PROVIDER` (anthropic ou openai), `AI_API_KEY`, `AI_MODEL`; depois ligue o assistente no painel.
   - `CRON_SECRET` (obrigatório no Netlify), `SITE_URL=https://rtmulticolecionismo.com.br`, `DATABASE_URL` com "-pooler" e `?sslmode=require`.
2. Faça UM pedido real de baixo valor: pagar pelo InfinitePay, ver o pedido virar "Pago", o estoque baixar e (se houver cupom) o desconto aparecer. Só depois disso o status do pagamento pode ser marcado "Testado em produção".
3. Faça UMA cotação real de frete pelo CEP no carrinho e confira o valor com o site da SuperFrete.
4. Peça uma resposta ao assistente de IA e confira o custo no provedor.
Nada disso foi testado com contas reais pelo Claude: só com servidores simulados.
