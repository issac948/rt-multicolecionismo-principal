import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const browser = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "loja_session" && browser.token ? { name, value: browser.token } : undefined),
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { GET as templateGet } from "@/app/admin/produtos/importar/modelo/route";
import { analyzeProductCsv, csvTemplate, CSV_COLUMNS, CSV_MAX_ROWS, decodeCsvBytes, parseCsv, type ImportContext } from "@/lib/product-csv";
import { importProductsAction } from "@/server/actions/product-import";
import { createSession } from "@/server/auth/session";
import { categories, products, stockMovements } from "@/server/db/schema";
import { clearAllRateLimits } from "@/server/security/rate-limit";
import { commitProductImport, previewProductImport } from "@/server/services/product-import";
import { createAdmin, createTestProduct, createUser, db, resetDb } from "./helpers";

const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({ categories: [], existingSkus: new Set(), existingNames: new Set(), ...over });
const HEADER = "nome;preco;estoque";

beforeEach(async () => {
  await resetDb();
  browser.token = null;
  clearAllRateLimits();
});

describe("leitura do CSV", () => {
  it("aceita ponto e vírgula, vírgula e tabulação, com BOM e quebras de linha do Windows", () => {
    for (const [sep, name] of [[";", "ponto e vírgula"], [",", "vírgula"], ["\t", "tab"]] as const) {
      const t = parseCsv(`﻿nome${sep}preco${sep}estoque\r\nFusca${sep}"49,90"${sep}2\r\n`);
      expect("error" in t, name).toBe(false);
      if ("error" in t) continue;
      expect(t.delimiter, name).toBe(sep);
      expect(t.header, name).toEqual(["nome", "preco", "estoque"]);
      expect(t.rows[0].cells, name).toEqual(["Fusca", "49,90", "2"]);
    }
  });

  it("respeita aspas: separador, aspas duplas e quebra de linha dentro do texto; ignora linhas em branco", () => {
    const t = parseCsv('nome;preco;estoque;descricao\n\n"Carro; ""especial""";10;1;"linha 1\nlinha 2"\n;;;\n');
    if ("error" in t) throw new Error(t.error);
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].cells).toEqual(['Carro; "especial"', "10", "1", "linha 1\nlinha 2"]);
  });

  it("guarda o número da linha do arquivo (para apontar o erro certo)", () => {
    const t = parseCsv(`${HEADER}\nA;1;1\n\nB;2;2\n`);
    if ("error" in t) throw new Error(t.error);
    expect(t.rows.map((r) => r.line)).toEqual([2, 4]);
  });

  it("recusa aspas sem fechar e arquivo binário; limita a 500 linhas", () => {
    expect(parseCsv('nome;preco\n"aberto;1')).toHaveProperty("error");
    expect(parseCsv("PK\u0003\u0004\u0000\u0000")).toHaveProperty("error");
    expect(parseCsv("")).toHaveProperty("error");
    const big = `${HEADER}\n${Array.from({ length: CSV_MAX_ROWS + 20 }, (_, i) => `P${i};1;1`).join("\n")}`;
    const t = parseCsv(big);
    if ("error" in t) throw new Error(t.error);
    expect(t.rows).toHaveLength(CSV_MAX_ROWS);
    expect(t.truncated).toBe(true);
  });

  it("lê arquivo do Excel em Windows-1252 sem estragar os acentos", () => {
    const latin1 = Buffer.from("nome;preco;estoque\nCarro Pequeno Ação;10;1", "latin1");
    expect(decodeCsvBytes(latin1)).toContain("Ação");
    expect(decodeCsvBytes(Buffer.from("Ação ç é", "utf8"))).toBe("Ação ç é");
  });

  it("o modelo para baixar tem só os títulos (nenhum produto de exemplo)", () => {
    const lines = csvTemplate().replace(/^﻿/, "").trim().split(/\r?\n/);
    expect(lines).toHaveLength(1);
    expect(lines[0].split(";")).toEqual(CSV_COLUMNS.map((c) => c.label));
  });
});

describe("conferência das linhas (mesmas regras do cadastro manual)", () => {
  const run = (csv: string, over?: Partial<ImportContext>) => analyzeProductCsv(csv, ctx(over));

  it("avisa colunas obrigatórias que faltam e planilha só com títulos", () => {
    expect(run("nome;estoque\nA;1").fatal).toMatch(/preco/);
    expect(run("preco;estoque\n1;1").fatal).toMatch(/nome/);
    expect(run(`${HEADER}\n`).fatal).toMatch(/sem nenhum produto/);
  });

  it("reconhece títulos com acento, maiúsculas e variações; informa colunas ignoradas", () => {
    const r = run("Produto;Preço;Quantidade;Cor;Série;Condição\nFusca azul;R$ 1.299,90;3;azul;Retro;Lacrada");
    expect(r.fatal).toBeUndefined();
    expect(r.ignoredColumns).toEqual(["Cor"]);
    expect(r.ok).toBe(1);
    expect(r.inputs[0].input).toMatchObject({ name: "Fusca azul", priceCents: 129990, stock: 3, series: "Retro", condition: "LACRADO", active: false });
  });

  it("converte preços em vários formatos e aponta os inválidos sem chutar", () => {
    const r = run(`${HEADER}\nCarro 1;49,90;1\nCarro 2;49.90;1\nCarro 3;1.234,56;1\nCarro 4;"R$ 10";1\nCarro 5;abc;1\nCarro 6;0;1\nCarro 7;;1`);
    expect(r.rows.map((x) => x.priceCents)).toEqual([4990, 4990, 123456, 1000, null, 0, null]);
    expect(r.rows.map((x) => x.status)).toEqual(["ok", "ok", "ok", "ok", "erro", "erro", "erro"]);
    expect(r.rows[4].errors.join()).toMatch(/preco/);
    expect(r.rows[5].errors.join()).toMatch(/maior que zero/);
    expect(r.rows[6].errors.join()).toMatch(/preço|preco/i);
  });

  it("exige estoque (nunca assume que há produto) e aceita 0", () => {
    const r = run(`${HEADER}\nCarro 1;10;\nCarro 2;10;0\nCarro 3;10;-1\nCarro 4;10;1,5`);
    expect(r.rows.map((x) => x.status)).toEqual(["erro", "ok", "erro", "erro"]);
    expect(r.rows[0].errors.join()).toMatch(/estoque/);
  });

  it("promoção precisa ser menor que o preço; condição só lacrado/solto; ano e medidas inteiros", () => {
    const r = run("nome;preco;estoque;preco_promocional;condicao;ano\nCarro 1;10;1;12;solto;2020\nCarro 2;10;1;8;lacrado;2020\nCarro 3;10;1;;novo;2020\nCarro 4;10;1;;solto;vinte\nCarro 5;10;1;;solto;1700");
    expect(r.rows.map((x) => x.status)).toEqual(["erro", "ok", "erro", "erro", "erro"]);
    expect(r.rows[0].errors.join()).toMatch(/menor que o preço/);
    expect(r.rows[2].errors.join()).toMatch(/condicao/);
    expect(r.rows[3].errors.join()).toMatch(/ano/);
  });

  it("casa a categoria pelo nome (sem diferenciar acento/maiúscula), aceita 'Mãe > Filha' e recusa desconhecida ou ambígua", () => {
    const categories = [
      { id: "11111111-1111-4111-8111-111111111111", name: "Miniaturas de carros", parentId: null },
      { id: "22222222-2222-4222-8222-222222222222", name: "Hot Wheels", parentId: "11111111-1111-4111-8111-111111111111" },
      { id: "33333333-3333-4333-8333-333333333333", name: "Bonecos", parentId: null },
      { id: "44444444-4444-4444-8444-444444444444", name: "Outras", parentId: "11111111-1111-4111-8111-111111111111" },
      { id: "55555555-5555-4555-8555-555555555555", name: "Outras", parentId: "33333333-3333-4333-8333-333333333333" },
    ];
    const r = run(`nome;preco;estoque;categoria\nCarro 1;1;1;hot wheels\nCarro 2;1;1;Miniaturas de Carros > Hot Wheels\nCarro 3;1;1;Inexistente\nCarro 4;1;1;Outras\nCarro 5;1;1;Bonecos > Outras\nCarro 6;1;1;`, { categories });
    expect(r.rows.map((x) => x.status)).toEqual(["ok", "ok", "erro", "erro", "ok", "ok"]);
    expect(r.inputs[0].input.categoryId).toBe("22222222-2222-4222-8222-222222222222");
    expect(r.inputs[2].input.categoryId).toBe("55555555-5555-4555-8555-555555555555");
    expect(r.inputs[3].input.categoryId).toBeNull();
    expect(r.rows[2].errors.join()).toMatch(/não existe/);
    expect(r.rows[3].errors.join()).toMatch(/mais de um lugar/);
  });

  it("recusa SKU e nome repetidos (no banco e dentro da planilha); linha com erro não bloqueia a seguinte", () => {
    const r = run("nome;preco;estoque;sku\nFusca;10;1;AB-1\nfusca ;10;1;AB-2\nOutro;10;1;ab-1\nTerceiro;10;1;NOVO\nQuarto;abc;1;Q-1\nQuarto;10;1;Q-1\nJá Existe;10;1;", {
      existingSkus: new Set(["novo"]),
      existingNames: new Set(["ja existe"]),
    });
    expect(r.rows.map((x) => x.status)).toEqual(["ok", "erro", "erro", "erro", "erro", "ok", "erro"]);
    expect(r.rows[1].errors.join()).toMatch(/nome/);
    expect(r.rows[2].errors.join()).toMatch(/sku/);
    expect(r.rows[3].errors.join()).toMatch(/já está cadastrado/);
    expect(r.rows[6].errors.join()).toMatch(/já existe um produto/);
    expect(r.ok).toBe(2);
    expect(r.failed).toBe(5);
  });

  it("separa tags por | ou vírgula e limita textos longos, apontando a coluna", () => {
    const r = run(`nome;preco;estoque;tags;descricao_curta\nCarro 1;10;1;rara|premium, 1:64;${"x".repeat(201)}\nCarro 2;10;1;a|b;curta`);
    expect(r.rows[0].status).toBe("erro");
    expect(r.rows[0].errors.join()).toMatch(/descricao_curta/);
    expect(r.inputs[0].input.tags).toEqual(["a", "b"]);
  });

  it("linha com colunas a mais é recusada com explicação (ponto e vírgula dentro do texto sem aspas)", () => {
    const r = run(`${HEADER}\nCarro 1;10;1;sobrou`);
    expect(r.rows[0].status).toBe("erro");
    expect(r.rows[0].errors.join()).toMatch(/aspas/);
  });

  it("cabeçalho em planilha de Excel com vírgula decimal e separador ponto e vírgula funciona de ponta a ponta", () => {
    const r = run('Nome;Preço;Estoque;Marca;Escala\n"Fusca 1:64, azul";"89,90";2;hot wheels;1/64');
    expect(r.ok).toBe(1);
    expect(r.inputs[0].input).toMatchObject({ name: "Fusca 1:64, azul", priceCents: 8990, stock: 2, brand: "Hot Wheels", scale: "1:64" });
  });
});

describe("gravação (só depois de confirmar)", () => {
  const sheet = `nome;preco;estoque;sku;marca\nFusca Azul;49,90;3;FUS-1;Hot Wheels\nFusca Azul!;59,90;0;FUS-2;Mini GT\nQuebrado;xx;1;;\nOutro Carro;10;2;;Matchbox\n`;

  it("conferir NÃO grava nada", async () => {
    const preview = await previewProductImport(sheet);
    expect(preview.ok).toBe(3);
    expect(preview.failed).toBe(1);
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("importa só as linhas corretas, como rascunho, com estoque inicial registrado e endereços únicos", async () => {
    const admin = await createAdmin();
    const result = await commitProductImport(sheet, { publish: false, expectedCount: 3 }, admin.id);
    expect(result).toEqual({ created: 3, skipped: 1 });

    const rows = await db.select().from(products).orderBy(products.name);
    expect(rows.map((r) => r.name)).toEqual(["Fusca Azul", "Fusca Azul!", "Outro Carro"]);
    expect(rows.every((r) => r.active === false)).toBe(true);
    expect(new Set(rows.map((r) => r.slug)).size).toBe(3);
    expect(rows.find((r) => r.sku === "FUS-1")).toMatchObject({ priceCents: 4990, stock: 3, brand: "Hot Wheels" });

    const moves = await db.select().from(stockMovements);
    expect(moves).toHaveLength(2); // só quem tem estoque > 0
    expect(moves.every((m) => m.type === "CADASTRO" && m.userId === admin.id && m.quantityChange === m.stockAfter)).toBe(true);
    expect(moves.map((m) => m.quantityChange).sort()).toEqual([2, 3]);
  });

  it("publica só se for pedido", async () => {
    await commitProductImport(`${HEADER}\nPublicado;10;1`, { publish: true, expectedCount: 1 }, null);
    expect((await db.select().from(products))[0].active).toBe(true);
  });

  it("importar a mesma planilha de novo não duplica nada", async () => {
    await commitProductImport(sheet, { publish: false, expectedCount: 3 }, null);
    await expect(commitProductImport(sheet, { publish: false, expectedCount: 0 }, null)).rejects.toThrow(/Nenhuma linha está pronta/);
    expect(await db.select().from(products)).toHaveLength(3);
  });

  it("se a conferência mudou desde a prévia, nada é gravado", async () => {
    await createTestProduct({ name: "Outro Carro" }); // alguém cadastrou um dos itens nesse meio-tempo
    await expect(commitProductImport(sheet, { publish: false, expectedCount: 3 }, null)).rejects.toThrow(/conferência mudou/);
    expect(await db.select().from(products)).toHaveLength(1);
  });

  it("não altera produtos existentes (preço, estoque) mesmo com nome/SKU parecidos", async () => {
    const existing = await createTestProduct({ name: "Fusca Azul", sku: "FUS-1", priceCents: 12345, stock: 7 });
    await commitProductImport(sheet, { publish: false, expectedCount: 2 }, null);
    const [row] = await db.select().from(products).where(eq(products.id, existing.id));
    expect(row).toMatchObject({ priceCents: 12345, stock: 7, sku: "FUS-1" });
    expect(await db.select().from(products)).toHaveLength(3);
  });

  it("importa 500 produtos de uma vez em poucos segundos (uma transação)", async () => {
    const lines = Array.from({ length: 500 }, (_, i) => `Miniatura ${i};${10 + (i % 90)},50;${i % 5};SKU-${i};Hot Wheels`);
    const started = Date.now();
    const result = await commitProductImport(`nome;preco;estoque;sku;marca\n${lines.join("\n")}`, { publish: false, expectedCount: 500 }, null);
    expect(result.created).toBe(500);
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(await db.select().from(products)).toHaveLength(500);
  });

  it("categoria só pode ser uma que existe (nenhuma é criada pela planilha)", async () => {
    const [cat] = await db.insert(categories).values({ name: "Hot Wheels", slug: "hot-wheels", kind: "CARROS" }).returning();
    const r = await commitProductImport("nome;preco;estoque;categoria\nCarro 1;10;1;hot wheels\nCarro 2;10;1;Nova", { publish: false, expectedCount: 1 }, null);
    expect(r.created).toBe(1);
    expect((await db.select().from(products))[0].categoryId).toBe(cat.id);
    expect(await db.select().from(categories)).toHaveLength(1);
  });
});

describe("ação do painel e rota do modelo (permissões e validações)", () => {
  const form = (csv: string | Uint8Array | null, extra: Record<string, string> = {}, name = "produtos.csv") => {
    const fd = new FormData();
    if (csv !== null) fd.set("file", new File([csv as BlobPart], name, { type: "text/csv" }));
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return fd;
  };
  const asAdmin = async () => {
    browser.token = (await createSession((await createAdmin()).id, "ADMIN")).token;
  };

  it("visitante e cliente não conferem nem importam nada", async () => {
    for (const asCustomer of [false, true]) {
      browser.token = asCustomer ? (await createSession((await createUser()).id, "CLIENTE")).token : null;
      const preview = await importProductsAction({}, form(`${HEADER}\nA;1;1`, { intent: "preview" }));
      expect(preview.preview).toBeUndefined();
      expect(preview.message).toBeTruthy();
      const imported = await importProductsAction({}, form(`${HEADER}\nA;1;1`, { intent: "import", confirm: "on", expectedCount: "1" }));
      expect(imported.ok).toBeFalsy();
    }
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("administrador confere (prévia) e depois importa com confirmação", async () => {
    await asAdmin();
    const preview = await importProductsAction({}, form(`${HEADER}\nA Um;10;1\nB Dois;xx;1`, { intent: "preview" }));
    expect(preview.preview).toMatchObject({ ok: 1, failed: 1, fileName: "produtos.csv" });
    expect(JSON.stringify(preview)).not.toContain("inputs");
    expect(await db.select().from(products)).toHaveLength(0);

    const noConfirm = await importProductsAction({}, form(`${HEADER}\nA Um;10;1`, { intent: "import", expectedCount: "1" }));
    expect(noConfirm.errors?.confirm).toBeTruthy();
    expect(await db.select().from(products)).toHaveLength(0);

    const done = await importProductsAction({}, form(`${HEADER}\nA Um;10;1\nB Dois;xx;1`, { intent: "import", confirm: "on", expectedCount: "1" }));
    expect(done.ok).toBe(true);
    expect(done.imported).toEqual({ created: 1, skipped: 1, published: false });
    expect(done.message).toContain("rascunho");
    expect(await db.select().from(products)).toHaveLength(1);
  });

  it("valida o arquivo: ausente, vazio, grande demais, extensão errada, acentos do Excel antigo", async () => {
    await asAdmin();
    expect((await importProductsAction({}, form(null, { intent: "preview" }))).errors?.file).toBeTruthy();
    expect((await importProductsAction({}, form("", { intent: "preview" }))).errors?.file).toBeTruthy();
    expect((await importProductsAction({}, form("x".repeat(1_100_000), { intent: "preview" }))).errors?.file).toMatch(/grande demais/);
    expect((await importProductsAction({}, form(`${HEADER}\nA;1;1`, { intent: "preview" }, "foto.png"))).errors?.file).toMatch(/\.csv/);
    const latin1 = Buffer.from(`${HEADER}\nCarro Ação;10;1`, "latin1");
    const preview = await importProductsAction({}, form(latin1, { intent: "preview" }));
    expect(preview.preview?.rows[0].name).toBe("Carro Ação");
  });

  it("não aceita a contagem confirmada de outra planilha (expectedCount inválido ou diferente)", async () => {
    await asAdmin();
    const csv = `${HEADER}\nA Um;10;1\nB Dois;10;1`;
    expect((await importProductsAction({}, form(csv, { intent: "import", confirm: "on", expectedCount: "0" }))).ok).toBeFalsy();
    expect((await importProductsAction({}, form(csv, { intent: "import", confirm: "on", expectedCount: "5" }))).ok).toBeFalsy();
    expect((await importProductsAction({}, form(csv, { intent: "import", confirm: "on" }))).ok).toBeFalsy();
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("a planilha modelo só é entregue ao administrador", async () => {
    expect((await templateGet()).status).toBe(401);
    browser.token = (await createSession((await createUser()).id, "CLIENTE")).token;
    expect((await templateGet()).status).toBe(403);
    await asAdmin();
    const ok = await templateGet();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("text/csv");
    expect(ok.headers.get("content-disposition")).toContain("modelo-produtos.csv");
    expect((await ok.text()).trim().split(/\r?\n/)).toHaveLength(1);
  });
});
