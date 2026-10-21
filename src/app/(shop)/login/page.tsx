import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/shop/auth-forms";
import { safeNextPath } from "@/server/auth/authorize";
import { Alert } from "@/components/ui";
import { whatsappLink } from "@/lib/text";
import { getCurrentUser } from "@/server/auth/current-user";
import { getSettings } from "@/server/services/settings";

export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const raw = query.next;
  const reset = query.senha === "redefinida";
  const next = typeof raw === "string" && raw ? safeNextPath(raw, "") || null : null;

  const user = await getCurrentUser();
  if (user) redirect(next ?? (user.role === "ADMIN" ? "/admin/dashboard" : "/minha-conta"));

  const settings = await getSettings();
  const whatsapp = whatsappLink(settings.whatsapp, "Olá! Esqueci minha senha da loja e preciso de um link para criar outra.");

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-md">
        <h1>Entrar</h1>
        <p className="mt-2 text-ink-soft">
          {next?.startsWith("/checkout") ? "Entre para finalizar sua compra. Seu carrinho continua guardado." : "Acesse sua conta para ver seus pedidos."}
        </p>
        {reset && (
          <Alert tone="ok" className="mt-4">
            Senha alterada. Entre com a nova senha.
          </Alert>
        )}
        <div className="panel mt-6">
          <LoginForm next={next} />
        </div>
        <p className="mt-4 text-sm text-ink-soft">
          <strong>Esqueceu a senha?</strong> Fale com a loja
          {whatsapp ? (
            <>
              {" "}
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                pelo WhatsApp
              </a>
            </>
          ) : (
            " pelos contatos no rodapé do site"
          )}
          : ela gera um link para você criar uma senha nova.
        </p>
      </div>
    </div>
  );
}
