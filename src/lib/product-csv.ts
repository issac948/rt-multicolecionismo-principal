import { parseMoneyToCents } from "./money";
import { productInputSchema, type ProductInput } from "./schemas";
import { normalizeForSearch, stripAccents } from "./text";

/**
 * Importação de produtos por planilha (CSV). Tudo aqui é puro (sem banco): lê o texto, confere cada linha com as MESMAS
 * regras do cadastro manual e devolve, linha a linha, o que está certo e o que precisa ser corrigido.
 * Nada é gravado aqui; quem grava é `server/services/product-import.ts`, depois da confirmação do dono.
 */

export const CSV_MAX_BYTES = 1_000_000;
export const CSV_MAX_ROWS = 500;

/* ------------------------------ Leitura do CSV ------------------------------ */

/**
 * Lê os bytes do arquivo como texto. O Excel em português costuma salvar "CSV" em Windows-1252 (ANSI), não em UTF-8:
 * se os bytes não forem UTF-8 válido, lê como Windows-1252 para os acentos (ç, ã, é) não virarem "�".
 */
export function decodeCsvBytes(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(view);
  } catch {
    return new TextDecoder("windows-1252").decode(view);
  }
}

export type CsvTable = { delimiter: ";" | "," | "\t"; header: string[]; rows: Array<{ line: number; cells: string[] }>; truncated: boolean };

function detectDelimiter(firstLine: string): ";" | "," | "\t" {
  const count = (ch: string) => {
    let n = 0;
    let quoted = false;
    for (const c of firstLine) {
      if (c === '"') quoted = !quoted;
      else if (c === ch && !quoted) n++;
    }
    return n;
  };
  const candidates: Array<[";" | "," | "\t", number]> = [
    [";", count(";")],
    [",", count(",")],
    ["\t", count("\t")],
  ];
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0][1] > 0 ? candidates[0][0] : ";";
}

/** Lê CSV com aspas ("" dentro de aspas = uma aspa), quebras de linha dentro de aspas, BOM e CRLF. */
export function parseCsv(text: string): CsvTable | { error: string } {
  const clean = text.replace(/^﻿/, "");
  if (clean.includes("\u0000")) return { error: "Este arquivo não parece ser uma planilha CSV de texto. Exporte como CSV (separado por ponto e vírgula ou vírgula)." };
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);

  const records: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  let touched = false;

  const endField = () => {
    cells.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    if (cells.some((c) => c.trim() !== "")) records.push({ line: recordLine, cells });
    cells = [];
    touched = false;
  };

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else {
        if (c === "\n") line++;
        field += c;
      }
      continue;
    }
    if (c === '"' && field === "") {
      quoted = true;
      touched = true;
    } else if (c === delimiter) {
      endField();
      touched = true;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      if (touched || field !== "" || cells.length > 0) endRecord();
      line++;
      recordLine = line;
    } else {
      field += c;
      touched = true;
    }
  }
  if (quoted) return { error: "Há um texto entre aspas que nunca é fechado. Confira as aspas (\") da planilha." };
  if (touched || field !== "" || cells.length > 0) endRecord();

  if (records.length === 0) return { error: "A planilha está vazia." };
  const [head, ...body] = records;
  return {
    delimiter,
    header: head.cells.map((h) => h.trim()),
    rows: body.slice(0, CSV_MAX_ROWS),
    truncated: body.length > CSV_MAX_ROWS,
  };
}

/* ------------------------------ Colunas ------------------------------ */

export type ColumnKey =
  | "name"
  | "price"
  | "stock"
  | "sku"
  | "category"
  | "brand"
  | "model"
  | "scale"
  | "series"
  | "year"
  | "condition"
  | "salePrice"
  | "shortDescription"
  | "description"
  | "tags"
  | "lowStock"
  | "weight"
  | "length"
  | "width"
  | "height";

export const CSV_COLUMNS: Array<{ key: ColumnKey; label: string; required: boolean; aliases: string[]; help: string }> = [
  { key: "name", label: "nome", required: true, aliases: ["nome", "produto", "titulo", "name"], help: "Nome do produto (mínimo 3 letras)." },
  { key: "price", label: "preco", required: true, aliases: ["preco", "preco_normal", "valor", "price"], help: "Preço em reais, por exemplo 49,90." },
  { key: "stock", label: "estoque", required: true, aliases: ["estoque", "quantidade", "qtd", "stock"], help: "Quantidade em estoque (use 0 se não tiver)." },
  { key: "sku", label: "sku", required: false, aliases: ["sku", "codigo", "cod"], help: "Código próprio. Não pode repetir." },
  { key: "category", label: "categoria", required: false, aliases: ["categoria", "category"], help: "Nome de uma categoria que já existe (ou Mãe > Filha)." },
  { key: "brand", label: "marca", required: false, aliases: ["marca", "brand"], help: "Hot Wheels, Mini GT, Matchbox..." },
  { key: "model", label: "modelo", required: false, aliases: ["modelo", "model"], help: "Modelo do carro ou personagem." },
  { key: "scale", label: "escala", required: false, aliases: ["escala", "scale"], help: "Por exemplo 1:64." },
  { key: "series", label: "serie", required: false, aliases: ["serie", "colecao", "series"], help: "Série ou coleção." },
  { key: "year", label: "ano", required: false, aliases: ["ano", "ano_lancamento", "year"], help: "Ano de lançamento." },
  { key: "condition", label: "condicao", required: false, aliases: ["condicao", "estado", "condition"], help: "lacrado ou solto." },
  { key: "salePrice", label: "preco_promocional", required: false, aliases: ["preco_promocional", "promocao", "preco_promo", "sale_price"], help: "Só se estiver em promoção; menor que o preço." },
  { key: "shortDescription", label: "descricao_curta", required: false, aliases: ["descricao_curta", "resumo"], help: "Até 200 letras." },
  { key: "description", label: "descricao", required: false, aliases: ["descricao", "description"], help: "Texto completo." },
  { key: "tags", label: "tags", required: false, aliases: ["tags", "palavras_chave"], help: "Palavras separadas por | ." },
  { key: "lowStock", label: "estoque_minimo", required: false, aliases: ["estoque_minimo", "estoque_baixo", "minimo"], help: "Aviso de estoque baixo (padrão 3)." },
  { key: "weight", label: "peso_g", required: false, aliases: ["peso_g", "peso", "peso_gramas"], help: "Peso em gramas (usado no frete)." },
  { key: "length", label: "comprimento_cm", required: false, aliases: ["comprimento_cm", "comprimento"], help: "Medida da embalagem em cm." },
  { key: "width", label: "largura_cm", required: false, aliases: ["largura_cm", "largura"], help: "Medida da embalagem em cm." },
  { key: "height", label: "altura_cm", required: false, aliases: ["altura_cm", "altura"], help: "Medida da embalagem em cm." },
];

const normalizeHeader = (h: string) =>
  stripAccents(h)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** Cabeçalho do modelo para baixar: só os nomes das colunas, nenhum produto de exemplo. */
export function csvTemplate(): string {
  return `﻿${CSV_COLUMNS.map((c) => c.label).join(";")}\r\n`;
}

/* ------------------------------ Análise das linhas ------------------------------ */

export type CategoryRef = { id: string; name: string; parentId: string | null };

export type ImportContext = {
  categories: CategoryRef[];
  /** SKUs que já existem (minúsculos). */
  existingSkus: Set<string>;
  /** Nomes que já existem, normalizados (sem acento, minúsculos). */
  existingNames: Set<string>;
};

export type ImportRow = {
  line: number;
  status: "ok" | "erro";
  errors: string[];
  name: string;
  priceCents: number | null;
  stock: number | null;
  categoryLabel: string;
  sku: string | null;
};

export type ImportAnalysis = {
  fatal?: string;
  delimiter?: ";" | "," | "\t";
  recognizedColumns: string[];
  ignoredColumns: string[];
  rows: ImportRow[];
  /** Entradas prontas para gravar, na mesma ordem das linhas "ok". */
  inputs: Array<{ line: number; input: ProductInput }>;
  ok: number;
  failed: number;
  truncated: boolean;
};

const FIELD_LABEL: Record<string, string> = {
  name: "nome",
  priceCents: "preco",
  salePriceCents: "preco_promocional",
  stock: "estoque",
  lowStockThreshold: "estoque_minimo",
  sku: "sku",
  shortDescription: "descricao_curta",
  description: "descricao",
  tags: "tags",
  brand: "marca",
  model: "modelo",
  scale: "escala",
  series: "serie",
  releaseYear: "ano",
  condition: "condicao",
  weightGrams: "peso_g",
  lengthCm: "comprimento_cm",
  widthCm: "largura_cm",
  heightCm: "altura_cm",
  categoryId: "categoria",
};

function parseWholeNumber(raw: string): number | "invalido" | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  if (!/^\d{1,9}$/.test(t)) return "invalido";
  return Number(t);
}

function resolveCategory(raw: string, categories: CategoryRef[]): { id: string | null; error?: string } {
  const wanted = raw.trim();
  if (!wanted) return { id: null };
  const norm = (s: string) => normalizeForSearch(s).replace(/\s+/g, " ").trim();
  const parts = wanted.split(">").map((p) => p.trim()).filter(Boolean);
  const byId = new Map(categories.map((c) => [c.id, c]));

  const matches =
    parts.length >= 2
      ? categories.filter((c) => {
          if (norm(c.name) !== norm(parts[parts.length - 1])) return false;
          const parent = c.parentId ? byId.get(c.parentId) : undefined;
          return parent !== undefined && norm(parent.name) === norm(parts[parts.length - 2]);
        })
      : categories.filter((c) => norm(c.name) === norm(parts[0] ?? ""));

  if (matches.length === 1) return { id: matches[0].id };
  if (matches.length === 0) return { id: null, error: `categoria "${wanted}" não existe. Crie em Categorias ou corrija o nome.` };
  return { id: null, error: `categoria "${wanted}" aparece em mais de um lugar. Use "Categoria mãe > ${parts[parts.length - 1]}".` };
}

function parseCondition(raw: string): { value: "LACRADO" | "SOLTO" | null; error?: string } {
  const t = normalizeForSearch(raw).trim();
  if (!t) return { value: null };
  if (["lacrado", "lacrada", "novo lacrado", "sealed", "na caixa", "blister"].includes(t)) return { value: "LACRADO" };
  if (["solto", "solta", "loose", "aberto", "aberta", "sem embalagem"].includes(t)) return { value: "SOLTO" };
  return { value: null, error: 'condicao: escreva "lacrado" ou "solto".' };
}

/** Confere o CSV inteiro. Não grava nada e nunca lança erro por causa do conteúdo da planilha. */
export function analyzeProductCsv(text: string, ctx: ImportContext): ImportAnalysis {
  const empty = (fatal: string): ImportAnalysis => ({ fatal, recognizedColumns: [], ignoredColumns: [], rows: [], inputs: [], ok: 0, failed: 0, truncated: false });

  const table = parseCsv(text);
  if ("error" in table) return empty(table.error);

  // Descobre qual coluna é qual (sem diferenciar maiúsculas, acentos ou espaços).
  const columnIndex = new Map<ColumnKey, number>();
  const recognized: string[] = [];
  const ignored: string[] = [];
  table.header.forEach((h, index) => {
    const norm = normalizeHeader(h);
    const col = CSV_COLUMNS.find((c) => c.aliases.includes(norm));
    if (col && !columnIndex.has(col.key)) {
      columnIndex.set(col.key, index);
      recognized.push(col.label);
    } else if (h.trim()) ignored.push(h.trim());
  });
  const missing = CSV_COLUMNS.filter((c) => c.required && !columnIndex.has(c.key)).map((c) => c.label);
  if (missing.length > 0) {
    return { ...empty(`Faltam colunas obrigatórias na primeira linha: ${missing.join(", ")}. Baixe o modelo de planilha para ver os nomes certos.`), delimiter: table.delimiter, recognizedColumns: recognized, ignoredColumns: ignored };
  }
  if (table.rows.length === 0) return { ...empty("A planilha só tem a linha de títulos, sem nenhum produto."), delimiter: table.delimiter, recognizedColumns: recognized, ignoredColumns: ignored };

  const get = (cells: string[], key: ColumnKey) => {
    const i = columnIndex.get(key);
    return i === undefined ? "" : (cells[i] ?? "").trim();
  };

  const seenSkus = new Set<string>();
  const seenNames = new Set<string>();
  const rows: ImportRow[] = [];
  const inputs: ImportAnalysis["inputs"] = [];

  for (const { line, cells } of table.rows) {
    const errors: string[] = [];
    if (cells.length > table.header.length) errors.push("a linha tem mais colunas que o título. Se o texto tem ponto e vírgula ou vírgula, coloque o texto entre aspas.");

    const name = get(cells, "name");
    const priceRaw = get(cells, "price");
    const priceCents = priceRaw ? parseMoneyToCents(priceRaw) : null;
    if (priceRaw && priceCents === null) errors.push(`preco: "${priceRaw}" não é um valor válido (exemplo: 49,90).`);

    const saleRaw = get(cells, "salePrice");
    const salePriceCents = saleRaw ? parseMoneyToCents(saleRaw) : null;
    if (saleRaw && salePriceCents === null) errors.push(`preco_promocional: "${saleRaw}" não é um valor válido.`);

    const numbers: Partial<Record<ColumnKey, number | undefined>> = {};
    for (const key of ["stock", "year", "lowStock", "weight", "length", "width", "height"] as const) {
      const raw = get(cells, key);
      const n = parseWholeNumber(raw);
      if (n === "invalido") errors.push(`${CSV_COLUMNS.find((c) => c.key === key)?.label}: "${raw}" precisa ser um número inteiro.`);
      else numbers[key] = n;
    }

    // O estoque nunca é "adivinhado": célula vazia é erro (o cadastro manual assumiria 0, mas uma planilha esquecida não pode virar "sem estoque" em silêncio).
    if (numbers.stock === undefined && !errors.some((e) => e.startsWith("estoque:"))) errors.push("estoque: informe a quantidade (use 0 se não tiver).");

    const category = resolveCategory(get(cells, "category"), ctx.categories);
    if (category.error) errors.push(category.error);
    const condition = parseCondition(get(cells, "condition"));
    if (condition.error) errors.push(condition.error);

    const sku = get(cells, "sku") || null;
    if (sku) {
      const key = sku.toLowerCase();
      if (ctx.existingSkus.has(key)) errors.push(`sku: "${sku}" já está cadastrado em outro produto.`);
      else if (seenSkus.has(key)) errors.push(`sku: "${sku}" aparece mais de uma vez na planilha.`);
    }
    const nameKey = normalizeForSearch(name).replace(/\s+/g, " ").trim();
    if (nameKey) {
      if (ctx.existingNames.has(nameKey)) errors.push("nome: já existe um produto com este nome. Para repor, ajuste o estoque do produto; para outro modelo, mude o nome.");
      else if (seenNames.has(nameKey)) errors.push("nome: este nome aparece mais de uma vez na planilha.");
    }

    const parsed = productInputSchema.safeParse({
      name,
      sku,
      shortDescription: get(cells, "shortDescription"),
      description: get(cells, "description"),
      priceCents: priceCents ?? undefined,
      salePriceCents,
      stock: numbers.stock,
      lowStockThreshold: numbers.lowStock,
      active: false,
      featured: false,
      categoryId: category.id,
      features: [],
      tags: get(cells, "tags")
        .split(/[|,]/)
        .map((t) => t.trim())
        .filter(Boolean),
      weightGrams: numbers.weight,
      lengthCm: numbers.length,
      widthCm: numbers.width,
      heightCm: numbers.height,
      imageIds: [],
      brand: get(cells, "brand"),
      model: get(cells, "model"),
      scale: get(cells, "scale"),
      series: get(cells, "series"),
      releaseYear: numbers.year,
      condition: condition.value,
    });
    if (!parsed.success) {
      const seen = new Set(errors.map((e) => e.split(":")[0]));
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "");
        const label = FIELD_LABEL[field] ?? field;
        // O que já foi explicado acima (preço ilegível, categoria desconhecida...) não é repetido.
        if (seen.has(label) || (field === "priceCents" && priceRaw && priceCents === null) || (field === "salePriceCents" && saleRaw && salePriceCents === null)) continue;
        seen.add(label);
        errors.push(`${label}: ${issue.message}`);
      }
    }

    // Só "reserva" nome e SKU depois de a linha ser aceita: linha com erro não bloqueia as seguintes.
    const ok = errors.length === 0 && parsed.success;
    if (ok) {
      if (sku) seenSkus.add(sku.toLowerCase());
      if (nameKey) seenNames.add(nameKey);
      inputs.push({ line, input: parsed.data });
    }
    rows.push({
      line,
      status: ok ? "ok" : "erro",
      errors,
      name,
      priceCents,
      stock: numbers.stock ?? null,
      categoryLabel: get(cells, "category"),
      sku,
    });
  }

  const okCount = rows.filter((r) => r.status === "ok").length;
  return {
    delimiter: table.delimiter,
    recognizedColumns: recognized,
    ignoredColumns: ignored,
    rows,
    inputs,
    ok: okCount,
    failed: rows.length - okCount,
    truncated: table.truncated,
  };
}
