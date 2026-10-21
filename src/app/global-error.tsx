"use client";

/**
 * Último recurso: o erro aconteceu no layout raiz (por exemplo, banco de dados fora do ar).
 * Precisa trazer <html> e <body> próprios e não depende de nenhum dado do servidor.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f6f7f8", color: "#1c2026", margin: 0 }}>
        <main style={{ maxWidth: 520, margin: "0 auto", padding: "4rem 1rem", textAlign: "center" }}>
          <h1>Estamos com um problema</h1>
          <p>A loja não conseguiu carregar agora. Tente novamente em alguns instantes.</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ marginTop: 16, padding: "0.75rem 1.5rem", background: "#ffc400", border: 0, borderRadius: 4, fontWeight: 700, fontSize: "1rem", cursor: "pointer" }}
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
