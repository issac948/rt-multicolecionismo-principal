import { and, count, inArray, sql } from "drizzle-orm";
import { AWAITING_PAYMENT_STATUSES } from "@/lib/constants";
import { purgeExpiredSessions } from "../auth/session";
import { db } from "../db";
import { orders } from "../db/schema";
import { cleanupOrphanImages } from "../storage/images";
import { cleanupOrphanEventImages } from "./events";
import { expireUnpaidOrders } from "./orders";
import { purgeOldWebhookEvents } from "./payments";

/**
 * O QUE A MANUTENÇÃO FAZ (nada além disto):
 *
 *  Grupo "pedidos" (mexe em pedidos e estoque, por isso é o mais cuidadoso):
 *   1. Pedidos NÃO PAGOS cujo prazo de pagamento acabou são cancelados e o estoque reservado volta para a loja.
 *      Só pedidos "pendente"/"aguardando pagamento" com prazo vencido; cada pedido numa transação própria, com trava na linha
 *      (se o pagamento chegar no mesmo instante, só um dos dois vence); no máximo 200 por execução. Pedido pago NUNCA é tocado.
 *
 *  Grupo "limpeza" (não toca em pedidos, estoque nem pagamentos):
 *   2. Apaga sessões de login vencidas.
 *   3. Apaga fotos de produto enviadas há mais de 24 h e nunca ligadas a um produto.
 *   4. Apaga fotos de evento enviadas há mais de 24 h e não usadas por nenhum evento/modelo.
 *   5. Apaga registros antigos (90+ dias) do histórico de avisos de pagamento.
 *
 * É segura para rodar a qualquer momento e várias vezes, e cada consulta usa índice (custo baixo).
 */
export type MaintenanceReport = {
  expiredOrders: number;
  expiredSessions: number;
  orphanImages: number;
  orphanEventImages: number;
  oldWebhookEvents: number;
};

/** Resumo em português do que a manutenção fez (para o painel). */
export function describeMaintenance(report: MaintenanceReport): string {
  const parts = [
    report.expiredOrders > 0 ? `${report.expiredOrders} pedido(s) não pago(s) vencido(s) cancelado(s) e estoque devolvido` : "",
    report.expiredSessions > 0 ? `${report.expiredSessions} sessão(ões) vencida(s) removida(s)` : "",
    report.orphanImages + report.orphanEventImages > 0 ? `${report.orphanImages + report.orphanEventImages} foto(s) abandonada(s) removida(s)` : "",
    report.oldWebhookEvents > 0 ? `${report.oldWebhookEvents} registro(s) antigo(s) de pagamento limpo(s)` : "",
  ].filter(Boolean);
  return parts.length > 0 ? `Manutenção concluída: ${parts.join("; ")}.` : "Manutenção concluída: não havia nada para fazer.";
}

export type MaintenanceSource = "agendador" | "painel" | "sob-demanda" | "terminal";

/** Grupo "pedidos": só o cancelamento dos pedidos vencidos e a devolução do estoque. */
export async function runOrderMaintenance(): Promise<Pick<MaintenanceReport, "expiredOrders">> {
  return { expiredOrders: await expireUnpaidOrders() };
}

/** Grupo "limpeza": nada aqui toca em pedidos, estoque ou pagamentos. */
export async function runHousekeeping(): Promise<Omit<MaintenanceReport, "expiredOrders">> {
  return {
    expiredSessions: await purgeExpiredSessions(),
    orphanImages: await cleanupOrphanImages(24),
    orphanEventImages: await cleanupOrphanEventImages(24),
    oldWebhookEvents: await purgeOldWebhookEvents(90),
  };
}

export async function runMaintenance(source: MaintenanceSource = "terminal"): Promise<MaintenanceReport> {
  const startedAt = Date.now();
  const report: MaintenanceReport = { ...(await runOrderMaintenance()), ...(await runHousekeeping()) };
  await recordMaintenanceRun(source, report, Date.now() - startedAt);
  return report;
}

/* -------------------------------------------------------------------------- */
/* Registro da última execução (para o painel mostrar se está funcionando)     */
/* -------------------------------------------------------------------------- */

const KEY = "maintenance";

async function recordMaintenanceRun(source: MaintenanceSource, report: MaintenanceReport, durationMs: number): Promise<void> {
  try {
    const value = { lastRunAt: new Date().toISOString(), source, durationMs, report };
    await db.execute(sql`
      INSERT INTO settings (key, value, updated_at) VALUES (${KEY}, ${JSON.stringify(value)}::jsonb, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `);
  } catch (error) {
    // Falha ao anotar não pode invalidar a manutenção que já foi feita.
    console.error("[manutenção] não consegui registrar a execução:", error instanceof Error ? error.message : error);
  }
}

export type MaintenanceStatus = {
  lastRunAt: Date | null;
  source: MaintenanceSource | null;
  durationMs: number | null;
  report: MaintenanceReport | null;
  /** Pedidos não pagos com prazo vencido que ainda estão segurando estoque (a manutenção ainda não rodou para eles). */
  overdueUnpaidOrders: number;
};

export async function getMaintenanceStatus(): Promise<MaintenanceStatus> {
  const rows = (await db.execute(sql`SELECT value FROM settings WHERE key = ${KEY}`)).rows as Array<{ value: Record<string, unknown> }>;
  const value = rows[0]?.value as { lastRunAt?: string; source?: MaintenanceSource; durationMs?: number; report?: MaintenanceReport } | undefined;
  const [overdue] = await db
    .select({ n: count() })
    .from(orders)
    .where(and(inArray(orders.status, [...AWAITING_PAYMENT_STATUSES]), sql`${orders.expiresAt} < now()`));
  return {
    lastRunAt: value?.lastRunAt ? new Date(value.lastRunAt) : null,
    source: value?.source ?? null,
    durationMs: value?.durationMs ?? null,
    report: value?.report ?? null,
    overdueUnpaidOrders: overdue?.n ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Rede de segurança: manutenção quando o dono usa o painel                    */
/* -------------------------------------------------------------------------- */

/** Intervalo mínimo entre duas execuções "sob demanda". */
export const MAINTENANCE_MIN_INTERVAL_SECONDS = 10 * 60;

let lastLocalCheck = 0;

/** Só para testes: zera a trava local. */
export function resetMaintenanceGate(): void {
  lastLocalCheck = 0;
}

/**
 * Reserva, de forma atômica no banco, o direito de rodar a manutenção agora (vale para várias instâncias ao mesmo tempo).
 * Só o "sob demanda" usa isto; o agendador e o botão do painel rodam direto (a rotina é segura em paralelo).
 */
export async function claimMaintenanceSlot(minIntervalSeconds: number = MAINTENANCE_MIN_INTERVAL_SECONDS): Promise<boolean> {
  const result = await db.execute(sql`
    INSERT INTO settings (key, value, updated_at)
    VALUES (${KEY}, jsonb_build_object('lastRunAt', now()), now())
    ON CONFLICT (key) DO UPDATE
      SET value = settings.value || jsonb_build_object('lastRunAt', now()), updated_at = now()
      WHERE (settings.value->>'lastRunAt')::timestamptz < now() - make_interval(secs => ${minIntervalSeconds})
    RETURNING key
  `);
  return result.rows.length > 0;
}

/**
 * Rede de segurança para quem não configurou o agendador: roda a manutenção quando o DONO abre o painel (nunca em visitas
 * de clientes), no máximo uma vez a cada 10 minutos e sempre depois de a página já ter respondido. Nunca lança erro.
 */
export async function runMaintenanceIfDue(): Promise<MaintenanceReport | null> {
  const now = Date.now();
  if (now - lastLocalCheck < 60_000) return null;
  lastLocalCheck = now;
  try {
    if (!(await claimMaintenanceSlot())) return null;
    return await runMaintenance("sob-demanda");
  } catch (error) {
    console.error("[manutenção sob demanda] falhou:", error instanceof Error ? error.message : error);
    return null;
  }
}
