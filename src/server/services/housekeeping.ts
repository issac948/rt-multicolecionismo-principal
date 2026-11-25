import { applyScheduledPromotions } from "./promotions";
import { releaseExpiredReservations } from "./reservations";

let lastPromoRun = 0;
const PROMO_MIN_INTERVAL_MS = 30_000;

/** Só para testes. */
export function resetHousekeepingGate(): void {
  lastPromoRun = 0;
}

/**
 * Tarefas leves antes de mostrar preço/estoque: libera reservas vencidas e liga/desliga promoções programadas.
 * Cada uma roda no máximo 1x/30 s por instância (`force` ignora o intervalo: usado ao criar pedido, para o preço valer no segundo certo).
 */
export async function publicHousekeeping(options: { force?: boolean } = {}): Promise<void> {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const now = Date.now();
  const promo = options.force || now - lastPromoRun >= PROMO_MIN_INTERVAL_MS;
  if (promo) lastPromoRun = now;
  await Promise.all([releaseExpiredReservations(options), promo ? applyScheduledPromotions() : Promise.resolve()]);
}
