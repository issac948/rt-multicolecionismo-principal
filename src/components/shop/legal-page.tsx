import type { ReactNode } from "react";
import { whatsappLink } from "@/lib/text";
import type { StoreSettings } from "@/server/services/settings";

/** Moldura das páginas de texto legal (privacidade, trocas, termos). Só mostra canais de contato que o dono cadastrou. */
export function LegalPage({ title, updated, settings, children }: { title: string; updated: string; settings: StoreSettings; children: ReactNode }) {
  const whatsapp = whatsappLink(settings.whatsapp, `Olá! Tenho uma dúvida sobre: ${title}.`);
  return (
    <div className="container-page py-10">
      <article className="mx-auto max-w-3xl space-y-4 leading-relaxed [&_h2]:mt-8 [&_h2]:text-2xl [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
        <h1>{title}</h1>
        <p className="text-sm text-ink-soft">Última atualização: {updated}</p>
        {children}
        <h2>Fale com a loja</h2>
        <ul>
          {settings.email && (
            <li>
              E-mail: <a href={`mailto:${settings.email}`}>{settings.email}</a>
            </li>
          )}
          {whatsapp && (
            <li>
              WhatsApp:{" "}
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                abrir conversa
              </a>
            </li>
          )}
          {settings.phone && <li>Telefone: {settings.phone}</li>}
          {settings.addressText && <li>Endereço: {settings.addressText}</li>}
          {!settings.email && !whatsapp && !settings.phone && <li>Use os canais de contato indicados no rodapé do site.</li>}
        </ul>
      </article>
    </div>
  );
}
