import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { CustomerResetLink } from "@/components/admin/customer-reset-link";
import { CustomerToggle } from "@/components/admin/customer-toggle";
import { Badge, buildHref, EmptyState, Pagination } from "@/components/ui";
import { formatBRL } from "@/lib/money";
import { formatDate, formatPhone } from "@/lib/text";
import { requireAdminPage } from "@/server/auth/current-user";
import { listCustomers } from "@/server/services/users";

export const metadata: Metadata = { title: "Clientes" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage("/admin/clientes");
  const query = await searchParams;
  const q = (first(query.q) ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number.parseInt(first(query.pagina) ?? "1", 10) || 1);

  const result = await listCustomers({ q, page });

  return (
    <>
      <AdminPageHeader
        title="Clientes"
        description={`${result.total} ${result.total === 1 ? "cliente cadastrado" : "clientes cadastrados"}${q ? " nesta busca" : ""}. “Total comprado” soma só pedidos pagos.`}
      />

      <form method="get" role="search" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="label">
            Buscar cliente
          </label>
          <input id="q" name="q" type="search" className="input" defaultValue={q} placeholder="Nome ou e-mail" maxLength={80} />
        </div>
        <button type="submit" className="btn btn-dark">
          <Search size={18} aria-hidden /> Buscar
        </button>
        {q && (
          <Link href="/admin/clientes" className="btn btn-outline">
            Limpar
          </Link>
        )}
      </form>

      {result.rows.length === 0 ? (
        <EmptyState title={q ? "Nenhum cliente encontrado" : "Ainda não há clientes"}>
          {q ? "Tente outro nome ou e-mail." : "Os clientes aparecem aqui assim que criarem uma conta na loja."}
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">Telefone</th>
                <th scope="col">Cadastro</th>
                <th scope="col" className="text-right">
                  Pedidos
                </th>
                <th scope="col" className="text-right">
                  Total comprado
                </th>
                <th scope="col">Conta</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <p className="font-bold">{customer.name}</p>
                    <p className="text-xs text-ink-soft">{customer.email}</p>
                  </td>
                  <td className="whitespace-nowrap">{customer.phone ? formatPhone(customer.phone) : "—"}</td>
                  <td className="whitespace-nowrap">{formatDate(customer.createdAt)}</td>
                  <td className="text-right tabular-nums">
                    {customer.ordersCount > 0 ? (
                      <Link href={buildHref("/admin/pedidos", { q: customer.email })}>{customer.ordersCount}</Link>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">{formatBRL(customer.totalSpentCents)}</td>
                  <td>{customer.active ? <Badge tone="success">Ativa</Badge> : <Badge tone="danger">Desativada</Badge>}</td>
                  <td>
                    <div className="flex flex-col items-start gap-2">
                      <CustomerToggle userId={customer.id} active={customer.active} name={customer.name} />
                      <CustomerResetLink userId={customer.id} name={customer.name} disabled={!customer.active} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={result.page} pages={result.pages} hrefFor={(p) => buildHref("/admin/clientes", { q, pagina: p > 1 ? p : undefined })} />
    </>
  );
}
