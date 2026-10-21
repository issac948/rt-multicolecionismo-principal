import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/shop/auth-forms";
import { isResetTokenValid } from "@/server/services/password-reset";
import { getSettings } from "@/server/services/settings";
import { whatsappLink } from "@/lib/text";

// O endereço contém o código secreto do link: não é indexado e não vaza para outros sites pelo Referer.
export const metadata: Metadata = { title: "Nova senha", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await isResetTokenValid(token);
  const settings = await getSettings();
  const whatsapp = whatsappLink(settings.whatsapp, "Olá! Preciso de um novo link para criar minha senha.");

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-md">
        <h1>Criar nova senha</h1>
        {valid ? (
          <>
            <p className="mt-2 text-ink-soft">Escolha uma senha nova com pelo menos 8 caracteres. Este link só funciona uma vez.</p>
            <div className="panel mt-6">
              <ResetPasswordForm token={token} />
            </div>
          </>
        ) : (
          <div className="panel mt-6 space-y-3">
            <p className="font-semibold">Este link não é mais válido.</p>
            <p className="text-ink-soft">Ele pode ter expirado (vale por 60 minutos) ou já ter sido usado. Peça um novo link para a loja.</p>
            {whatsapp && (
              <p>
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                  Pedir novo link no WhatsApp
                </a>
              </p>
            )}
            <p>
              <Link href="/login">Voltar para o login</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
