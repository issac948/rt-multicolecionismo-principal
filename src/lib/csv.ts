/**
 * CSV para Excel/Google Planilhas em português: separador ";", UTF-8 com BOM e fim de linha CRLF.
 * Células que começam com = + - @ (ou tab/CR) ganham um apóstrofo na frente: é assim que se evita "injeção de fórmula"
 * quando o nome de um cliente ou uma observação vira fórmula ao abrir a planilha.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Números negativos de verdade (ex.: -10) não são fórmula; texto livre que começa com "-" é.
  if (typeof value !== "number" && FORMULA_START.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** 12345 → "123,45" (decimal com vírgula, como a planilha em português espera). */
export function centsToCsv(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}
