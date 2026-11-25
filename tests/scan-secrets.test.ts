import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = path.resolve(process.cwd(), "scripts/scan-secrets.mjs");
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

// Valores falsos montados em tempo de execução: o próprio arquivo de teste não pode conter um "segredo" inteiro.
const AWS = ["AK", "IA", "QWERTYUIOPASDFGH"].join("");
const AWS_EXAMPLE = ["AK", "IA", "IOSFODNN7EXAMPLE"].join("");
const DB_PASS = ["x9Kq", "7Lm2", "Zp4R", "vB8w"].join("");
const GH = ["gh", "p_", "a".repeat(36)].join("");

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "scan-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), content);
  }
  return dir;
}
function scan(dir: string, ...args: string[]) {
  const r = spawnSync("node", [SCRIPT, dir, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}
const hasGit = spawnSync("git", ["--version"]).status === 0;

describe("scan-secrets", () => {
  it("acha chave AWS, token do GitHub e senha de banco remoto, e nunca imprime o valor inteiro", () => {
    const dir = project({
      "src/a.ts": `const k = "${AWS}";\nconst t = "${GH}";\nconst u = "postgres://dono:${DB_PASS}@ep-abc.us-east-2.aws.neon.tech/neondb";`,
    });
    const r = scan(dir);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/aws-access-key · src\/a\.ts:1/);
    expect(r.out).toMatch(/github-token · src\/a\.ts:2/);
    expect(r.out).toMatch(/senha-em-url-de-banco · src\/a\.ts:3/);
    for (const secret of [AWS, GH, DB_PASS]) expect(r.out).not.toContain(secret);
  });

  it("não reclama de exemplos, placeholders, banco local, variáveis de ambiente e .env.example", () => {
    const dir = project({
      "a.ts": [
        `const k = "${AWS_EXAMPLE}";`,
        `const u = "postgres://loja:loja_dev_pw@localhost:5432/loja";`,
        `const v = "postgres://loja:troque_esta_senha@db.interno/loja";`,
        `const s = process.env.WEBHOOK_TOKEN_SECRET_FOR_PAYMENTS;`,
        `PAYPAL_CLIENT_SECRET=troque_por_o_segredo_do_paypal_aqui`,
        `const x = "${GH}"; // scan-secrets:ignore`,
      ].join("\n"),
      ".env.example": "DATABASE_URL=postgres://loja:troque_esta_senha@localhost:5432/loja\nCRON_SECRET=\n",
    });
    const r = scan(dir);
    expect(r.out).toContain("OK: nenhum segredo encontrado.");
    expect(r.code).toBe(0);
  });

  it("avisa quando um .env de verdade está no projeto", () => {
    const dir = project({ ".env": "A=1\n", "ok.ts": "export {}" });
    const r = scan(dir);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/arquivo-sensivel-no-projeto · \.env/);
  });

  it("--json devolve achados mascarados", () => {
    const dir = project({ "a.ts": `const k = "${AWS}";` });
    const r = scan(dir, "--json");
    const data = JSON.parse(r.out);
    expect(data.atuais).toHaveLength(1);
    expect(data.atuais[0]).toMatchObject({ regra: "aws-access-key", arquivo: "a.ts", linha: 1 });
    expect(r.out).not.toContain(AWS);
  });

  it.skipIf(!hasGit)("encontra no HISTÓRICO um segredo que já foi apagado dos arquivos", () => {
    const dir = project({ "a.ts": `const k = "${AWS}";` });
    const git = (...a: string[]) => execFileSync("git", ["-C", dir, "-c", "user.email=t@t", "-c", "user.name=t", ...a], { stdio: "pipe" });
    git("init", "-q");
    git("add", "-A");
    git("commit", "-q", "-m", "com segredo");
    writeFileSync(path.join(dir, "a.ts"), "export {};\n");
    git("commit", "-qam", "removido");

    const tree = scan(dir);
    expect(tree.code).toBe(0); // arquivos atuais limpos
    expect(tree.out).toContain("histórico NÃO varrido");

    const hist = scan(dir, "--historico");
    expect(hist.code).toBe(1);
    expect(hist.out).toMatch(/\[HISTÓRICO\] aws-access-key · a\.ts · commit [0-9a-f]{7}/);
    expect(hist.out).not.toContain(AWS);
  });

  it.skipIf(!hasGit)("--historico sem pasta .git explica o que fazer", () => {
    const r = scan(project({ "a.ts": "export {}" }), "--historico");
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/git clone/);
  });

  it("o próprio projeto não tem segredos nos arquivos atuais", () => {
    const r = scan(process.cwd());
    expect(r.out).toContain("OK: nenhum segredo encontrado.");
  });
});
