import { whatsappLink } from "@/lib/text";
import type { StoreSettings } from "@/server/services/settings";

/** O dono cadastrou algum canal de contato? Sem isso a loja não promete "formas de contato" (nada é inventado). */
export function hasContactInfo(settings: StoreSettings): boolean {
  return Boolean(
    whatsappLink(settings.whatsapp, "Olá!") ||
      settings.whatsappGroupUrl ||
      settings.phone ||
      settings.email ||
      settings.instagram ||
      settings.businessHours ||
      settings.addressText,
  );
}
