/**
 * Dados de DEMONSTRAÇÃO (fictícios) de miniaturas de carros, bonecos e acessórios de coleção, para ver a loja funcionando.
 *
 *   npm run db:seed
 *
 * Regras de segurança deste script:
 *  - NUNCA apaga nada e não tem opção de "reset". Só ADICIONA o que ainda não existe.
 *  - Os produtos de demonstração têm SKU "DEMO-001", "DEMO-002"... e " (demo)" no nome; se o SKU já existe, é pulado.
 *  - Não mexe em configurações da loja já salvas, nem em contas de usuários que já existem.
 *  - Recusa rodar com NODE_ENV=production (a não ser com --force).
 *  - Para tirar os produtos de demonstração antes de vender de verdade, use o botão
 *    "Remover produtos de demonstração" no Resumo do painel (ele preserva pedidos e histórico).
 */
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { db, pool } from "../src/server/db";
import { categories, products, users } from "../src/server/db/schema";
import { saveProductImage } from "../src/server/storage/images";
import { createAdminUser, findUserByEmail, registerUser } from "../src/server/services/users";
import { ensureSuggestedCategories } from "../src/server/services/categories";
import { createProduct } from "../src/server/services/products";
import { defaultSettings, hasSavedSettings, saveSettings } from "../src/server/services/settings";
import type { ProductInput } from "../src/lib/schemas";

type Kind = "coupe" | "pickup" | "hatch" | "van" | "muscle" | "display" | "box" | "keychain" | "truck" | "figure" | "robot";

/** Ilustração simples (formas geométricas originais, sem cópia de nenhum modelo real) usada como foto de demonstração. */
function illustration(kind: Kind, color: string, bg: string, packaged: boolean): string {
  const wheel = (cx: number, cy: number, r: number) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#101010"/><circle cx="${cx}" cy="${cy}" r="${r * 0.45}" fill="#c9ced6"/>`;
  const glass = "#d9e6ef";
  let art = "";
  switch (kind) {
    case "coupe":
      art = `<path d="M230 330 Q240 260 330 250 L420 215 Q470 205 520 250 L570 262 Q590 300 580 330 Z" fill="${color}"/>
        <path d="M345 252 L425 224 Q458 218 492 250 Z" fill="${glass}"/>${wheel(310, 335, 34)}${wheel(510, 335, 34)}`;
      break;
    case "pickup":
      art = `<path d="M210 330 V265 H380 L410 215 H500 L540 265 H590 V330 Z" fill="${color}"/>
        <path d="M418 224 H492 L522 262 H412 Z" fill="${glass}"/><rect x="215" y="262" width="165" height="16" fill="#101010" opacity="0.18"/>
        ${wheel(300, 335, 38)}${wheel(520, 335, 38)}`;
      break;
    case "hatch":
      art = `<path d="M240 330 V270 Q245 240 300 235 L350 195 H470 Q510 200 540 250 L575 262 V330 Z" fill="${color}"/>
        <path d="M360 205 H465 Q498 210 520 245 H350 Z" fill="${glass}"/>${wheel(320, 335, 33)}${wheel(510, 335, 33)}`;
      break;
    case "van":
      art = `<path d="M220 330 V230 Q220 205 250 205 H470 L560 262 V330 Z" fill="${color}"/>
        <path d="M480 220 L540 262 H478 Z" fill="${glass}"/>${wheel(310, 335, 34)}${wheel(500, 335, 34)}`;
      break;
    case "muscle":
      art = `<path d="M215 330 V275 Q220 250 270 245 L350 215 Q420 195 490 225 L570 250 Q600 262 600 330 Z" fill="${color}"/>
        <path d="M360 225 Q420 208 480 232 L500 250 H340 Z" fill="${glass}"/><rect x="215" y="285" width="385" height="10" fill="#101010" opacity="0.2"/>
        ${wheel(310, 338, 38)}${wheel(520, 338, 38)}`;
      break;
    case "truck":
      art = `<rect x="215" y="215" width="250" height="115" rx="6" fill="${color}"/>
        <path d="M470 330 V250 Q470 235 490 235 H540 L580 285 V330 Z" fill="#2b2f36"/><path d="M492 245 H534 L560 282 H492 Z" fill="${glass}"/>
        ${wheel(290, 338, 30)}${wheel(380, 338, 30)}${wheel(520, 338, 30)}`;
      break;
    case "figure":
      art = `<circle cx="400" cy="150" r="42" fill="${color}"/><rect x="352" y="198" width="96" height="120" rx="14" fill="${color}"/>
        <rect x="300" y="205" width="40" height="105" rx="16" fill="${color}" opacity="0.85"/><rect x="460" y="205" width="40" height="105" rx="16" fill="${color}" opacity="0.85"/>
        <rect x="356" y="318" width="38" height="105" rx="14" fill="#2b2f36"/><rect x="406" y="318" width="38" height="105" rx="14" fill="#2b2f36"/>
        <rect x="372" y="140" width="56" height="10" rx="5" fill="#101010" opacity="0.5"/>`;
      break;
    case "robot":
      art = `<rect x="355" y="110" width="90" height="70" rx="10" fill="${color}"/><circle cx="380" cy="145" r="9" fill="#fff"/><circle cx="420" cy="145" r="9" fill="#fff"/>
        <rect x="335" y="190" width="130" height="130" rx="12" fill="${color}" opacity="0.9"/><rect x="290" y="195" width="35" height="110" rx="10" fill="#2b2f36"/><rect x="475" y="195" width="35" height="110" rx="10" fill="#2b2f36"/>
        <rect x="350" y="326" width="42" height="95" rx="10" fill="#2b2f36"/><rect x="408" y="326" width="42" height="95" rx="10" fill="#2b2f36"/>`;
      break;
    case "display":
      art = `<rect x="215" y="120" width="370" height="230" rx="10" fill="${color}"/>
        ${[0, 1, 2]
          .map((r) => [0, 1, 2, 3].map((c) => `<rect x="${235 + c * 88}" y="${142 + r * 70}" width="72" height="52" rx="6" fill="#fff" opacity="0.85"/>`).join(""))
          .join("")}`;
      break;
    case "box":
      art = `<rect x="235" y="170" width="330" height="170" rx="8" fill="#e7f0f5" stroke="#9fb4c0" stroke-width="6"/>
        <path d="M285 320 Q295 270 350 262 L400 238 Q440 232 480 262 L520 270 Q532 300 525 320 Z" fill="${color}"/>${wheel(330, 322, 20)}${wheel(480, 322, 20)}`;
      break;
    case "keychain":
      art = `<circle cx="400" cy="160" r="40" fill="none" stroke="#9aa3ae" stroke-width="10"/>
        <path d="M400 200 V250" stroke="#9aa3ae" stroke-width="8"/>
        <path d="M310 340 Q318 295 370 288 L405 266 Q440 260 475 288 L505 295 Q515 320 508 340 Z" fill="${color}"/>${wheel(350, 342, 22)}${wheel(465, 342, 22)}`;
      break;
  }
  // Produtos "lacrados": o carrinho dentro de uma cartela com bolha (formas genéricas, sem marca).
  const card = packaged
    ? `<rect x="150" y="60" width="500" height="470" rx="14" fill="${color}" opacity="0.18"/>
       <rect x="150" y="60" width="500" height="64" rx="14" fill="${color}" opacity="0.85"/>
       <rect x="190" y="150" width="420" height="270" rx="30" fill="#ffffff" opacity="0.55" stroke="#9aa3ae" stroke-width="4"/>
       <g transform="translate(0 20)">${art}</g>`
    : `<ellipse cx="400" cy="395" rx="230" ry="16" fill="#101010" opacity="0.12"/>${art}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
    <rect width="800" height="600" fill="${bg}"/>${card}
  </svg>`;
}

async function makeImage(kind: Kind, color: string, bg: string, packaged: boolean) {
  const png = await sharp(Buffer.from(illustration(kind, color, bg, packaged))).png().toBuffer();
  return saveProductImage(png);
}

const randomPassword = () => randomBytes(9).toString("base64url");

type DemoProduct = {
  kind: Kind;
  color: string;
  bg: string;
  packaged?: boolean;
  /** Nome da categoria (criada por ensureSuggestedCategories). */
  category: "Hot Wheels" | "Mini GT" | "Matchbox" | "Outras marcas" | "Outras miniaturas e veículos" | "Bonecos e figuras de ação" | "Personagens e figuras" | "Expositores e acessórios";
  data: Partial<ProductInput> & Pick<ProductInput, "name" | "priceCents" | "stock" | "sku">;
};

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    kind: "coupe", color: "#db2928", bg: "#f3e6e3", packaged: true, category: "Hot Wheels",
    data: {
      sku: "DEMO-001", name: "Cupê Esportivo Vermelho (demo)", priceCents: 1990, stock: 6, featured: true,
      brand: "Hot Wheels", model: "Cupê Esportivo", scale: "1:64", series: "Série de Exemplo", releaseYear: 2023,
      condition: "LACRADO", packagingState: "Cartela com leve marca de transporte",
      shortDescription: "PRODUTO DE DEMONSTRAÇÃO. Miniatura fictícia lacrada, para testar a loja.",
      description: "Produto de demonstração, sem estoque real.\n\nAs informações deste item (marca, série, ano) são exemplos para mostrar como a ficha do colecionável aparece na loja.",
      tags: ["demo", "lacrado"],
    },
  },
  {
    kind: "pickup", color: "#3f7d4e", bg: "#e4ece5", category: "Hot Wheels",
    data: {
      sku: "DEMO-002", name: "Picape Off-Road Verde (demo)", priceCents: 1290, stock: 3,
      brand: "Hot Wheels", model: "Picape Off-Road", scale: "1:64", releaseYear: 2021,
      condition: "SOLTO", conservationNotes: "Sem riscos visíveis na pintura (exemplo).",
      shortDescription: "PRODUTO DE DEMONSTRAÇÃO. Miniatura fictícia solta, com estoque baixo para testar o aviso.",
      description: "Produto de demonstração para testar o aviso de poucas unidades.",
      tags: ["demo", "solto"],
    },
  },
  {
    kind: "hatch", color: "#2d5b88", bg: "#e1e9f1", packaged: true, category: "Mini GT",
    data: {
      sku: "DEMO-003", name: "Hatch Clássico Azul (demo)", priceCents: 8990, salePriceCents: 7990, stock: 4, featured: true,
      brand: "Mini GT", model: "Hatch Clássico", scale: "1:64", releaseYear: 2022, condition: "LACRADO",
      packagingState: "Caixa fechada",
      shortDescription: "PRODUTO DE DEMONSTRAÇÃO. Miniatura fictícia em promoção.",
      description: "Produto de demonstração para testar o preço promocional.",
      promoText: "Promoção de demonstração",
      tags: ["demo", "promoção"],
    },
  },
  {
    kind: "van", color: "#f1b732", bg: "#f6ebd0", packaged: true, category: "Matchbox",
    data: {
      sku: "DEMO-004", name: "Utilitário Retrô Amarelo (demo)", priceCents: 2490, stock: 0,
      brand: "Matchbox", model: "Utilitário Retrô", scale: "1:64", condition: "LACRADO",
      shortDescription: "PRODUTO DE DEMONSTRAÇÃO. Sem estoque, para testar o aviso de indisponibilidade.",
      description: "Produto de demonstração sem estoque.",
      tags: ["demo"],
    },
  },
  {
    kind: "coupe", color: "#222222", bg: "#e6e6e6", category: "Mini GT",
    data: {
      sku: "DEMO-005", name: "Sedan Anos 70 Preto (demo)", priceCents: 5490, stock: 2, featured: true,
      brand: "Mini GT", model: "Sedan Anos 70", scale: "1:64", condition: "SOLTO",
      conservationNotes: "Exemplo de observação sobre o estado de conservação.",
      shortDescription: "PRODUTO DE DEMONSTRAÇÃO. Miniatura fictícia solta.",
      description: "Produto de demonstração.",
      tags: ["demo", "solto"],
    },
  },
  {
    kind: "muscle", color: "#e8801a", bg: "#f6e6d4", packaged: true, category: "Outras marcas",
    data: {
      sku: "DEMO-006", name: "Muscle Car Laranja 1:43 (demo)", priceCents: 14990, stock: 2, featured: true,
      brand: "Greenlight", model: "Muscle Car", scale: "1:43", condition: "LACRADO", packagingState: "Caixa com acrílico",
      shortDescription: "PRODUTO DE DEMONSTRAÇÃO. Miniatura fictícia em escala maior.",
      description: "Produto de demonstração para testar escalas diferentes de 1:64.",
      tags: ["demo", "1:43"],
    },
  },
  {
    kind: "van", color: "#f2f2f2", bg: "#dfe3e8", category: "Outras marcas",
    data: {
      sku: "DEMO-007", name: "Furgão de Entregas Branco (demo)", priceCents: 1590, stock: 10,
      brand: "Majorette", model: "Furgão de Entregas", scale: "1:64", condition: "SOLTO",
      shortDescription: "PRODUTO DE DEMONSTRAÇÃO. Miniatura fictícia solta.",
      description: "Produto de demonstração.",
      tags: ["demo", "solto"],
    },
  },
  {
    kind: "muscle", color: "#7b4fa3", bg: "#ebe4f1", packaged: true, category: "Outras marcas",
    data: {
      sku: "DEMO-008", name: "Esportivo Roxo 1:18 (demo)", priceCents: 24990, stock: 1,
      brand: "Maisto", model: "Esportivo", scale: "1:18", condition: "LACRADO",
      shortDescription: "PRODUTO DE DEMONSTRAÇÃO. Miniatura fictícia em escala grande, última unidade.",
      description: "Produto de demonstração.",
      tags: ["demo", "1:18"],
    },
  },
  {
    kind: "display", color: "#5a5a5a", bg: "#eceae4", category: "Expositores e acessórios",
    data: {
      sku: "DEMO-009", name: "Expositor de Parede para 12 Miniaturas (demo)", priceCents: 6990, stock: 5,
      shortDescription: "PRODUTO DE DEMONSTRAÇÃO. Item que não é miniatura: sem marca, escala ou condição.",
      description: "Produto de demonstração, para mostrar que a loja também vende outros tipos de produto.",
      features: [{ label: "Capacidade", value: "12 miniaturas (exemplo)" }],
      tags: ["demo", "expositor"],
    },
  },
  {
    kind: "box", color: "#db2928", bg: "#e9eef1", category: "Expositores e acessórios",
    data: {
      sku: "DEMO-010", name: "Caixa Protetora Acrílica (demo)", priceCents: 1490, salePriceCents: 1190, stock: 25,
      shortDescription: "PRODUTO DE DEMONSTRAÇÃO. Acessório com preço promocional.",
      description: "Produto de demonstração.",
      tags: ["demo", "acessório"],
    },
  },
  {
    kind: "keychain", color: "#db2928", bg: "#f2e6e0", category: "Expositores e acessórios",
    data: {
      sku: "DEMO-011", name: "Chaveiro de Carrinho (demo)", priceCents: 1990, stock: 15,
      shortDescription: "PRODUTO DE DEMONSTRAÇÃO. Outro tipo de produto, sem campos de colecionável.",
      description: "Produto de demonstração.",
      tags: ["demo", "chaveiro"],
    },
  },
  {
    kind: "coupe", color: "#7d8590", bg: "#e8eaed", category: "Hot Wheels",
    data: {
      sku: "DEMO-012", name: "Miniatura em Rascunho (demo)", priceCents: 3990, stock: 4, active: false,
      brand: "Hot Wheels", scale: "1:64", condition: "LACRADO",
      shortDescription: "PRODUTO DE DEMONSTRAÇÃO NÃO PUBLICADO: não aparece na loja.",
      description: "Rascunho de demonstração, desativado.",
      tags: ["demo"],
    },
  },
  {
    kind: "figure", color: "#7b4fa3", bg: "#ebe4f1", packaged: true, category: "Bonecos e figuras de ação",
    data: {
      sku: "DEMO-013", name: "Figura de Ação Articulada (demo)", priceCents: 18990, stock: 3, featured: true,
      brand: "Fabricante de Exemplo", model: "Guerreiro Genérico", scale: "1:12", series: "Linha de Exemplo", condition: "LACRADO", packagingState: "Caixa fechada, sem avarias aparentes",
      shortDescription: "PRODUTO DE DEMONSTRAÇÃO. Figura de ação fictícia lacrada, para testar a área de bonecos.",
      description: "Produto de demonstração, sem estoque real. Os dados (fabricante, linha, escala) são exemplos para mostrar a ficha de um boneco.",
      tags: ["demo", "boneco"],
    },
  },
  {
    kind: "figure", color: "#2d5b88", bg: "#e1e9f1", category: "Bonecos e figuras de ação",
    data: {
      sku: "DEMO-014", name: "Boneco Colecionável Solto (demo)", priceCents: 6990, stock: 2,
      brand: "Fabricante de Exemplo", model: "Aventureiro Genérico", scale: "15 cm", condition: "SOLTO", conservationNotes: "Exemplo: articulações firmes, sem marcas de uso.",
      shortDescription: "PRODUTO DE DEMONSTRAÇÃO. Boneco fictício solto.",
      description: "Produto de demonstração.",
      tags: ["demo", "boneco"],
    },
  },
  {
    kind: "robot", color: "#db2928", bg: "#f3e6e3", packaged: true, category: "Personagens e figuras",
    data: {
      sku: "DEMO-015", name: "Figura de Personagem Robô (demo)", priceCents: 12990, stock: 4,
      brand: "Fabricante de Exemplo", model: "Robô Genérico", series: "Linha de Exemplo", condition: "LACRADO",
      shortDescription: "PRODUTO DE DEMONSTRAÇÃO. Figura de personagem fictícia.",
      description: "Produto de demonstração.",
      tags: ["demo", "figura"],
    },
  },
  {
    kind: "truck", color: "#e8801a", bg: "#f6e6d4", category: "Outras miniaturas e veículos",
    data: {
      sku: "DEMO-016", name: "Caminhão de Carga em Miniatura (demo)", priceCents: 3490, stock: 5,
      brand: "Marca de Exemplo", model: "Caminhão Genérico", scale: "1:64", condition: "SOLTO",
      shortDescription: "PRODUTO DE DEMONSTRAÇÃO. Outro tipo de veículo em miniatura.",
      description: "Produto de demonstração.",
      tags: ["demo", "caminhão"],
    },
  },
];

const BASE_INPUT: Omit<ProductInput, "name" | "priceCents" | "stock"> = {
  sku: null, shortDescription: "", description: "", salePriceCents: null, lowStockThreshold: 3, active: true, featured: false,
  categoryId: null, features: [], tags: [], promoText: null, seoTitle: null, seoDescription: null,
  weightGrams: null, lengthCm: null, widthCm: null, heightCm: null, imageIds: [],
  brand: null, model: null, scale: null, series: null, releaseYear: null, condition: null, packagingState: null, conservationNotes: null,
};

async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    console.error("Recusado: o seed cria dados FICTÍCIOS e não deve rodar em produção (use --force só se tiver certeza).");
    process.exit(1);
  }
  if (process.argv.includes("--reset")) {
    console.error("A opção --reset foi removida: este script nunca apaga dados. Para tirar os produtos de demonstração, use o painel (Resumo).");
    process.exit(1);
  }

  /* Configurações: só se a loja ainda não tiver nenhuma configuração salva. */
  if (!(await hasSavedSettings())) {
    await saveSettings(defaultSettings());
    console.log("Configurações iniciais da loja criadas (WhatsApp, telefone e grupo do dono já preenchidos; frete, endereço e e-mail: preencha em Configurações).");
  }

  /* Estrutura de categorias sugerida (só cria o que ainda não existe, pelo nome; nunca altera categorias existentes). */
  const { created: createdCategories } = await ensureSuggestedCategories();
  if (createdCategories > 0) console.log(`${createdCategories} categorias criadas (Miniaturas de carros, Bonecos e colecionáveis...).`);
  const categoryIdByName = new Map<string, string>();
  for (const row of await db.select().from(categories)) if (row.parentId || !categoryIdByName.has(row.name)) categoryIdByName.set(row.name, row.id);

  /* Produtos de demonstração (pula os SKUs que já existem). */
  let created = 0;
  for (const item of DEMO_PRODUCTS) {
    const [exists] = await db.select({ id: products.id }).from(products).where(eq(products.sku, String(item.data.sku))).limit(1);
    if (exists) continue;
    const image = await makeImage(item.kind, item.color, item.bg, Boolean(item.packaged));
    await createProduct({ ...BASE_INPUT, ...item.data, categoryId: categoryIdByName.get(item.category) ?? null, imageIds: [image.id] }, null);
    created++;
  }
  console.log(
    created > 0
      ? `${created} produtos de demonstração criados (um em rascunho, um sem estoque, alguns com estoque baixo, alguns em promoção).`
      : "Os produtos de demonstração já existem. Nada foi criado.",
  );

  /* Contas de teste: só se ainda não existir NENHUM administrador (nunca altera contas existentes). */
  const [{ admins }] = (await db.execute(sql`SELECT count(*)::int AS admins FROM ${users} WHERE role = 'ADMIN'`)).rows as Array<{ admins: number }>;
  if (admins === 0) {
    const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@loja.local";
    const adminPassword = (process.env.SEED_ADMIN_PASSWORD || randomPassword()).padEnd(10, "x");
    const customerEmail = process.env.SEED_CUSTOMER_EMAIL || "cliente@loja.local";
    const customerPassword = process.env.SEED_CUSTOMER_PASSWORD || randomPassword();
    await createAdminUser({ email: adminEmail, name: "Administrador", password: adminPassword });
    let customerLine = `Cliente:       ${customerEmail} (já existia; senha não alterada)`;
    if (!(await findUserByEmail(customerEmail))) {
      await registerUser({ name: "Cliente de Teste", email: customerEmail, phone: null, password: customerPassword });
      customerLine = `Cliente:       ${customerEmail}  senha: ${customerPassword}`;
    }
    console.log("\n=== Contas de teste (anote agora: as senhas não são mostradas de novo) ===");
    console.log(`Administrador: ${adminEmail}  senha: ${adminPassword}`);
    console.log(customerLine + "\n");
  } else {
    console.log("Já existe um administrador: nenhuma conta foi criada ou alterada.");
  }
}

main()
  .catch((error) => {
    console.error("Falha no seed:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
