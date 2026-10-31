import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { AdminPageHeader, SectionPanel, StatTile } from "@/components/admin/admin-ui";
import { DailySalesChart } from "@/components/admin/daily-sales-chart";
import { OrderStatusBadge } from "@/components/ui";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/text";
import { aiStatus } from "@/server/ai";
import { requireAdminPage } from "@/server/auth/current-user";
import { getEnv } from "@/server/env";
import { getPaymentProvider, isPaymentConfigured } from "@/server/payments";
import { isSuperFreteConfigured } from "@/server/shipping/superfrete";
import { getDashboardStats } from "@/server/services/dashboard";
import { DemoRemoveButton } from "@/components/admin/demo-remove-button";
import { MaintenanceButton } from "@/components/admin/maintenance-button";
import { getMaintenanceStatus } from "@/server/services/maintenance";
import { formatMb, getStorageUsage, usageLevel } from "@/server/storage/usage";
import { storageConfigProblem } from "@/server/storage";
import { listCategories } from "@/server/services/categories";
import { countDemoProducts } from "@/server/services/demo";
import { getSettings, hasSavedSettings } from "@/server/services/settings";

export const metadata: Metadata = { title: "Resumo" };

export default async function DashboardPage() {
  await requireAdminPage("/admin/dashboard");
  const [stats, settingsSaved, settings, demo, maintenance, usage] = await Promise.all([
    getDashboardStats(),
    hasSavedSettings(),
    getSettings(),
    countDemoProducts(),
    getMaintenanceStatus(),
    getStorageUsage(),
  ]);

  const env = getEnv();
  const todos: Array<{ text: string; href?: string }> = [];
  const provider = getPaymentProvider();
  if (!isPaymentConfigured()) {
    todos.push({ text: `O pagamento (${provider.label}) ainda não está configurado: a loja não consegue receber pedidos. Veja o passo a passo no README.` });
  } else if (provider.id === "paypal" ? !env.paypal.webhookId : provider.id === "mercadopago" && !env.mercadoPago.webhookSecret) {
    todos.push({
      text:
        provider.id === "paypal"
          ? "Falta o ID do webhook do PayPal (PAYPAL_WEBHOOK_ID): pagamentos de clientes que fecharem a página antes de voltar à loja podem não ser confirmados."
          : "Falta a assinatura secreta do webhook do Mercado Pago (MERCADOPAGO_WEBHOOK_SECRET): os pagamentos não serão confirmados automaticamente.",
    });
  }
  if (isPaymentConfigured() && provider.id === "paypal" && env.paypal.mode === "sandbox") {
    todos.push({ text: "O PayPal está em modo de TESTE (PAYPAL_ENV=sandbox): nenhum pagamento é de verdade. Para vender, troque para PAYPAL_ENV=live com as credenciais de produção." });
  }
  if (!env.siteUrl.startsWith("https://") && env.isProd) {
    todos.push({ text: `O endereço da loja (SITE_URL) não usa https. O ${provider.label} só avisa sobre pagamentos em endereços https.` });
  }
  if ((await listCategories()).length === 0) {
    todos.push({ text: "Crie as categorias da loja: há uma estrutura sugerida (miniaturas de carros, bonecos e colecionáveis...) com um clique.", href: "/admin/categorias" });
  }
  if (!settingsSaved) todos.push({ text: "Revise os dados da loja (nome, frete, formas de contato).", href: "/admin/configuracoes" });
  if (!settings.shipping.deliveryEnabled && !settings.shipping.pickupEnabled) {
    todos.push({ text: "Defina como a loja entrega (valor do frete e prazo) ou ative a retirada em mãos: sem isso o cliente não consegue finalizar o pedido.", href: "/admin/configuracoes" });
  }
  if (settings.shipping.deliveryEnabled && settings.shipping.mode === "calculated") {
    const fallback = settings.shipping.flatRateCents > 0 ? "o cliente paga o valor fixo de reserva" : "a entrega fica indisponível (só retirada)";
    if (!isSuperFreteConfigured()) {
      todos.push({ text: `O frete pelo CEP está ligado, mas falta o token da SuperFrete no servidor (SUPERFRETE_TOKEN). Enquanto isso, ${fallback}.`, href: "/admin/configuracoes" });
    } else if (!settings.shipping.origin.cep) {
      todos.push({ text: `O frete pelo CEP está ligado, mas falta o CEP do seu endereço de postagem. Enquanto isso, ${fallback}.`, href: "/admin/configuracoes" });
    }
  }
  if (!settings.whatsapp) todos.push({ text: "Cadastre o seu WhatsApp em Configurações para os clientes poderem falar com você.", href: "/admin/configuracoes" });
  if (stats.activeWithoutImages > 0) {
    todos.push({ text: `${stats.activeWithoutImages} produto(s) publicado(s) sem foto.`, href: "/admin/produtos" });
  }
  if (stats.ordersNeedingAttention > 0) {
    todos.push({ text: `${stats.ordersNeedingAttention} pedido(s) com aviso que precisa da sua atenção.`, href: "/admin/pedidos?atencao=1" });
  }

  // Fotos e espaço do banco: banco cheio = pedidos deixam de ser gravados, então o aviso vem cedo.
  const storageProblem = storageConfigProblem();
  if (storageProblem) todos.push({ text: storageProblem });
  if (env.isServerless && usage.driver === "local") {
    todos.push({ text: "As fotos estão configuradas para ficar em disco local (STORAGE_DRIVER=local), mas a hospedagem apaga o disco a cada publicação: as fotos enviadas seriam perdidas." });
  }
  const dbLevel = usageLevel(usage.databaseBytes, usage.databaseLimitBytes);
  if (dbLevel !== "ok") {
    todos.push({
      text: `O banco de dados está em ${formatMb(usage.databaseBytes)} de ${formatMb(usage.databaseLimitBytes)} do plano (${dbLevel === "danger" ? "quase cheio: pedidos podem deixar de ser gravados" : "acima de 70%"}). Veja o espaço das fotos abaixo.`,
    });
  }
  if (usage.driver === "database" && usageLevel(usage.photoBytes, usage.photoLimitBytes) !== "ok") {
    todos.push({ text: `As fotos usam ${formatMb(usage.photoBytes)} de ${formatMb(usage.photoLimitBytes)} reservados. Ao encher, novos envios de foto são bloqueados.` });
  }
  const lastRunAgeMs = maintenance.lastRunAt ? Date.now() - maintenance.lastRunAt.getTime() : null;
  if (maintenance.overdueUnpaidOrders > 0 && (lastRunAgeMs === null || lastRunAgeMs > 3 * 60 * 60 * 1000)) {
    todos.push({ text: `${maintenance.overdueUnpaidOrders} pedido(s) não pago(s) com prazo vencido ainda seguram estoque: a manutenção automática não rodou. Use o botão "Executar manutenção agora" abaixo.` });
  }
  if (env.isServerless && env.cronSecret.length < 16) {
    todos.push({ text: "Falta o CRON_SECRET (variável de ambiente do Netlify): sem ele o agendador automático de manutenção não funciona." });
  }
  const ai = aiStatus();

  return (
    <>
      <AdminPageHeader title="Resumo da loja" description="Só pedidos pagos entram nos valores de vendas. Cancelados e reembolsados ficam de fora." />

      {todos.length > 0 ? (
        <section aria-labelledby="titulo-pendencias" className="mb-6 rounded-md border-l-4 border-signal-deep bg-warn-soft p-4">
          <h2 id="titulo-pendencias" className="flex items-center gap-2 text-xl">
            <AlertTriangle size={20} aria-hidden /> Precisa da sua atenção
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {todos.map((todo) => (
              <li key={todo.text}>
                {todo.href ? <Link href={todo.href}>{todo.text}</Link> : todo.text}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="mb-6 flex items-center gap-2 text-sm text-ok">
          <CheckCircle2 size={18} aria-hidden /> Tudo certo com a configuração da loja.
        </p>
      )}

      {demo.published > 0 && (
        <section aria-labelledby="titulo-demo" className="mb-6 rounded-md border-l-4 border-enamel bg-enamel-soft p-4">
          <h2 id="titulo-demo" className="text-xl">
            Há {demo.published} produto(s) de demonstração na loja
          </h2>
          <p className="mt-1 text-sm">
            Eles são fictícios (têm &quot;demo&quot; no nome) e servem só para testar. Quando for começar a vender de verdade, remova-os.
          </p>
          <DemoRemoveButton count={demo.published} />
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Vendas hoje" value={formatBRL(stats.todayCents)} note={`${stats.todayOrders} ${stats.todayOrders === 1 ? "pedido pago" : "pedidos pagos"}`} />
        <StatTile label="Últimos 7 dias" value={formatBRL(stats.last7Cents)} />
        <StatTile
          label="Últimos 30 dias"
          value={formatBRL(stats.last30Cents)}
          note={`${stats.last30Orders} ${stats.last30Orders === 1 ? "pedido" : "pedidos"} · ticket médio ${formatBRL(stats.last30Orders > 0 ? Math.round(stats.last30Cents / stats.last30Orders) : 0)}`}
        />
        <StatTile
          label="Para enviar"
          value={stats.ordersToShip}
          note="pedidos pagos aguardando envio"
          href="/admin/pedidos?status=PAGO"
          tone={stats.ordersToShip > 0 ? "attention" : "default"}
        />
        <StatTile label="Aguardando pagamento" value={stats.pendingOrders} href="/admin/pedidos?status=PAGAMENTO_PENDENTE" />
        <StatTile label="Clientes" value={stats.customers} href="/admin/clientes" />
        <StatTile
          label="Produtos cadastrados"
          value={stats.products.total}
          note={`${stats.products.active} publicados · ${stats.products.outOfStock} sem estoque`}
          href="/admin/produtos"
        />
        <StatTile
          label="Assistente de IA"
          value={ai.configured ? "Ativo" : "Desligado"}
          note={ai.configured ? `Provedor: ${ai.provider}` : "Precisa de chave no servidor"}
          href="/admin/ia"
        />
      </div>

      <div className="mt-6">
        <SectionPanel title="Sistema" id="titulo-sistema">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-lg">Manutenção automática</h3>
              <p className="mt-1 text-sm text-ink-soft">
                {maintenance.lastRunAt
                  ? `Última execução: ${formatDateTime(maintenance.lastRunAt)} (${maintenance.source === "agendador" ? "agendador" : maintenance.source === "painel" ? "botão do painel" : maintenance.source === "sob-demanda" ? "ao abrir o painel" : "terminal"}).`
                  : "Ainda não rodou."}{" "}
                Cancela pedidos não pagos com prazo vencido (devolvendo o estoque) e limpa sessões, fotos abandonadas e registros antigos. Pedidos pagos nunca são alterados.
              </p>
              <MaintenanceButton />
            </div>
            <div>
              <h3 className="text-lg">Espaço do banco de dados</h3>
              <p className="mt-1 text-sm text-ink-soft">
                Banco: <strong>{formatMb(usage.databaseBytes)}</strong> de {formatMb(usage.databaseLimitBytes)} do plano (informado em DATABASE_PLAN_LIMIT_MB).
              </p>
              {usage.driver === "database" ? (
                <p className="mt-1 text-sm text-ink-soft">
                  Fotos no banco: <strong>{formatMb(usage.photoBytes)}</strong> de {formatMb(usage.photoLimitBytes)} reservados ({usage.files} arquivos
                  {usage.byPrefix.length > 0 ? `: ${usage.byPrefix.map((r) => `${r.prefix} ${r.files}`).join(", ")}` : ""}).
                </p>
              ) : (
                <p className="mt-1 text-sm text-ink-soft">Fotos guardadas em: {usage.driver === "s3" ? "armazenamento externo" : "pasta do servidor"}.</p>
              )}
            </div>
          </div>
        </SectionPanel>
      </div>

      <div className="mt-6">
        <SectionPanel title="Vendas pagas por dia" id="titulo-grafico">
          <DailySalesChart data={stats.daily} />
        </SectionPanel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionPanel title="Mais vendidos (30 dias)" id="titulo-top">
          {stats.topProducts.length === 0 ? (
            <p className="text-ink-soft">Ainda não há vendas pagas neste período.</p>
          ) : (
            <ol className="divide-y divide-line">
              {stats.topProducts.map((product, index) => (
                <li key={product.name} className="flex items-center justify-between gap-4 py-2">
                  <span className="min-w-0">
                    <span className="mr-2 text-ink-soft">{index + 1}.</span>
                    {product.name}
                  </span>
                  <span className="shrink-0 text-right text-sm">
                    <strong>{product.quantity}</strong> un. · {formatBRL(product.revenueCents)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </SectionPanel>

        <SectionPanel
          title="Estoque baixo"
          id="titulo-estoque"
          action={
            <Link href="/admin/estoque" className="text-sm">
              Abrir estoque
            </Link>
          }
        >
          {stats.lowStock.length === 0 ? (
            <p className="text-ink-soft">Nenhum produto publicado com estoque baixo.</p>
          ) : (
            <ul className="divide-y divide-line">
              {stats.lowStock.map((product) => (
                <li key={product.id} className="flex items-center justify-between gap-4 py-2">
                  <Link href={`/admin/produtos/${product.id}`} className="min-w-0 text-ink">
                    {product.name}
                  </Link>
                  <span className={`shrink-0 font-bold ${product.stock === 0 ? "text-enamel-deep" : ""}`}>
                    {product.stock === 0 ? "Sem estoque" : `${product.stock} un.`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionPanel>
      </div>

      <div className="mt-6">
        <SectionPanel
          title="Pedidos recentes"
          id="titulo-recentes"
          action={
            <Link href="/admin/pedidos" className="text-sm">
              Ver todos
            </Link>
          }
        >
          {stats.recentOrders.length === 0 ? (
            <p className="text-ink-soft">Nenhum pedido ainda.</p>
          ) : (
            <div className="table-wrap">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th scope="col">Pedido</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Data</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="text-right">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td data-primary>
                        <Link href={`/admin/pedidos/${order.id}`} className="font-bold">
                          #{order.number}
                        </Link>
                      </td>
                      <td data-label="Cliente">{order.customerName}</td>
                      <td data-label="Data" className="whitespace-nowrap">{formatDateTime(order.createdAt)}</td>
                      <td data-label="Status">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td data-label="Total" className="text-right tabular-nums">{formatBRL(order.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionPanel>
      </div>
    </>
  );
}
