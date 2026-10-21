import { runMaintenance } from "./services/maintenance";

const INTERVAL_MS = 5 * 60 * 1000;
const globalState = globalThis as unknown as { __lojaMaintenance?: NodeJS.Timeout; __lojaMaintenanceBusy?: boolean };

/**
 * Executa a manutenção a cada 5 minutos dentro do próprio servidor da loja.
 * Assim os pedidos não pagos expiram (e o estoque volta) sem precisar configurar cron.
 * Para vários servidores ao mesmo tempo, use o cron externo (/api/cron/maintenance):
 * a rotina é segura para rodar em paralelo.
 */
export function startMaintenanceLoop(): void {
  if (globalState.__lojaMaintenance) return;

  const tick = async () => {
    if (globalState.__lojaMaintenanceBusy) return;
    globalState.__lojaMaintenanceBusy = true;
    try {
      const report = await runMaintenance();
      if (report.expiredOrders > 0) {
        console.log(`[manutenção] ${report.expiredOrders} pedido(s) não pago(s) expirado(s); estoque devolvido.`);
      }
    } catch (error) {
      console.error("[manutenção] falhou:", error instanceof Error ? error.message : error);
    } finally {
      globalState.__lojaMaintenanceBusy = false;
    }
  };

  globalState.__lojaMaintenance = setInterval(tick, INTERVAL_MS);
  globalState.__lojaMaintenance.unref();
}
