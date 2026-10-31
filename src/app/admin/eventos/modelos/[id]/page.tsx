import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPageHeader, SectionPanel } from "@/components/admin/admin-ui";
import { ApplyTemplatePanel } from "@/components/admin/apply-template-panel";
import { EventTemplateForm } from "@/components/admin/event-template-form";
import { Alert } from "@/components/ui";
import { UUID_RE } from "@/lib/schemas";
import { requireAdminPage } from "@/server/auth/current-user";
import { getTemplate, listTemplates, listUpcomingForTemplate } from "@/server/services/events";
import { fileUrl } from "@/server/storage";

export const metadata: Metadata = { title: "Editar modelo de evento" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EditTemplatePage({ params, searchParams }: Props) {
  const { id } = await params;
  await requireAdminPage(`/admin/eventos/modelos/${id}`);
  if (!UUID_RE.test(id)) notFound();
  const [template, query] = await Promise.all([getTemplate(id), searchParams]);
  if (!template) notFound();
  const [upcoming, all] = await Promise.all([listUpcomingForTemplate(id), listTemplates()]);
  const totalEvents = all.find((t) => t.id === id)?.totalCount ?? 0;

  return (
    <>
      <AdminPageHeader
        title={template.name}
        back={{ href: "/admin/eventos/modelos", label: "Modelos" }}
        actions={
          <Link href={`/admin/eventos/novo?modelo=${template.id}`} className="btn btn-primary">
            Marcar uma data com este modelo
          </Link>
        }
      />
      <div className="space-y-6">
        {query.criado === "1" && <Alert tone="ok">Modelo criado. Agora você pode marcar datas com ele.</Alert>}
        <SectionPanel title="Dados do modelo" id="titulo-modelo">
          <EventTemplateForm
            totalEvents={totalEvents}
            template={{
              id: template.id,
              name: template.name,
              description: template.description,
              location: template.location,
              startTime: template.defaultStartTime ?? "",
              endTime: template.defaultEndTime ?? "",
              imageKey: template.imageKey,
              imageUrl: fileUrl(template.imageKey),
            }}
          />
        </SectionPanel>
        <SectionPanel title="Atualizar datas já marcadas" id="titulo-aplicar">
          <p className="mb-4 max-w-[65ch] text-sm text-ink-soft">
            Salvar o modelo <strong>não muda</strong> os eventos que já estão no calendário. Se quiser que as próximas datas sigam o modelo atual, faça isso aqui, escolhendo os campos. Datas passadas e canceladas nunca são alteradas.
          </p>
          <ApplyTemplatePanel templateId={template.id} dates={upcoming.map((e) => ({ id: e.id, date: e.eventDate, title: e.title }))} />
        </SectionPanel>
      </div>
    </>
  );
}
