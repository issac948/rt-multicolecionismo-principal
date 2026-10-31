/** Mostrado enquanto a próxima tela do painel carrega. */
export default function AdminLoading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Carregando...</span>
      <div className="skeleton h-9 w-1/2 max-w-xs" aria-hidden />
      <div className="skeleton mt-3 h-4 w-2/3 max-w-md" aria-hidden />
      <div className="mt-6 space-y-3" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-16" />
        ))}
      </div>
    </div>
  );
}
