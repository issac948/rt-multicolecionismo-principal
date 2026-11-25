/**
 * Resposta do ViaCEP (https://viacep.com.br) → campos do endereço. Consulta feita pelo NAVEGADOR da pessoa:
 * o servidor da loja não depende do ViaCEP, e se ele estiver fora do ar a pessoa preenche à mão.
 */
import { BRAZIL_STATES } from "./constants";

export type CepAddress = { street: string; neighborhood: string; city: string; state: string };

export function parseViaCepResponse(data: unknown): CepAddress | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.erro === true || d.erro === "true") return null;
  const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 150) : "");
  const state = text(d.uf).toUpperCase();
  const city = text(d.localidade);
  if (!city || !(BRAZIL_STATES as readonly string[]).includes(state)) return null;
  return { street: text(d.logradouro), neighborhood: text(d.bairro), city, state };
}

export function viaCepUrl(cep: string): string | null {
  const digits = cep.replace(/\D/g, "");
  return digits.length === 8 ? `https://viacep.com.br/ws/${digits}/json/` : null;
}
