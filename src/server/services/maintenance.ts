import { purgeExpiredSessions } from "../auth/session";
import { cleanupOrphanImages } from "../storage/images";
import { expireUnpaidOrders } from "./orders";
import { purgeOldWebhookEvents } from "./payments";

export type MaintenanceReport = {
  expiredOrders: number;
  expiredSessions: number;
  orphanImages: number;
  oldWebhookEvents: number;
};

/**
 * Rotina periódica:
 *  - cancela pedidos que passaram do prazo sem pagamento e devolve o estoque;
 *  - apaga sessões vencidas, fotos enviadas e nunca usadas, e registros antigos de webhook.
 * É segura para rodar a qualquer momento e várias vezes.
 */
export async function runMaintenance(): Promise<MaintenanceReport> {
  return {
    expiredOrders: await expireUnpaidOrders(),
    expiredSessions: await purgeExpiredSessions(),
    orphanImages: await cleanupOrphanImages(24),
    oldWebhookEvents: await purgeOldWebhookEvents(90),
  };
}
