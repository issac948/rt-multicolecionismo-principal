import { describe, expect, it } from "vitest";
import { centsToCsv, csvCell, toCsv } from "@/lib/csv";
import { maskCep, maskPhone } from "@/lib/masks";
import { parseViaCepResponse, viaCepUrl } from "@/lib/viacep";

describe("CSV", () => {
  it("escapa aspas, ponto e vírgula e quebras de linha", () => {
    expect(csvCell('Ana "Rei"; Silva')).toBe('"Ana ""Rei""; Silva"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(null)).toBe("");
  });
  it("neutraliza fórmulas em texto livre (=, +, -, @)", () => {
    for (const t of ["=SOMA(A1)", "+55 41", "-1+1", "@cmd"]) expect(csvCell(t).startsWith("'")).toBe(true);
    expect(csvCell(-5)).toBe("-5");
  });
  it("gera BOM, separador ; e valores com vírgula decimal", () => {
    const out = toCsv(["a", "b"], [[1, centsToCsv(12305)]]);
    expect(out).toBe("﻿a;b\r\n1;123,05\r\n");
    expect(centsToCsv(5)).toBe("0,05");
  });
});

describe("máscaras e ViaCEP", () => {
  it("máscara de CEP e telefone enquanto digita", () => {
    expect(maskCep("80010000")).toBe("80010-000");
    expect(maskCep("800")).toBe("800");
    expect(maskPhone("41991419031")).toBe("(41) 99141-9031");
    expect(maskPhone("4133334444")).toBe("(41) 3333-4444");
    expect(maskPhone("+5541991419031")).toBe("(41) 99141-9031");
    expect(maskPhone("")).toBe("");
  });
  it("lê a resposta do ViaCEP e recusa CEP inexistente ou lixo", () => {
    expect(parseViaCepResponse({ logradouro: "Rua XV", bairro: "Centro", localidade: "Curitiba", uf: "PR" })).toEqual({ street: "Rua XV", neighborhood: "Centro", city: "Curitiba", state: "PR" });
    expect(parseViaCepResponse({ erro: true })).toBeNull();
    expect(parseViaCepResponse({ localidade: "X", uf: "ZZ" })).toBeNull();
    expect(parseViaCepResponse(null)).toBeNull();
    expect(viaCepUrl("80010-000")).toBe("https://viacep.com.br/ws/80010000/json/");
    expect(viaCepUrl("123")).toBeNull();
  });
});
