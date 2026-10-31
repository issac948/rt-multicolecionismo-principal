/**
 * Roda a rotina de manutenção uma vez (cancela pedidos não pagos vencidos e devolve o estoque,
 * limpa sessões vencidas, fotos órfãs e registros antigos de webhook).
 * Útil para agendar no cron do servidor: npm run maintenance
 */
import { pool } from "../src/server/db";
import { runMaintenance } from "../src/server/services/maintenance";

runMaintenance("terminal")
  .then((report) => console.log("Manutenção concluída:", report))
  .catch((error) => {
    console.error("Falha na manutenção:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
