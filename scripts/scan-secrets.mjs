#!/usr/bin/env node
/**
 * Procura segredos (senhas, tokens, chaves) nos arquivos do projeto e, com --historico, em TODO o histórico do Git.
 * Nunca imprime o segredo inteiro: só o nome da regra, o arquivo, a linha, o commit e o começo mascarado do valor.
 *
 *   node scripts/scan-secrets.mjs                 só os arquivos atuais
 *   node scripts/scan-secrets.mjs --historico     arquivos atuais + todos os commits (git log --all)
 *   node scripts/scan-secrets.mjs <pasta> [--json]
 *
 * Saída 1 se achar algo. Para ignorar uma linha de exemplo, escreva "scan-secrets:ignore" na mesma linha.
 * Achou um segredo REAL: troque a credencial no provedor (apagar do Git não basta, o histórico já foi copiado).
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SKIP_DIRS = new Set([".git", "node_modules", ".next", "storage", "backups", "out", "coverage", ".netlify"]);
const SKIP_FILES = new Set(["package-lock.json"]);
const MAX_BYTES = 2 * 1024 * 1024;
const IGNORE_MARK = "scan-secrets:ignore";

// Valores de exemplo/teste que não são segredos.
const PLACEHOLDER = /troque|exemplo|example|changeme|xxxx|\*\*\*|<.+>|seu[_-]|sua[_-]|your[_-]|placeholder|dummy|fake|test|teste|loja_dev_pw|senha|password|secret_aqui|chave-|process\.env|\$\{|import\.meta/i;
const SAFE_DB_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|db|postgres|host|servidor|example\.com|exemplo\.com)$/i;

/** Cada regra devolve o valor encontrado (grupo 1) para mascarar. */
const RULES = [
  { id: "chave-privada", re: /(-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----)/ },
  { id: "aws-access-key", re: /\b(AKIA[0-9A-Z]{16})\b/, ok: (v) => v.endsWith("EXAMPLE") },
  { id: "github-token", re: /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/ },
  { id: "slack-token", re: /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/ },
  { id: "google-api-key", re: /\b(AIza[0-9A-Za-z_-]{35})\b/ },
  { id: "anthropic-ou-openai-key", re: /\b(sk-(?:ant-)?[A-Za-z0-9_-]{32,})\b/ },
  { id: "neon-senha", re: /\b(npg_[A-Za-z0-9]{10,})\b/ },
  { id: "mercado-pago-token", re: /\b(APP_USR-[0-9A-Za-z-]{20,})\b/ },
  { id: "telegram-bot-token", re: /\b(\d{8,10}:[A-Za-z0-9_-]{35})\b/ },
  { id: "jwt", re: /\b(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})\b/ },
  {
    id: "senha-em-url-de-banco",
    re: /postgres(?:ql)?:\/\/[^\s:@/'"`]+:([^\s@/'"`]{3,})@([^\s:/'"`?]+)/,
    ok: (v, m) => PLACEHOLDER.test(v) || SAFE_DB_HOST.test(m[2]),
  },
  {
    id: "segredo-atribuido",
    re: /\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY)[A-Z0-9_]*\s*[:=]\s*["']?([A-Za-z0-9_\-./+=]{20,})["']?/,
    ok: (v) => PLACEHOLDER.test(v),
  },
];

const RISKY_FILE = /(^|\/)(\.env(\.[^/]*)?|id_rsa|id_ed25519|[^/]+\.(pem|p12|pfx|key)|credentials(\.json)?)$/i;
const SAFE_ENV_FILE = /(^|\/)\.env\.(example|sample|template)$/i;

export function maskSecret(value) {
  if (value.length <= 8) return `${value.slice(0, 1)}…[${value.length} caracteres]`;
  return `${value.slice(0, 4)}…[${value.length} caracteres]`;
}

/** Procura numa linha; devolve achados (regra + valor mascarado). */
export function scanLine(line) {
  if (line.includes(IGNORE_MARK) || line.length > 2000) return [];
  const found = [];
  for (const rule of RULES) {
    const m = rule.re.exec(line);
    if (!m) continue;
    const value = m[1];
    if (rule.ok && rule.ok(value, m)) continue;
    found.push({ regra: rule.id, trecho: maskSecret(value) });
  }
  return found;
}

function looksBinary(buf) {
  return buf.subarray(0, 4000).includes(0);
}

function listFiles(root) {
  if (existsSync(path.join(root, ".git"))) {
    try {
      const out = execFileSync("git", ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { maxBuffer: 64 * 1024 * 1024 });
      return out.toString("utf8").split("\0").filter(Boolean);
    } catch {
      /* cai na varredura simples */
    }
  }
  const files = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name));
      } else files.push(path.relative(root, path.join(dir, e.name)).split(path.sep).join("/"));
    }
  })(root);
  return files;
}

export function scanTree(root) {
  const findings = [];
  let arquivos = 0;
  for (const rel of listFiles(root)) {
    if (rel.split("/").some((p) => SKIP_DIRS.has(p)) || SKIP_FILES.has(path.basename(rel))) continue;
    if (RISKY_FILE.test(rel) && !SAFE_ENV_FILE.test(rel)) {
      findings.push({ regra: "arquivo-sensivel-no-projeto", arquivo: rel, linha: 0, trecho: "(arquivo de credenciais; confira se não vai para o Git)" });
    }
    const full = path.join(root, rel);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (!st.isFile() || st.size > MAX_BYTES) continue;
    const buf = readFileSync(full);
    if (looksBinary(buf)) continue;
    arquivos++;
    buf
      .toString("utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        for (const f of scanLine(line)) findings.push({ ...f, arquivo: rel, linha: i + 1 });
      });
  }
  return { arquivos, findings };
}

/** Varre as linhas ADICIONADAS em todos os commits de todos os ramos. */
export async function scanHistory(root) {
  const findings = [];
  let commits = 0;
  await new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", root, "log", "--all", "--no-color", "-p", "-U0", "--format=@@COMMIT %H"], { stdio: ["ignore", "pipe", "ignore"] });
    let buffer = "";
    let commit = "";
    let file = "";
    const handle = (line) => {
      if (line.startsWith("@@COMMIT ")) {
        commit = line.slice(9, 16);
        commits++;
      } else if (line.startsWith("+++ b/")) {
        file = line.slice(6);
        if (RISKY_FILE.test(file) && !SAFE_ENV_FILE.test(file)) {
          findings.push({ regra: "arquivo-sensivel-no-historico", arquivo: file, commit, linha: 0, trecho: "(arquivo de credenciais já esteve no Git)" });
        }
      } else if (line.startsWith("+") && !line.startsWith("+++")) {
        if (SKIP_FILES.has(path.basename(file))) return;
        for (const f of scanLine(line.slice(1))) findings.push({ ...f, arquivo: file, commit, linha: 0 });
      }
    };
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handle);
    });
    child.on("error", reject);
    child.on("close", () => {
      if (buffer) handle(buffer);
      resolve(undefined);
    });
  });
  // Mesmo segredo repetido em vários commits: mostra uma vez por regra+arquivo+trecho.
  const seen = new Set();
  const unique = findings.filter((f) => {
    const k = `${f.regra}|${f.arquivo}|${f.trecho}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { commits, findings: unique };
}

async function main() {
  const args = process.argv.slice(2);
  const root = path.resolve(args.find((a) => !a.startsWith("--")) ?? ".");
  const json = args.includes("--json");
  const withHistory = args.includes("--historico");

  const tree = scanTree(root);
  let history = { commits: 0, findings: [] };
  if (withHistory) {
    if (!existsSync(path.join(root, ".git"))) {
      console.error("Sem pasta .git aqui: o histórico só pode ser varrido dentro do clone do repositório (git clone).");
      process.exit(2);
    }
    history = await scanHistory(root);
  }

  const total = tree.findings.length + history.findings.length;
  if (json) {
    console.log(JSON.stringify({ arquivos: tree.arquivos, commits: history.commits, atuais: tree.findings, historico: history.findings }, null, 2));
  } else {
    console.log(`Arquivos varridos: ${tree.arquivos}${withHistory ? ` · commits varridos: ${history.commits}` : " · histórico NÃO varrido (use --historico)"}`);
    for (const f of tree.findings) console.log(`[ATUAL]     ${f.regra} · ${f.arquivo}${f.linha ? `:${f.linha}` : ""} · ${f.trecho}`);
    for (const f of history.findings) console.log(`[HISTÓRICO] ${f.regra} · ${f.arquivo} · commit ${f.commit} · ${f.trecho}`);
    console.log(total === 0 ? "OK: nenhum segredo encontrado." : `ATENÇÃO: ${total} achado(s). Se for credencial real, troque no provedor (Neon, Netlify, InfinitePay, PayPal, SuperFrete...).`);
  }
  process.exit(total === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Falha na varredura:", error instanceof Error ? error.message : error);
    process.exit(2);
  });
}
