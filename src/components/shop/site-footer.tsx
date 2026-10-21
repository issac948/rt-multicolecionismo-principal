import Link from "next/link";
import { Clock, Mail, MapPin, MessageCircle, Phone, Users } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { hasContactInfo } from "@/components/shop/contact-info";
import { formatPhone, whatsappLink } from "@/lib/text";
import type { StoreSettings } from "@/server/services/settings";
import { fileUrl } from "@/server/storage";

export function SiteFooter({ settings }: { settings: StoreSettings }) {
  const whatsapp = whatsappLink(settings.whatsapp, "Olá! Vim pelo site e gostaria de ajuda.");
  const hasContact = hasContactInfo(settings);

  return (
    <footer className="on-dark mt-16 bg-night text-white" id="contato">
      <div className="checker" aria-hidden />
      <div className={`container-page grid gap-10 py-12 ${hasContact ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        <div>
          <div className="flex items-center gap-3">
            <BrandMark size={72} customSrc={fileUrl(settings.logoKey)} />
            <p className="brand-script text-3xl leading-none">{settings.storeName}</p>
          </div>
          {settings.description && <p className="mt-4 text-white/80 max-w-[40ch]">{settings.description}</p>}
          {settings.fairsNote && <p className="mt-3 text-sm text-white/65 max-w-[40ch]">{settings.fairsNote}</p>}
        </div>

        {hasContact && (
        <div>
          <h2 className="text-xl text-white">Fale com a gente</h2>
          <ul className="mt-3 space-y-2 text-white/90">
            {whatsapp && (
              <li>
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-white">
                  <MessageCircle size={18} aria-hidden /> WhatsApp {formatPhone(settings.whatsapp)}
                </a>
              </li>
            )}
            {settings.whatsappGroupUrl && (
              <li>
                <a href={settings.whatsappGroupUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-white">
                  <Users size={18} aria-hidden /> Grupo de clientes no WhatsApp
                </a>
              </li>
            )}
            {settings.phone && (
              <li>
                <a href={`tel:+55${settings.phone}`} className="inline-flex items-center gap-2 text-white">
                  <Phone size={18} aria-hidden /> {formatPhone(settings.phone)}
                </a>
              </li>
            )}
            {settings.email && (
              <li>
                <a href={`mailto:${settings.email}`} className="inline-flex items-center gap-2 text-white">
                  <Mail size={18} aria-hidden /> {settings.email}
                </a>
              </li>
            )}
            {settings.instagram && (
              <li>
                <a
                  href={`https://instagram.com/${settings.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white"
                >
                  Instagram @{settings.instagram}
                </a>
              </li>
            )}
            {settings.businessHours && (
              <li className="inline-flex items-start gap-2">
                <Clock size={18} aria-hidden className="mt-1 shrink-0" /> {settings.businessHours}
              </li>
            )}
            {settings.addressText && (
              <li className="flex items-start gap-2">
                <MapPin size={18} aria-hidden className="mt-1 shrink-0" /> {settings.addressText}
              </li>
            )}
          </ul>
        </div>
        )}

        <div>
          <h2 className="text-xl text-white">Sua compra</h2>
          <ul className="mt-3 space-y-2">
            <li>
              <Link href="/produtos" className="text-white">
                Todos os produtos
              </Link>
            </li>
            <li>
              <Link href="/carrinho" className="text-white">
                Carrinho
              </Link>
            </li>
            <li>
              <Link href="/meus-pedidos" className="text-white">
                Meus pedidos
              </Link>
            </li>
            <li>
              <Link href="/minha-conta" className="text-white">
                Minha conta
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="container-page space-y-1 py-4 text-sm text-white/70">
          <p>
            © {new Date().getFullYear()} {settings.storeName}. Todos os direitos reservados.
          </p>
          <p>
            Miniaturas e marcas citadas (Hot Wheels, Mini GT, Matchbox e outras) pertencem aos seus respectivos fabricantes. A {settings.storeName} é uma loja
            independente, sem vínculo oficial com eles.
          </p>
        </div>
      </div>
    </footer>
  );
}

export function WhatsAppButton({ settings }: { settings: StoreSettings }) {
  const link = whatsappLink(settings.whatsapp, "Olá! Vim pelo site e gostaria de ajuda.");
  if (!link) return null;
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com a loja pelo WhatsApp"
      className="fixed bottom-4 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#1f8a4c] text-white shadow-lg ring-2 ring-white hover:bg-[#186f3d]"
    >
      <MessageCircle size={28} aria-hidden />
    </a>
  );
}
