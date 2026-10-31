/**
 * Agendador do Netlify: chama a rotina de manutenção da loja a cada hora.
 * Faz o que o servidor comum faz sozinho: cancela pedidos NÃO PAGOS com prazo vencido (devolvendo o estoque) e limpa sessões
 * vencidas, fotos abandonadas e registros antigos. Pedidos pagos nunca são tocados.
 *
 * Só roda em publicações de produção do Netlify. Precisa de duas variáveis de ambiente (Site configuration > Environment variables):
 *   CRON_SECRET  um texto secreto com pelo menos 16 caracteres (o mesmo valor que a rota /api/cron/maintenance confere)
 *   SITE_URL     o endereço da loja, ex.: https://minhaloja.com.br (se faltar, usa o endereço do próprio Netlify)
 * Sem CRON_SECRET nada acontece (só um aviso no registro da função) e o painel da loja mostra o alerta.
 *
 * Custo: 24 execuções por dia, cada uma de menos de 2 segundos. Para mudar a frequência, edite "schedule" abaixo
 * (formato cron, horário UTC: "0 * * * *" = de hora em hora; "0,30 * * * *" = a cada 30 minutos).
 */
export default async function manutencao(): Promise<void> {
  const base = (process.env.SITE_URL || process.env.URL || "").replace(/\/+$/, "");
  const secret = process.env.CRON_SECRET || "";
  if (!base || secret.length < 16) {
    console.error("[manutenção] defina SITE_URL e CRON_SECRET (mínimo 16 caracteres) nas variáveis de ambiente do Netlify.");
    return;
  }

  try {
    const response = await fetch(`${base}/api/cron/maintenance`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(25_000),
    });
    const text = await response.text();
    console.log(`[manutenção] HTTP ${response.status}: ${text.slice(0, 500)}`);
  } catch (error) {
    console.error("[manutenção] falhou:", error instanceof Error ? error.message : error);
  }
}

export const config = { schedule: "0 * * * *" };
