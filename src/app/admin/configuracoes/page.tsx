import { toBrLocalInput } from "@/lib/datetime-br";
import type { Metadata } from "next";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { AdminPageHeader, SectionPanel } from "@/components/admin/admin-ui";
import { SettingsForm } from "@/components/admin/settings-form";
import { ShippingTestForm } from "@/components/admin/shipping-test-form";
import { centsToInput } from "@/lib/money";
import { formatCep } from "@/lib/text";
import { aiStatus } from "@/server/ai";
import { requireAdminPage } from "@/server/auth/current-user";
import { getEnv } from "@/server/env";
import { getPaymentProvider, isPaymentConfigured } from "@/server/payments";
import { getSettings } from "@/server/services/settings";
import { isSuperFreteConfigured } from "@/server/shipping/superfrete";
import { fileUrl } from "@/server/storage";

export const metadata: Metadata = { title: "Configurações" };

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-ok" aria-label="Pronto" /> : <CircleAlert size={20} className="mt-0.5 shrink-0 text-enamel-deep" aria-label="Pendente" />}
      <span>{children}</span>
    </li>
  );
}

export default async function AdminSettingsPage() {
  await requireAdminPage("/admin/configuracoes");
  const settings = await getSettings();
  const env = getEnv();
  const ai = aiStatus();
  const provider = getPaymentProvider();
  const paypal = env.paypal;
  const superFreteReady = isSuperFreteConfigured();
  const webhookReady =
    provider.id === "paypal" ? Boolean(paypal.webhookId) : provider.id === "infinitepay" ? env.infinitePay.webhookToken.length >= 16 : Boolean(env.mercadoPago.webhookSecret);

  return (
    <>
      <AdminPageHeader title="Configurações" description="Dados da loja, entrega e formas de pagamento. Não precisa mexer em código." />

      <div className="space-y-6">
        <SettingsForm
          initial={{
            storeName: settings.storeName,
            tagline: settings.tagline,
            description: settings.description,
            logoKey: settings.logoKey,
            logoUrl: fileUrl(settings.logoKey),
            whatsapp: settings.whatsapp,
            whatsappGroupUrl: settings.whatsappGroupUrl,
            instagram: settings.instagram,
            email: settings.email,
            phone: settings.phone,
            addressText: settings.addressText,
            businessHours: settings.businessHours,
            fairsNote: settings.fairsNote,
            shippingDeliveryEnabled: settings.shipping.deliveryEnabled,
            shippingFlatRate: centsToInput(settings.shipping.flatRateCents),
            shippingFreeAbove: centsToInput(settings.shipping.freeAboveCents),
            shippingEstimate: settings.shipping.estimate,
            shippingPickupEnabled: settings.shipping.pickupEnabled,
            shippingPickupInstructions: settings.shipping.pickupInstructions,
            shippingMode: settings.shipping.mode,
            shippingOriginCep: settings.shipping.origin.cep ? formatCep(settings.shipping.origin.cep) : "",
            shippingOriginStreet: settings.shipping.origin.street,
            shippingOriginNumber: settings.shipping.origin.number,
            shippingOriginComplement: settings.shipping.origin.complement,
            shippingOriginNeighborhood: settings.shipping.origin.neighborhood,
            shippingOriginCity: settings.shipping.origin.city,
            shippingOriginState: settings.shipping.origin.state,
            shippingServiceSedex: settings.shipping.services.sedex,
            shippingServicePac: settings.shipping.services.pac,
            shippingServiceMini: settings.shipping.services.mini,
            shippingHandling: centsToInput(settings.shipping.handlingCents),
            shippingDeclareValue: settings.shipping.declareValue,
            shippingPostingDays: settings.shipping.postingDays,
            shippingItemWeight: settings.shipping.defaultItem.weightGrams,
            shippingItemLength: settings.shipping.defaultItem.lengthCm,
            shippingItemWidth: settings.shipping.defaultItem.widthCm,
            shippingItemHeight: settings.shipping.defaultItem.heightCm,
            shopAssistantEnabled: settings.shopAssistantEnabled,
            payPix: settings.payment.pix,
            payCard: settings.payment.card,
            payBoleto: settings.payment.boleto,
            payMaxInstallments: settings.payment.maxInstallments,
            payWindowMinutes: settings.payment.windowMinutes,
            campMode: settings.campaign.enabled ? (settings.campaign.mode ?? "auto") : "off",
            campName: settings.campaign.name,
            campHeadline: settings.campaign.headline,
            campTeaser: settings.campaign.teaser,
            campStarts: toBrLocalInput(settings.campaign.startsAt),
            campEnds: toBrLocalInput(settings.campaign.endsAt),
            campCtaLabel: settings.campaign.ctaLabel,
            campCtaHref: settings.campaign.ctaHref,
            campTeaserHours: settings.campaign.teaserHours,
          }}
          providerId={provider.id}
          providerLabel={provider.label}
          superFreteReady={superFreteReady}
          aiReady={ai.configured}
        />

        <SectionPanel title="Ligações com outros serviços (somente leitura)" id="titulo-ligacoes">
          <p className="mb-4 text-sm text-ink-soft">
            Senhas e chaves nunca ficam no painel: ficam guardadas só no servidor, por segurança. Quem cuida da hospedagem preenche essas variáveis; o
            README explica cada uma.
          </p>
          <ul className="space-y-3">
            <Status ok={isPaymentConfigured()}>
              <strong>{provider.label} (pagamento):</strong>{" "}
              {isPaymentConfigured()
                ? provider.id === "paypal"
                  ? `credenciais configuradas (${paypal.mode === "live" ? "VENDAS REAIS" : "modo de TESTE, sem dinheiro de verdade"}).`
                  : provider.id === "infinitepay"
                    ? `InfiniteTag configurada ($${env.infinitePay.handle}).`
                    : "chave de acesso configurada."
                : provider.id === "paypal"
                  ? "faltam o Client ID e o Secret do PayPal (PAYPAL_CLIENT_ID e PAYPAL_CLIENT_SECRET). Sem eles a loja não recebe pedidos."
                  : provider.id === "infinitepay"
                    ? "faltam a InfiniteTag (INFINITEPAY_HANDLE) e/ou o segredo do aviso de pagamento (INFINITEPAY_WEBHOOK_TOKEN, mínimo 16 caracteres). Sem eles a loja não recebe pedidos."
                    : "falta a chave de acesso (MERCADOPAGO_ACCESS_TOKEN). Sem ela a loja não recebe pedidos."}
            </Status>
            <Status ok={webhookReady}>
              <strong>Confirmação automática de pagamento:</strong>{" "}
              {webhookReady
                ? provider.id === "paypal"
                  ? "ID do webhook configurado."
                  : provider.id === "infinitepay"
                    ? "segredo do aviso de pagamento configurado (o endereço de aviso é enviado automaticamente a cada pedido)."
                    : "assinatura secreta configurada."
                : provider.id === "paypal"
                  ? "falta o ID do webhook (PAYPAL_WEBHOOK_ID). Sem ele o PayPal não consegue avisar a loja; o pagamento ainda é conferido quando o cliente volta ao site, mas pode não ser confirmado se ele fechar a página."
                  : "falta a assinatura secreta (MERCADOPAGO_WEBHOOK_SECRET). Sem ela os pagamentos não são confirmados."}
              {provider.id !== "infinitepay" && (
                <span className="mt-1 block text-sm text-ink-soft">
                  Endereço para cadastrar no painel do {provider.label} (Webhooks):{" "}
                  <code className="break-all rounded bg-panel px-1">{env.siteUrl}{provider.webhookPath}</code>
                </span>
              )}
              {provider.id === "paypal" && (
                <span className="mt-1 block text-sm text-ink-soft">
                  Eventos: Checkout order approved, Payment capture completed / pending / denied / refunded / reversed.
                </span>
              )}
            </Status>
            <Status ok={env.siteUrl.startsWith("https://")}>
              <strong>Endereço da loja (SITE_URL):</strong> <code className="rounded bg-panel px-1">{env.siteUrl}</code>
              {!env.siteUrl.startsWith("https://") && <span className="block text-sm text-ink-soft">Em produção precisa começar com https:// para o {provider.label} poder avisar a loja sobre pagamentos.</span>}
            </Status>
            <Status ok={ai.configured}>
              <strong>Assistente de IA:</strong>{" "}
              {ai.configured
                ? `chave configurada (${ai.provider}). ${settings.shopAssistantEnabled ? "O assistente aparece para os clientes." : "O assistente dos clientes está desligado em “Assistente de compras”."}`
                : "desligado (precisa de AI_PROVIDER e AI_API_KEY no servidor)."}
            </Status>
            <Status ok={settings.shipping.mode === "calculated" ? superFreteReady && Boolean(settings.shipping.origin.cep) : true}>
              <strong>Frete:</strong>{" "}
              {settings.shipping.mode === "fixed"
                ? "valor fixo (a SuperFrete não é usada)."
                : superFreteReady
                  ? settings.shipping.origin.cep
                    ? `calculado pela SuperFrete, saindo do CEP ${formatCep(settings.shipping.origin.cep)}.`
                    : "calculado pela SuperFrete, mas falta o CEP de origem em Entrega."
                  : "calculado pela SuperFrete, mas falta o token (SUPERFRETE_TOKEN) no servidor. Enquanto isso a loja usa o valor fixo de reserva, se você definiu um."}
            </Status>
          </ul>
          {settings.shipping.mode === "calculated" && (
            <div className="mt-4">
              <ShippingTestForm />
            </div>
          )}
        </SectionPanel>
      </div>
    </>
  );
}
