#!/usr/bin/env node
/**
 * Verifica se o repositório está COMPLETO antes de publicar (somente leitura, sem rede):
 *  1. todo import relativo ou "@/..." aponta para um arquivo que existe (com a caixa de letras exata,
 *     como no Linux da Netlify);
 *  2. todo import de pacote está declarado no package.json;
 *  3. quando há .git, nenhum arquivo de código usado pelo projeto está ignorado pelo .gitignore
 *     (arquivo ignorado não vai para o GitHub, e a Netlify não o encontra).
 *
 * Uso:  node scripts/check-repo.mjs [pasta-do-projeto]
 * Sai com código 1 se achar problema.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, sep, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { builtinModules } from "node:module";

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const root = resolve(positional[0] ?? process.cwd());
const CODE_DIRS = ["src", "scripts", "tests", "netlify", "drizzle"];
const CODE_EXT = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const RESOLVE_EXT = [...CODE_EXT, ".json", ".css", ".d.ts"];
const WALK_EXT = [...CODE_EXT, ".css"];
// CSS: @import "pacote/arquivo.css" (as fontes @fontsource entram assim) e @plugin/@config do Tailwind
const CSS_RES = [/@(?:import|plugin|config)\s+(?:url\()?["']([^"')\n]+)["']/g];
const STRICT = process.argv.includes("--estrito");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "coverage", "out", "dist"]);

const problems = [];
// level "erro" derruba o build; "aviso" só informa (ex.: pacote usado que só está instalado por tabela de outro pacote)
const warn = (kind, file, detail, level = "erro") =>
  problems.push({ kind, level, file: relative(root, file).split(sep).join("/"), detail });

function readJson(p) {
  const raw = readFileSync(p, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    // tsconfig pode ter comentários
    return JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"));
  }
}

const pkg = readJson(join(root, "package.json"));
const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
  ...Object.keys(pkg.optionalDependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
]);
const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

// aliases do tsconfig (padrão do projeto: "@/*" -> "src/*")
const aliases = [];
try {
  const ts = readJson(join(root, "tsconfig.json"));
  const base = ts.compilerOptions?.baseUrl ?? ".";
  for (const [alias, targets] of Object.entries(ts.compilerOptions?.paths ?? {})) {
    aliases.push({ prefix: alias.replace(/\*$/, ""), target: resolve(root, base, String(targets[0]).replace(/\*$/, "")) });
  }
} catch {
  /* sem tsconfig legível: usa o padrão abaixo */
}
if (!aliases.some((a) => a.prefix === "@/")) aliases.push({ prefix: "@/", target: resolve(root, "src") + sep });

// ---------- git (opcional) ----------
let gitOk = existsSync(join(root, ".git"));
let ignoredSet = new Set();
if (gitOk) {
  try {
    const out = execFileSync("git", ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    ignoredSet = new Set(out.split("\0").filter(Boolean).map((p) => resolve(root, p)));
  } catch {
    gitOk = false;
  }
}

// ---------- resolução com caixa exata ----------
function existsExact(p) {
  const rel = relative(root, p);
  if (rel.startsWith("..")) return existsSync(p);
  let cur = root;
  for (const seg of rel.split(sep)) {
    let names;
    try {
      names = readdirSync(cur);
    } catch {
      return false;
    }
    if (!names.includes(seg)) return false;
    cur = join(cur, seg);
  }
  return true;
}
function resolveLocal(base) {
  const candidates = [base, ...RESOLVE_EXT.map((e) => base + e), ...RESOLVE_EXT.map((e) => join(base, "index" + e))];
  for (const c of candidates) {
    if (existsExact(c) && statSync(c).isFile()) return c;
  }
  // existe com outra caixa de letras? (funciona no Windows, quebra no Linux)
  const dir = dirname(base);
  if (existsSync(dir)) {
    try {
      const want = basename(base).toLowerCase();
      const hit = readdirSync(dir).find((n) => n.toLowerCase() === want || RESOLVE_EXT.some((e) => n.toLowerCase() === want + e));
      if (hit) return { wrongCase: join(dir, hit) };
    } catch {
      /* ignora */
    }
  }
  return null;
}

// ---------- varredura ----------
function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (WALK_EXT.some((x) => e.name.endsWith(x))) yield full;
  }
}

const IMPORT_RES = [
  // import/export ... from "x" — só no começo da linha, para não pegar texto dentro de strings
  /^[ \t]*(?:import|export)\b[^;'"`]*?\bfrom\s*["']([^"'\n]+)["']/gm,
  // import "x" (efeito colateral)
  /^[ \t]*import\s*["']([^"'\n]+)["']/gm,
  /\bimport\(\s*["']([^"'\n]+)["']\s*\)/g,
  /\brequire\(\s*["']([^"'\n]+)["']\s*\)/g,
];

function pkgName(spec) {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

let files = 0;
const usedLocal = new Set();
for (const d of CODE_DIRS) {
  const dir = join(root, d);
  if (!existsSync(dir)) continue;
  for (const file of walk(dir)) {
    files++;
    const text = readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    const seen = new Set();
    for (const re of file.endsWith(".css") ? CSS_RES : IMPORT_RES) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) seen.add(m[1]);
    }
    for (const spec of seen) {
      if (spec.startsWith("data:") || spec.startsWith("http")) continue;
      let base = null;
      if (spec.startsWith(".")) base = resolve(dirname(file), spec);
      else {
        const al = aliases.find((a) => spec.startsWith(a.prefix));
        if (al) base = resolve(al.target, spec.slice(al.prefix.length));
      }
      if (base) {
        const hit = resolveLocal(base);
        if (!hit) warn("arquivo-ausente", file, `import "${spec}" não encontra nenhum arquivo`);
        else if (typeof hit === "object") warn("caixa-de-letras", file, `import "${spec}" existe só como "${relative(root, hit.wrongCase)}" (no Linux/Netlify quebra)`);
        else usedLocal.add(hit);
      } else if (!builtins.has(spec) && !declared.has(pkgName(spec))) {
        // Next/React geram alguns módulos virtuais; ignora o que o próprio Next resolve
        if (!/^(next|react)(\/|$)/.test(spec)) {
          const name = pkgName(spec);
          const installed = existsSync(join(root, "node_modules", name));
          warn(
            "pacote-nao-declarado",
            file,
            installed
              ? `import "${spec}" não está no package.json (só está instalado por tabela de outro pacote: declare-o)`
              : `import "${spec}" não está no package.json e não está instalado (o build vai falhar)`,
            installed ? "aviso" : "erro",
          );
        }
      }
    }
  }
}

if (gitOk) {
  for (const f of usedLocal) {
    if (ignoredSet.has(f)) warn("ignorado-pelo-git", f, "usado pelo projeto, mas o .gitignore impede de ir para o GitHub");
  }
  // pastas inteiras ignoradas que contêm código
  for (const f of ignoredSet) {
    const rel = relative(root, f).split(sep).join("/");
    if (CODE_DIRS.some((d) => rel.startsWith(d + "/")) && CODE_EXT.some((x) => rel.endsWith(x)) && !usedLocal.has(f)) {
      warn("codigo-ignorado-pelo-git", f, "arquivo de código ignorado pelo .gitignore");
    }
  }
}

// ---------- relatório ----------
const byKind = problems.reduce((acc, p) => ((acc[p.kind] ??= []).push(p), acc), {});
console.log(`Verificados ${files} arquivos de código em ${root}${gitOk ? " (com checagem do .gitignore)" : " (sem pasta .git: checagem do .gitignore não aplicada)"}.`);
const errors = problems.filter((p) => p.level === "erro");
if (problems.length === 0) {
  console.log("OK: nenhum import quebrado, pacote não declarado, arquivo fora do Git ou problema de maiúsculas/minúsculas.");
  process.exit(0);
}
for (const [kind, list] of Object.entries(byKind)) {
  console.log(`\n[${kind}] ${list.length}`);
  for (const p of list.slice(0, 40)) console.log(`  - ${p.level === "aviso" ? "(aviso) " : ""}${p.file}: ${p.detail}`);
  if (list.length > 40) console.log(`  ... e mais ${list.length - 40}`);
}
const fatal = STRICT ? problems.length : errors.length;
if (fatal === 0) {
  console.log(`\nOK, com ${problems.length} aviso(s) (não impedem o build; use --estrito para tratá-los como erro).`);
  process.exit(0);
}
console.log(`\nFALHOU: ${fatal} problema(s) que impedem um build correto.`);
process.exit(1);
