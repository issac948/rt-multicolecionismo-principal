import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  type OrderStatus,
  type PaymentStatus,
  type Tone,
} from "@/lib/constants";
import { discountPercent, effectivePriceCents, formatBRL, isOnSale } from "@/lib/money";
import { cn } from "@/lib/text";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={PAYMENT_STATUS_TONE[status]}>{PAYMENT_STATUS_LABEL[status]}</Badge>;
}

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: "error" | "ok" | "info" | "warn";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("alert", `alert-${tone}`, className)} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

/** A etiqueta de preço da loja. Mostra o preço promocional em vermelho quando existe. */
export function PriceTag({
  product,
  size = "md",
}: {
  product: { priceCents: number; salePriceCents: number | null };
  size?: "md" | "lg";
}) {
  const sale = isOnSale(product);
  return (
    <span className={cn("price-tag", sale && "price-tag-sale", size === "lg" && "price-tag-lg")}>
      <span>{formatBRL(effectivePriceCents(product))}</span>
      {sale && (
        <>
          <span className="price-old">{formatBRL(product.priceCents)}</span>
          <span className="sr-only">Em promoção, {discountPercent(product)}% de desconto</span>
        </>
      )}
    </span>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="hint">{hint}</p>}
      {error && (
        <p className="field-error" id={`${htmlFor}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="panel text-center py-12">
      <h2 className="text-2xl">{title}</h2>
      {children && <p className="mt-2 text-ink-soft max-w-prose mx-auto">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Pagination({
  page,
  pages,
  hrefFor,
}: {
  page: number;
  pages: number;
  hrefFor: (page: number) => string;
}) {
  if (pages <= 1) return null;
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const numbers = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);

  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-center gap-2 mt-8">
      {page > 1 && (
        <Link className="btn btn-outline btn-sm" href={hrefFor(page - 1)} rel="prev">
          <ChevronLeft size={16} aria-hidden /> Anterior
        </Link>
      )}
      {numbers.map((n) => (
        <Link
          key={n}
          href={hrefFor(n)}
          aria-current={n === page ? "page" : undefined}
          className={cn("btn btn-sm", n === page ? "btn-dark" : "btn-outline")}
        >
          {n}
        </Link>
      ))}
      {page < pages && (
        <Link className="btn btn-outline btn-sm" href={hrefFor(page + 1)} rel="next">
          Próxima <ChevronRight size={16} aria-hidden />
        </Link>
      )}
    </nav>
  );
}

/** Monta uma URL com query string ignorando valores vazios. */
export function buildHref(path: string, params: Record<string, string | number | undefined | null | false>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
