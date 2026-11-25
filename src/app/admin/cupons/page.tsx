import type { Metadata } from "next";
import { AdminPageHeader, SectionPanel } from "@/components/admin/admin-ui";
import { CouponRowActions, NewCouponForm } from "@/components/admin/coupon-forms";
import { Badge } from "@/components/ui";
import { formatBr } from "@/lib/datetime-br";
import { formatBRL } from "@/lib/money";
import { requireAdminPage } from "@/server/auth/current-user";
import { listCoupons } from "@/server/services/coupons";

export const metadata: Metadata = { title: "Cupons" };

export default async function AdminCouponsPage() {
  await requireAdminPage("/admin/cupons");
  const coupons = await listCoupons();
  const now = new Date();

  return (
    <>
      <AdminPageHeader
        title="Cupons de desconto"
        description="Crie códigos de desconto para a Black Friday e outras campanhas. O desconto é conferido no servidor a cada pedido e fica registrado no pedido."
      />
      <div className="space-y-6">
        <SectionPanel title="Novo cupom" id="titulo-novo">
          <NewCouponForm />
        </SectionPanel>

        <SectionPanel title="Cupons cadastrados" id="titulo-lista">
          {coupons.length === 0 ? (
            <p className="text-ink-soft">Nenhum cupom ainda.</p>
          ) : (
            <ul className="space-y-3">
              {coupons.map((c) => {
                const expired = c.endsAt !== null && c.endsAt <= now;
                const notStarted = c.startsAt !== null && c.startsAt > now;
                const exhausted = c.maxRedemptions !== null && c.used >= c.maxRedemptions;
                return (
                  <li key={c.id} className="rounded-md border border-line p-4">
                    <p className="flex flex-wrap items-center gap-2">
                      <strong className="font-mono text-lg">{c.code}</strong>
                      {!c.active ? (
                        <Badge tone="neutral">Desativado</Badge>
                      ) : expired ? (
                        <Badge tone="neutral">Expirado</Badge>
                      ) : notStarted ? (
                        <Badge tone="info">Agendado</Badge>
                      ) : exhausted ? (
                        <Badge tone="neutral">Esgotado</Badge>
                      ) : (
                        <Badge tone="success">Valendo</Badge>
                      )}
                      <span className="font-bold">{c.kind === "PERCENT" ? `${c.value}% de desconto` : `${formatBRL(c.value)} de desconto`}</span>
                    </p>
                    <p className="mt-1 text-sm text-ink-soft">
                      Usos: {c.used}
                      {c.maxRedemptions !== null ? ` de ${c.maxRedemptions}` : " (sem limite total)"}
                      {c.maxPerUser !== null ? ` · ${c.maxPerUser} por cliente` : ""}
                      {c.minSubtotalCents > 0 ? ` · mínimo ${formatBRL(c.minSubtotalCents)} em produtos` : ""}
                      {c.startsAt ? ` · de ${formatBr(c.startsAt)}` : ""}
                      {c.endsAt ? ` até ${formatBr(c.endsAt)}` : ""}
                      {c.description ? ` · ${c.description}` : ""}
                    </p>
                    <div className="mt-3">
                      <CouponRowActions id={c.id} active={c.active} used={c.used} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionPanel>
      </div>
    </>
  );
}
