export async function register() {
  // Só no servidor Node, e nunca durante o build ou nos testes.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "test") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startMaintenanceLoop } = await import("./server/maintenance-loop");
  startMaintenanceLoop();
}
