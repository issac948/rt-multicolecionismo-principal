import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { EventEditForm } from "@/components/admin/event-edit-form";
import { Badge } from "@/components/ui";
import { EVENT_STATUS_LABEL, EVENT_STATUS_TONE, formatEventDateLong } from "@/lib/events";
import { UUID_RE } from "@/lib/schemas";
import { requireAdminPage } from "@/server/auth/current-user";
import { getAdminEvent } from "@/server/services/events";
import { fileUrl } from "@/server/storage";

export const metadata: Metadata = { title: "Editar evento" };

type Props = { params: Promise<{ id: string }> };

export default async function EditEventPage({ params }: Props) {
  const { id } = await params;
  await requireAdminPage(`/admin/eventos/${id}`);
  if (!UUID_RE.test(id)) notFound();
  const event = await getAdminEvent(id);
  if (!event) notFound();

  return (
    <>
      <AdminPageHeader
        title={event.title}
        back={{ href: "/admin/eventos", label: "Eventos" }}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={EVENT_STATUS_TONE[event.status ?? "PUBLICADO"]}>{EVENT_STATUS_LABEL[event.status ?? "PUBLICADO"]}</Badge>
            {formatEventDateLong(event.date)}
          </span>
        }
      />
      <EventEditForm
        event={{
          id: event.id,
          title: event.title,
          description: event.description,
          location: event.location,
          date: event.date,
          startTime: event.startTime ?? "",
          endTime: event.endTime ?? "",
          status: event.status ?? "PUBLICADO",
          imageKey: event.imageKey,
          imageUrl: fileUrl(event.imageKey),
          templateName: event.templateName ?? null,
        }}
      />
    </>
  );
}
