import Link from "next/link";
import type { ReactNode } from "react";

/** Cabeçalho de seção da vitrine: filete preto, título e um link "ver tudo" à direita. */
export function SectionHead({ id, title, href, linkLabel, children }: { id: string; title: string; href?: string; linkLabel?: string; children?: ReactNode }) {
  return (
    <>
      <div className="section-head">
        <h2 id={id}>{title}</h2>
        {href && linkLabel && <Link href={href}>{linkLabel}</Link>}
      </div>
      {children && <p className="mt-2 max-w-[60ch] text-ink-soft">{children}</p>}
    </>
  );
}
