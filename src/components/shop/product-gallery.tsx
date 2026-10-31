"use client";

import { ChevronLeft, ChevronRight, Expand, X, ZoomIn, ZoomOut } from "lucide-react";
import { useRef, useState } from "react";
import { NoPhoto } from "@/components/shop/no-photo";

type GalleryImage = { id: string; url: string; thumbUrl: string; alt: string };

/**
 * Galeria do produto. A foto principal abre numa janela de ampliação (<dialog> nativo: foco preso, Esc fecha):
 * ali dá para ver o tamanho real, com rolagem, para conferir os detalhes da miniatura.
 */
export function ProductGallery({ images, name }: { images: GalleryImage[]; name: string }) {
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const viewer = useRef<HTMLDialogElement>(null);

  if (images.length === 0) {
    return (
      <div className="aspect-[4/3] overflow-hidden rounded-md">
        <NoPhoto />
      </div>
    );
  }
  const safe = Math.min(index, images.length - 1);
  const current = images[safe];
  const go = (delta: number) => {
    setIndex((safe + delta + images.length) % images.length);
    setZoomed(false);
  };

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-panel">
        <button
          type="button"
          className="block h-full w-full cursor-zoom-in"
          onClick={() => {
            setZoomed(false);
            viewer.current?.showModal();
          }}
          aria-label="Ampliar a foto"
          aria-haspopup="dialog"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.url} alt={current.alt || name} className="h-full w-full object-contain" fetchPriority="high" decoding="async" width={1400} height={1050} />
        </button>
        <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-night/80 px-2 py-1 text-xs font-semibold text-white" aria-hidden>
          <Expand size={14} /> Ampliar
        </span>
      </div>
      {images.length > 1 && (
        <ul className="flex flex-wrap gap-2" aria-label="Fotos do produto">
          {images.map((image, i) => (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Ver foto ${i + 1} de ${images.length}`}
                aria-pressed={i === safe}
                className={`block h-16 w-20 overflow-hidden rounded bg-panel outline-offset-2 ${
                  i === safe ? "outline outline-[3px] outline-ink" : "opacity-80 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <dialog ref={viewer} className="photo-viewer on-dark" aria-label={`Foto ampliada: ${name}`} onClick={(e) => e.target === e.currentTarget && viewer.current?.close()}>
        <div className="photo-viewer__bar">
          <p className="min-w-0 truncate font-semibold">
            {name}
            {images.length > 1 && <span className="ml-2 font-normal text-white/70">{safe + 1} de {images.length}</span>}
          </p>
          <div className="flex items-center gap-1">
            <button type="button" className="icon-btn" onClick={() => setZoomed((z) => !z)} aria-pressed={zoomed} aria-label={zoomed ? "Ajustar à tela" : "Ver em tamanho real"}>
              {zoomed ? <ZoomOut size={22} aria-hidden /> : <ZoomIn size={22} aria-hidden />}
            </button>
            <button type="button" className="icon-btn" onClick={() => viewer.current?.close()} aria-label="Fechar">
              <X size={24} aria-hidden />
            </button>
          </div>
        </div>
        <div className={`photo-viewer__stage ${zoomed ? "is-zoomed" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.url} alt={current.alt || name} onClick={() => setZoomed((z) => !z)} />
        </div>
        {images.length > 1 && (
          <>
            <button type="button" className="icon-btn photo-viewer__prev" onClick={() => go(-1)} aria-label="Foto anterior">
              <ChevronLeft size={28} aria-hidden />
            </button>
            <button type="button" className="icon-btn photo-viewer__next" onClick={() => go(1)} aria-label="Próxima foto">
              <ChevronRight size={28} aria-hidden />
            </button>
          </>
        )}
      </dialog>
    </div>
  );
}
