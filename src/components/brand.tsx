/**
 * A logo oficial da RT Multicolecionismo (círculo preto com aro dourado).
 * Os arquivos ficam em public/brand e foram gerados SEM alterar a arte original (scripts/make-brand-assets.mjs).
 * Se o administrador enviar outra imagem em Configurações, `customSrc` a substitui.
 */
export function BrandMark({
  size = 48,
  customSrc,
  className,
}: {
  size?: number;
  customSrc?: string | null;
  className?: string;
}) {
  if (customSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={customSrc} alt="" width={size} height={size} className={`shrink-0 object-contain ${className ?? ""}`} style={{ height: size, width: "auto", maxWidth: size * 3 }} />
    );
  }
  const base = size <= 48 ? "/brand/logo-rt-96.png" : size <= 96 ? "/brand/logo-rt-192.png" : "/brand/logo-rt-512.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={base}
      srcSet={size <= 48 ? "/brand/logo-rt-96.png 1x, /brand/logo-rt-192.png 2x" : size <= 96 ? "/brand/logo-rt-192.png 1x, /brand/logo-rt-512.png 2x" : undefined}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-full ${className ?? ""}`}
    />
  );
}
