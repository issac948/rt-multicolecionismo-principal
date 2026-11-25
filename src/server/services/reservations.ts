import { expireUnpaidOrders } from "./orders";

/**
 * Libera as reservas de estoque de pedidos NÃO pagos cujo prazo acabou, sem esperar a manutenção de hora em hora.
 * Chamada ao abrir catálogo/produto/carrinho e ao criar pedido: uma peça presa por um pedido vencido volta a ficar à venda na hora.
 *
 * - No máximo uma vez a cada 30 s por instância (custo: uma consulta indexada); `force` ignora o intervalo (usado ao criar pedido).
 * - Nunca lança: falha aqui não pode derrubar a página que pediu.
 * - Pedido pago nunca é tocado (a regra é a mesma de `expireUnpaidOrders`, com trava na linha do pedido).
 */
export const RESERVATION_RELEASE_MIN_INTERVAL_MS = 30_000;

let lastRun = 0;

/** Só para testes. */
export function resetReservationGate(): void {
  lastRun = 0;
}

export async function releaseExpiredReservations(options: { force?: boolean } = {}): Promise<number> {
  if (process.env.NEXT_PHASE === "phase-production-build") return 0;
  const now = Date.now();
  if (!options.force && now - lastRun < RESERVATION_RELEASE_MIN_INTERVAL_MS) return 0;
  lastRun = now;
  try {
    return await expireUnpaidOrders();
  } catch (error) {
    console.error("[reservas] não consegui liberar reservas vencidas:", error instanceof Error ? error.message : error);
    return 0;
  }
}
