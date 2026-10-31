export async function register() {
  // Só no servidor Node, e nunca durante o build ou nos testes.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "test") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Hospedagem sem servidor (Netlify): não há processo ligado o tempo todo; a manutenção roda sob demanda (ver layout da loja).
  if (process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL) return;

  const { startMaintenanceLoop } = await import("./server/maintenance-loop");
  startMaintenanceLoop();
}
