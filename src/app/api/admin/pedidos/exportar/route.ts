import { NextResponse } from "next/server";
import { ORDER_STATUS_LABEL, ORDER_STATUSES, type OrderStatus } from "@/lib/constants";
import { centsToCsv, toCsv } from "@/lib/csv";
import { getCurrentUser } from "@/server/auth/current-user";
import { assertRole } from "@/server/auth/authorize";
import { AppError } from "@/server/errors";
import { checkRateLimit } from "@/server/security/rate-limit";
import { listOrdersWithItems } from "@/server/services/orders";

export const dynamic = "force-dynamic";

const PAYMENT_LABEL: Record<string, string> = { PENDENTE: "Pendente", APROVADO: "Aprovado", RECUSADO: "Recusado", CANCELADO: "Cancelado", REEMBOLSADO: "Reembolsado" };

/** Exporta pedidos (mesmos filtros da tela) em CSV. Somente ADMIN; só lê. */
export async function GET(request: Request) {
  try {
    const admin = assertRole(await getCurrentUser(), "ADMIN");
    const limit = checkRateLimit(`export:${admin.id}`, 20, 60_000);
    if (!limit.ok) return NextResponse.json({ error: "Muitas exportações seguidas. Aguarde um minuto." }, { status: 429 });

    const params = new URL(request.url).searchParams;
    const statusParam = params.get("status") ?? "";
    const status = (ORDER_STATUSES as readonly string[]).includes(statusParam) ? (statusParam as OrderStatus) : undefined;
    const { rows, truncated } = await listOrdersWithItems({ status, q: (params.get("q") ?? "").trim().slice(0, 80), attention: params.get("atencao") === "1" });

    const date = (d: Date | null) => (d ? new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 16).replace("T", " ") : "");
    const csv = toCsv(
      ["Pedido", "Data (Brasília)", "Status", "Pagamento", "Cliente", "E-mail", "Telefone", "Itens", "Produtos (R$)", "Frete (R$)", "Desconto (R$)", "Cupom", "Total (R$)", "Entrega", "Rastreio", "Destinatário", "CEP", "Endereço", "Cidade/UF", "Observação do cliente"],
      rows.map((o) => {
        const a = o.shippingAddress;
        return [
          o.number, date(o.createdAt), ORDER_STATUS_LABEL[o.status], PAYMENT_LABEL[o.paymentStatus] ?? o.paymentStatus,
          o.customerName, o.customerEmail, o.customerPhone,
          o.items.map((i) => `${i.quantity}x ${i.name}${i.sku ? ` (${i.sku})` : ""}`).join(" | "),
          centsToCsv(o.subtotalCents), centsToCsv(o.shippingCents), centsToCsv(o.discountCents), o.couponCode, centsToCsv(o.totalCents),
          o.shippingMethodLabel, o.trackingCode, a?.recipientName ?? "", a?.cep ?? "",
          a ? `${a.street}, ${a.number}${a.complement ? ` - ${a.complement}` : ""} - ${a.neighborhood}` : "",
          a ? `${a.city}/${a.state}` : "", o.customerNote,
        ];
      }),
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pedidos-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
        ...(truncated ? { "X-Export-Truncated": "1" } : {}),
      },
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[exportar pedidos]", error);
    return NextResponse.json({ error: "Não foi possível exportar agora." }, { status: 500 });
  }
}
