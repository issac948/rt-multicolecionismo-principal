import Link from "next/link";
import type { ReactNode } from "react";

export function AdminPageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6">
      {back && (
        <p className="mb-2 text-sm">
          <Link href={back.href}>← {back.label}</Link>
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="!text-[clamp(1.75rem,4vw,2.5rem)]">{title}</h1>
          {description && <p className="mt-2 max-w-[65ch] text-ink-soft">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
      </div>
    </header>
  );
}

/** Número de destaque do painel: rótulo em cima, valor grande (figuras proporcionais), apoio embaixo. */
export function StatTile({
  label,
  value,
  note,
  href,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  href?: string;
  tone?: "default" | "attention";
}) {
  const body = (
    <>
      <p className="text-sm font-semibold text-ink-soft">{label}</p>
      <p className="mt-1 text-3xl font-extrabold leading-tight [font-stretch:85%]">{value}</p>
      {note && <p className="mt-1 text-sm text-ink-soft">{note}</p>}
    </>
  );
  const cls = `block rounded-md p-4 text-ink no-underline ${tone === "attention" ? "bg-warn-soft" : "bg-white"} ${href ? "hover:bg-panel" : ""}`;
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function SectionPanel({
  title,
  action,
  children,
  id,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="panel" aria-labelledby={id}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-2xl">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
