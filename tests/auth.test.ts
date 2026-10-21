import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { assertRole, safeNextPath } from "@/server/auth/authorize";
import { createSession, deleteSession, getUserByToken, hashToken } from "@/server/auth/session";
import { authenticate, changePassword, createAdminUser, registerUser } from "@/server/services/users";
import { checkRateLimit, clientIpFromHeaders } from "@/server/security/rate-limit";
import { isSameOrigin } from "@/server/security/origin";
import { AuthError, ValidationError } from "@/server/errors";
import { sessions } from "@/server/db/schema";
import { createAdmin, createUser, db, resetDb, TEST_PASSWORD } from "./helpers";

beforeEach(resetDb);

describe("senhas", () => {
  it("nunca guarda a senha em texto puro e confere corretamente", async () => {
    const hash = await hashPassword("minha-senha-secreta");
    expect(hash).not.toContain("minha-senha-secreta");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("minha-senha-secreta", hash)).toBe(true);
    expect(await verifyPassword("minha-senha-secretA", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("gera hashes diferentes para a mesma senha (salt aleatório)", async () => {
    expect(await hashPassword("igual")).not.toBe(await hashPassword("igual"));
  });

  it("recusa hashes malformados sem lançar erro", async () => {
    expect(await verifyPassword("x", "texto-qualquer")).toBe(false);
    expect(await verifyPassword("x", "scrypt$1$1$1$$")).toBe(false);
    expect(await verifyPassword("x", "scrypt$99999999$8$1$YQ==$YQ==")).toBe(false);
  });
});

describe("cadastro e login", () => {
  it("cadastra cliente com papel CLIENTE e senha com hash", async () => {
    const user = await registerUser({ name: "Ana", email: "Ana@Exemplo.com", phone: null, password: "senha-bem-grande" });
    expect(user.role).toBe("CLIENTE");
    expect(user.email).toBe("ana@exemplo.com");
    expect(user.passwordHash).not.toContain("senha-bem-grande");
  });

  it("não permite e-mail repetido (ignorando maiúsculas)", async () => {
    await registerUser({ name: "Ana", email: "ana@exemplo.com", phone: null, password: "senha-bem-grande" });
    await expect(
      registerUser({ name: "Outra", email: "ANA@exemplo.com", phone: null, password: "outra-senha-grande" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("autentica com a senha certa e recusa a errada ou conta inexistente", async () => {
    const user = await createUser({ email: "joao@teste.com" });
    expect((await authenticate("JOAO@teste.com", TEST_PASSWORD))?.id).toBe(user.id);
    expect(await authenticate("joao@teste.com", "errada-errada")).toBeNull();
    expect(await authenticate("naoexiste@teste.com", TEST_PASSWORD)).toBeNull();
  });

  it("conta desativada não consegue entrar", async () => {
    await createUser({ email: "off@teste.com", active: false });
    expect(await authenticate("off@teste.com", TEST_PASSWORD)).toBeNull();
  });

  it("troca de senha exige a senha atual e encerra as outras sessões", async () => {
    const user = await createUser();
    const keep = await createSession(user.id, "CLIENTE");
    const other = await createSession(user.id, "CLIENTE");

    await expect(changePassword(user.id, "senha-atual-errada", "nova-senha-grande", keep.token)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await changePassword(user.id, TEST_PASSWORD, "nova-senha-grande", keep.token);

    expect(await getUserByToken(keep.token)).not.toBeNull();
    expect(await getUserByToken(other.token)).toBeNull();
    expect(await authenticate(user.email, "nova-senha-grande")).not.toBeNull();
  });

  it("admin só é criado pelo serviço dedicado e exige senha forte", async () => {
    await expect(createAdminUser({ email: "dono@loja.com", name: "Dono", password: "curta" })).rejects.toThrow();
    const { user, created } = await createAdminUser({ email: "dono@loja.com", name: "Dono", password: "senha-forte-123" });
    expect(created).toBe(true);
    expect(user.role).toBe("ADMIN");

    // Rodar de novo atualiza a mesma conta, sem duplicar.
    const again = await createAdminUser({ email: "DONO@loja.com", name: "Dono", password: "outra-forte-1234" });
    expect(again.created).toBe(false);
    expect(again.user.id).toBe(user.id);
  });
});

describe("sessões", () => {
  it("o banco guarda só o hash do token", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id, "CLIENTE");
    const [row] = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.tokenHash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("devolve o usuário do token válido e recusa token inventado", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id, "CLIENTE");
    expect((await getUserByToken(token))?.id).toBe(user.id);
    expect(await getUserByToken("token-inventado-que-nao-existe-123456")).toBeNull();
    expect(await getUserByToken(null)).toBeNull();
    expect(await getUserByToken("")).toBeNull();
  });

  it("recusa sessão expirada", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id, "CLIENTE");
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, user.id));
    expect(await getUserByToken(token)).toBeNull();
  });

  it("logout apaga a sessão", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id, "CLIENTE");
    await deleteSession(token);
    expect(await getUserByToken(token)).toBeNull();
  });

  it("desativar a conta invalida a sessão na hora", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id, "CLIENTE");
    const { users } = await import("@/server/db/schema");
    await db.update(users).set({ active: false }).where(eq(users.id, user.id));
    expect(await getUserByToken(token)).toBeNull();
  });

  it("sessão de administrador dura menos que a de cliente", async () => {
    const admin = await createAdmin();
    const client = await createUser();
    const a = await createSession(admin.id, "ADMIN");
    const c = await createSession(client.id, "CLIENTE");
    expect(a.expiresAt.getTime()).toBeLessThan(c.expiresAt.getTime());
  });
});

describe("permissões (CLIENTE x ADMIN)", () => {
  it("sem login: 401", () => {
    expect(() => assertRole(null, "ADMIN")).toThrow(AuthError);
    try {
      assertRole(null, "ADMIN");
    } catch (e) {
      expect((e as AuthError).status).toBe(401);
    }
  });

  it("cliente nunca acessa função de administrador: 403", async () => {
    const client = await createUser();
    const { token } = await createSession(client.id, "CLIENTE");
    const sessionUser = await getUserByToken(token);
    try {
      assertRole(sessionUser, "ADMIN");
      throw new Error("deveria ter lançado");
    } catch (e) {
      expect(e).toBeInstanceOf(AuthError);
      expect((e as AuthError).status).toBe(403);
    }
  });

  it("administrador passa nas duas verificações", async () => {
    const admin = await createAdmin();
    const { token } = await createSession(admin.id, "ADMIN");
    const sessionUser = await getUserByToken(token);
    expect(assertRole(sessionUser, "ADMIN").role).toBe("ADMIN");
    expect(assertRole(sessionUser, "CLIENTE").role).toBe("ADMIN");
  });

  it("o papel vem do banco, não do cookie: promover/rebaixar vale na hora", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id, "CLIENTE");
    const { users } = await import("@/server/db/schema");
    await db.update(users).set({ role: "ADMIN" }).where(eq(users.id, user.id));
    expect((await getUserByToken(token))?.role).toBe("ADMIN");
    await db.update(users).set({ role: "CLIENTE" }).where(eq(users.id, user.id));
    expect((await getUserByToken(token))?.role).toBe("CLIENTE");
  });
});

describe("redirecionamento seguro após login", () => {
  it("aceita só caminhos internos", () => {
    expect(safeNextPath("/checkout")).toBe("/checkout");
    expect(safeNextPath("/pedido/abc?x=1")).toBe("/pedido/abc?x=1");
    for (const evil of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "evil.com", "/ok\r\nSet-Cookie: a=b"]) {
      expect(safeNextPath(evil, "/"), evil).toBe("/");
    }
    expect(safeNextPath(null)).toBe("/");
  });
});

describe("limite de tentativas", () => {
  it("bloqueia depois do limite e libera após a janela", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(checkRateLimit("login:a", 5, 60_000, t0 + i).ok).toBe(true);
    const blocked = checkRateLimit("login:a", 5, 60_000, t0 + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(checkRateLimit("login:b", 5, 60_000, t0 + 10).ok).toBe(true); // outra chave não é afetada
    expect(checkRateLimit("login:a", 5, 60_000, t0 + 61_000).ok).toBe(true); // janela nova
  });

  it("só confia em X-Forwarded-For quando TRUST_PROXY está ligado", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(clientIpFromHeaders(headers, false)).toBeNull();
    expect(clientIpFromHeaders(headers, true)).toBe("203.0.113.9");
  });
});

describe("proteção CSRF por Origin", () => {
  const req = (origin: string | null, host = "localhost:3000") =>
    new Request("http://localhost:3000/api/x", {
      method: "POST",
      headers: { ...(origin ? { origin } : {}), host },
    });

  it("aceita o mesmo site e recusa outros ou ausência de Origin", () => {
    expect(isSameOrigin(req("http://localhost:3000"))).toBe(true);
    expect(isSameOrigin(req("https://evil.com"))).toBe(false);
    expect(isSameOrigin(req(null))).toBe(false);
    expect(isSameOrigin(req("not-a-url"))).toBe(false);
  });
});
