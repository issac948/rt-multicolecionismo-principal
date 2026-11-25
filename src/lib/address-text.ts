import type { AddressSnapshot } from "@/server/db/schema";

/** Endereço em texto pronto para copiar (etiqueta, SuperFrete, WhatsApp). */
export function addressToText(a: AddressSnapshot): string {
  return [
    a.recipientName,
    `${a.street}, ${a.number}${a.complement ? ` - ${a.complement}` : ""}`,
    a.neighborhood,
    `${a.city}/${a.state}`,
    `CEP ${a.cep}`,
    a.phone ? `Tel.: ${a.phone}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
