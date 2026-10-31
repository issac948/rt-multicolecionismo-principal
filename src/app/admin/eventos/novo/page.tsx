import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { EventCreateForm } from "@/components/admin/event-create-form";
import { isValidIsoDate, todayIso } from "@/lib/events";
import { UUID_RE } from "@/lib/schemas";
import { requireAdminPage } from "@/server/auth/current-user";
import { listTemplates } from "@/server/services/events";
import { fileUrl } from "@/server/storage";

export const metadata: Metadata = { title: "Novo evento" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NewEventPage({ searchParams }: Props) {
  await requireAdminPage("/admin/eventos/novo");
  const query = await searchParams;
  const templates = await listTemplates();
  const modelo = one(query.modelo);
  const data = one(query.data);

  return (
    <>
      <AdminPageHeader
        title="Novo evento"
        back={{ href: "/admin/eventos", label: "Eventos" }}
        description={
          <>
            Escolha um modelo para preencher os dados e marque uma ou mais datas. Também dá para cadastrar um evento avulso.{" "}
            <Link href="/admin/eventos/modelos/novo">Criar um modelo</Link>
          </>
        }
      />
      <EventCreateForm
        key={`${modelo ?? ""}|${data ?? ""}`}
        today={todayIso()}
        initialTemplateId={modelo && UUID_RE.test(modelo) ? modelo : ""}
        initialDate={data && isValidIsoDate(data) ? data : ""}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          location: t.location,
          startTime: t.defaultStartTime ?? "",
          endTime: t.defaultEndTime ?? "",
          imageKey: t.imageKey,
          imageUrl: fileUrl(t.imageKey),
        }))}
      />
    </>
  );
}
