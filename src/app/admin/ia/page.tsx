import { toCategoryOptions } from "@/lib/categories";
import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { AiAssistant } from "@/components/admin/ai-assistant";
import { aiStatus } from "@/server/ai";
import { requireAdminPage } from "@/server/auth/current-user";
import { listCategories } from "@/server/services/categories";

export const metadata: Metadata = { title: "Assistente de IA" };

export default async function AdminAiPage() {
  await requireAdminPage("/admin/ia");
  const [categories, status] = await Promise.all([listCategories({ onlyActive: true }), Promise.resolve(aiStatus())]);

  return (
    <>
      <AdminPageHeader
        title="Assistente de IA"
        description="Ajuda a cadastrar produtos mais rápido. A IA só sugere: nada vai para a loja sem você revisar e confirmar."
      />
      <AiAssistant categories={toCategoryOptions(categories)} configured={status.configured} providerLabel={status.provider} />
    </>
  );
}
