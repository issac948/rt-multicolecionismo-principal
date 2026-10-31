import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { Alert, EmptyState } from "@/components/ui";
import { formatTime } from "@/lib/events";
import { requireAdminPage } from "@/server/auth/current-user";
import { listTemplates } from "@/server/services/events";

export const metadata: Metadata = { title: "Modelos de evento" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function TemplatesPage({ searchParams }: Props) {
  await requireAdminPage("/admin/eventos/modelos");
  const query = await searchParams;
  const templates = await listTemplates();

  return (
    <>
      <AdminPageHeader
        title="Modelos de evento"
        back={{ href: "/admin/eventos", label: "Eventos" }}
        description="Um modelo guarda nome, local, horário, descrição e foto de um evento que se repete. Para cada data você escolhe o modelo e ajusta só o que mudar."
        actions={
          <Link href="/admin/eventos/modelos/novo" className="btn btn-primary">
            Novo modelo
          </Link>
        }
      />
      {query.excluido === "1" && <Alert tone="ok" className="mb-4">Modelo excluído. Os eventos já marcados continuam no calendário.</Alert>}
      {templates.length === 0 ? (
        <EmptyState
          title="Nenhum modelo ainda"
          action={
            <Link href="/admin/eventos/modelos/novo" className="btn btn-primary">
              Criar o primeiro modelo
            </Link>
          }
        >
          Se a loja participa várias vezes do mesmo evento, crie um modelo uma vez e depois só escolha as datas.
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {templates.map((t) => (
            <li key={t.id} className="panel flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-extrabold leading-tight [font-stretch:80%]">{t.name}</p>
                <p className="text-sm text-ink-soft">
                  {[t.location || "Sem local", t.defaultStartTime ? `${formatTime(t.defaultStartTime)}${t.defaultEndTime ? ` às ${formatTime(t.defaultEndTime)}` : ""}` : "Sem horário padrão"].join(" · ")}
                </p>
                <p className="text-sm text-ink-soft">
                  {t.upcomingCount} data(s) futura(s) · {t.totalCount} no total
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/eventos/novo?modelo=${t.id}`} className="btn btn-primary btn-sm">
                  <CalendarPlus size={16} aria-hidden /> Marcar data
                </Link>
                <Link href={`/admin/eventos/modelos/${t.id}`} className="btn btn-outline btn-sm">
                  Editar
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
