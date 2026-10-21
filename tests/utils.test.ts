import { describe, expect, it } from "vitest";
import { discountPercent, effectivePriceCents, formatBRL, parseMoneyToCents } from "@/lib/money";
import { escapeLike, normalizeForSearch, paymentMethodLabel, slugify, whatsappLink } from "@/lib/text";
import { productInputSchema } from "@/lib/schemas";
import { parseProductForm } from "@/lib/forms";

describe("dinheiro", () => {
  it("converte o que a pessoa digita em centavos, sem erro de ponto flutuante", () => {
    expect(parseMoneyToCents("899")).toBe(89900);
    expect(parseMoneyToCents("899,90")).toBe(89990);
    expect(parseMoneyToCents("1.299,90")).toBe(129990);
    expect(parseMoneyToCents("R$ 1299,90")).toBe(129990);
    expect(parseMoneyToCents("1299.90")).toBe(129990);
    expect(parseMoneyToCents("1.299")).toBe(129900);
    expect(parseMoneyToCents("0,1")).toBe(10);
    // 19,99 * 100 em ponto flutuante dá 1998.9999999999998: aqui tem que ser exato.
    expect(parseMoneyToCents("19,99")).toBe(1999);
  });

  it("rejeita valores inválidos", () => {
    for (const bad of ["", "abc", "12,345", "-5", "1,2,3", "9999999999999"]) {
      expect(parseMoneyToCents(bad), bad).toBeNull();
    }
  });

  it("formata em reais", () => {
    expect(formatBRL(89990).replace(/\s/g, " ")).toBe("R$ 899,90");
  });

  it("usa o preço promocional somente quando é menor que o normal", () => {
    expect(effectivePriceCents({ priceCents: 10000, salePriceCents: 8000 })).toBe(8000);
    expect(effectivePriceCents({ priceCents: 10000, salePriceCents: null })).toBe(10000);
    expect(effectivePriceCents({ priceCents: 10000, salePriceCents: 12000 })).toBe(10000);
    expect(discountPercent({ priceCents: 10000, salePriceCents: 7500 })).toBe(25);
  });
});

describe("texto", () => {
  it("traduz a forma de pagamento do Mercado Pago e mantém códigos desconhecidos", () => {
    expect(paymentMethodLabel("credit_card")).toBe("Cartão de crédito");
    expect(paymentMethodLabel("bank_transfer")).toBe("Pix");
    expect(paymentMethodLabel("ticket")).toBe("Boleto");
    expect(paymentMethodLabel("outra_coisa")).toBe("outra_coisa");
    expect(paymentMethodLabel(null)).toBe("—");
  });

  it("gera slugs sem acento nem símbolos", () => {
    expect(slugify("Cupê Clássico 1:64 Edição Especial!")).toBe("cupe-classico-1-64-edicao-especial");
    expect(slugify("   ")).toBe("item");
  });

  it("normaliza para busca e escapa curingas do LIKE", () => {
    expect(normalizeForSearch("  Carrinho   Vermelho ÁÉ ")).toBe("carrinho vermelho ae");
    expect(escapeLike("100%_\\")).toBe("100\\%\\_\\\\");
  });

  it("monta o link do WhatsApp assumindo Brasil", () => {
    expect(whatsappLink("(11) 98888-7777")).toBe("https://wa.me/5511988887777");
    expect(whatsappLink("5511988887777", "Olá")).toBe("https://wa.me/5511988887777?text=Ol%C3%A1");
    expect(whatsappLink("")).toBeNull();
  });
});

describe("validação do produto", () => {
  const base = {
    name: "Miniatura Teste",
    priceCents: 10000,
  };

  it("aceita um produto mínimo e aplica padrões", () => {
    const parsed = productInputSchema.parse(base);
    expect(parsed.stock).toBe(0);
    expect(parsed.active).toBe(false);
    expect(parsed.tags).toEqual([]);
  });

  it("recusa promoção maior ou igual ao preço normal", () => {
    expect(productInputSchema.safeParse({ ...base, salePriceCents: 10000 }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...base, salePriceCents: 12000 }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...base, salePriceCents: 9000 }).success).toBe(true);
  });

  it("recusa preço zero, estoque negativo e estoque fracionado", () => {
    expect(productInputSchema.safeParse({ ...base, priceCents: 0 }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...base, stock: -1 }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...base, stock: 1.5 }).success).toBe(false);
  });

  it("converte o formulário do painel (em reais) para centavos", () => {
    const fd = new FormData();
    fd.set("name", "Miniatura Vermelha");
    fd.set("price", "899,90");
    fd.set("salePrice", "799,90");
    fd.set("stock", "5");
    fd.set("active", "on");
    fd.set("tags", "esportivo, vermelho ,  ");
    fd.append("featureLabel", "Acompanha");
    fd.append("featureValue", "protetor de acrílico");
    fd.append("featureLabel", "");
    fd.append("featureValue", "");

    const parsed = parseProductForm(fd);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.priceCents).toBe(89990);
      expect(parsed.data.salePriceCents).toBe(79990);
      expect(parsed.data.stock).toBe(5);
      expect(parsed.data.active).toBe(true);
      expect(parsed.data.tags).toEqual(["esportivo", "vermelho"]);
      expect(parsed.data.features).toEqual([{ label: "Acompanha", value: "protetor de acrílico" }]);
    }
  });

  it("devolve erros por campo quando o formulário é inválido", () => {
    const fd = new FormData();
    fd.set("name", "ab");
    fd.set("price", "abc");
    const parsed = parseProductForm(fd);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors.name).toBeTruthy();
      expect(parsed.errors.priceCents).toBeTruthy();
    }
  });
});
