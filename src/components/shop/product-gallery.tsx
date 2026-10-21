"use client";

import { useState } from "react";
import { NoPhoto } from "@/components/shop/no-photo";

type GalleryImage = { id: string; url: string; thumbUrl: string; alt: string };

export function ProductGallery({ images, name }: { images: GalleryImage[]; name: string }) {
  const [index, setIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div className="aspect-[4/3] overflow-hidden rounded-md">
        <NoPhoto />
      </div>
    );
  }
  const current = images[Math.min(index, images.length - 1)];

  return (
    <div className="space-y-3">
      <div className="aspect-[4/3] overflow-hidden rounded-md bg-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.url} alt={current.alt || name} className="h-full w-full object-contain" />
      </div>
      {images.length > 1 && (
        <ul className="flex flex-wrap gap-2" aria-label="Fotos do produto">
          {images.map((image, i) => (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Ver foto ${i + 1} de ${images.length}`}
                aria-pressed={i === index}
                className={`block h-16 w-20 overflow-hidden rounded bg-panel outline-offset-2 ${
                  i === index ? "outline outline-[3px] outline-ink" : "opacity-80 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.thumbUrl} alt="" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
