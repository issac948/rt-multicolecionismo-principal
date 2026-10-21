import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/shop/auth-forms";
import { safeNextPath } from "@/server/auth/authorize";
import { getCurrentUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Criar conta", robots: { index: false, follow: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).next;
  const next = typeof raw === "string" && raw ? safeNextPath(raw, "") || null : null;

  const user = await getCurrentUser();
  if (user) redirect(next ?? "/minha-conta");

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-md">
        <h1>Criar conta</h1>
        <p className="mt-2 text-ink-soft">Com a conta você acompanha seus pedidos e compra mais rápido da próxima vez.</p>
        <div className="panel mt-6">
          <RegisterForm next={next} />
        </div>
      </div>
    </div>
  );
}
