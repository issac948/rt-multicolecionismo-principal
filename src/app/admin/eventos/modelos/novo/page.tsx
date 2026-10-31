import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { EventTemplateForm } from "@/components/admin/event-template-form";
import { requireAdminPage } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Novo modelo de evento" };

export default async function NewTemplatePage() {
  await requireAdminPage("/admin/eventos/modelos/novo");
  return (
    <>
      <AdminPageHeader title="Novo modelo" back={{ href: "/admin/eventos/modelos", label: "Modelos" }} description="O modelo não aparece no site. Ele só serve para preencher os campos quando você marcar uma data." />
      <div className="panel">
        <EventTemplateForm />
      </div>
    </>
  );
}
