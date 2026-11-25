import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * scripts/check-repo.mjs impede publicar um repositório incompleto (arquivo de código ignorado pelo
 * .gitignore, import quebrado, pacote não declarado, maiúsculas/minúsculas erradas). Aqui ele roda em
 * pastas de mentira para provar que acusa cada problema e que não acusa quando está tudo certo.
 */
const SCRIPT = path.resolve(process.cwd(), "scripts/check-repo.mjs");
const dirs: string[] = [];
const hasGit = spawnSync("git", ["--version"]).status === 0;

function fixture(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), "check-repo-"));
  dirs.push(dir);
  const all = { "package.json": JSON.stringify({ name: "x", dependencies: {} }), ...files };
  for (const [rel, content] of Object.entries(all)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

function run(dir: string, ...flags: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, dir, ...flags], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("scripts/check-repo.mjs", () => {
  it("passa quando todos os imports existem", () => {
    const dir = fixture({
      "src/a.ts": 'import { b } from "./b";\nimport path from "node:path";\nexport const a = b + path.sep;\n',
      "src/b.ts": "export const b = 1;\n",
    });
    const r = run(dir);
    expect(r.code).toBe(0);
    expect(r.out).toContain("OK");
  });

  it("acusa import relativo que não existe", () => {
    const dir = fixture({ "src/a.ts": 'import "./nao-existe";\n' });
    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain("[arquivo-ausente]");
  });

  it('acusa import "@/..." que não existe', () => {
    const dir = fixture({ "src/a.ts": 'import { x } from "@/server/storage";\nexport { x };\n' });
    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain("[arquivo-ausente]");
  });

  it("acusa maiúsculas/minúsculas erradas (o Linux da Netlify é sensível a isso)", () => {
    const dir = fixture({
      "src/a.ts": 'import { b } from "./Foo";\nexport { b };\n',
      "src/foo.ts": "export const b = 1;\n",
    });
    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain("[caixa-de-letras]");
  });

  it("acusa pacote que não está no package.json nem instalado", () => {
    const dir = fixture({ "src/a.ts": 'import x from "pacote-que-nao-existe";\nexport default x;\n' });
    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain("[pacote-nao-declarado]");
  });

  it("aceita pacote declarado no package.json", () => {
    const dir = fixture({
      "package.json": JSON.stringify({ name: "x", dependencies: { "pacote-declarado": "1.0.0" } }),
      "src/a.ts": 'import x from "pacote-declarado/sub";\nexport default x;\n',
    });
    expect(run(dir).code).toBe(0);
  });

  it("trata pacote só instalado por outro como aviso, e como erro com --estrito", () => {
    const dir = fixture({
      "src/a.ts": 'import x from "pacote-transitivo";\nexport default x;\n',
      "node_modules/pacote-transitivo/package.json": "{}",
    });
    const normal = run(dir);
    expect(normal.code).toBe(0);
    expect(normal.out).toContain("(aviso)");
    expect(run(dir, "--estrito").code).toBe(1);
  });

  it("confere @import de CSS (é assim que as fontes @fontsource entram)", () => {
    const dir = fixture({ "src/app/globals.css": '@import "fonte-que-nao-existe/arquivo.css";\n' });
    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain("[pacote-nao-declarado]");
  });

  it.skipIf(!hasGit)("acusa arquivo de código usado mas ignorado pelo .gitignore", () => {
    const files = {
      "src/a.ts": 'import { s } from "./server/storage/index";\nexport { s };\n',
      "src/server/storage/index.ts": "export const s = 1;\n",
    };
    const ruim = fixture({ ...files, ".gitignore": "storage/\n" });
    spawnSync("git", ["init", "-q"], { cwd: ruim });
    const r = run(ruim);
    expect(r.code).toBe(1);
    expect(r.out).toContain("[ignorado-pelo-git]");

    const bom = fixture({ ...files, ".gitignore": "/storage/\n" });
    spawnSync("git", ["init", "-q"], { cwd: bom });
    expect(run(bom).code).toBe(0);
  });

  it("o próprio projeto está completo", () => {
    const r = spawnSync(process.execPath, [SCRIPT, process.cwd()], { encoding: "utf8" });
    expect(r.status, r.stdout).toBe(0);
  });
});
