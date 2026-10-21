import { Camera } from "lucide-react";

/**
 * Estado "sem foto" da vitrine: painel preto com acabamento dourado e a faixa quadriculada da marca.
 * Aparece enquanto o dono ainda não enviou a foto real do produto (nunca se usa imagem de outro produto).
 */
export function NoPhoto({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "no-photo no-photo-compact" : "no-photo"} role="img" aria-label="Foto em breve">
      <Camera size={compact ? 18 : 30} strokeWidth={1.5} aria-hidden />
      {!compact && <span>Foto em breve</span>}
    </div>
  );
}
