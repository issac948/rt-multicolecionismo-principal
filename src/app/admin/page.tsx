import { redirect } from "next/navigation";
import { requireAdminPage } from "@/server/auth/current-user";

export default async function AdminIndex() {
  await requireAdminPage("/admin");
  redirect("/admin/dashboard");
}
