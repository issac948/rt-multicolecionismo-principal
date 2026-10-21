"use server";

import { redirect } from "next/navigation";
import { formString } from "@/lib/forms";
import { loginSchema, passwordSchema, registerSchema, zodFieldErrors } from "@/lib/schemas";
import { safeNextPath } from "../auth/authorize";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "../auth/current-user";
import { createSession, deleteSession } from "../auth/session";
import { mergeGuestCartAfterLogin } from "../cart-session";
import { RateLimitError } from "../errors";
import { checkRateLimit, resetRateLimit } from "../security/rate-limit";
import { consumePasswordReset } from "../services/password-reset";
import { authenticate, registerUser } from "../services/users";
import { failure, requestIp, requestUserAgent, type FormState } from "./shared";

const FIFTEEN_MIN = 15 * 60 * 1000;

export async function registerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let destination = "/minha-conta";
  try {
    const parsed = registerSchema.safeParse({
      name: formString(fd, "name") ?? "",
      email: formString(fd, "email") ?? "",
      phone: formString(fd, "phone"),
      password: formString(fd, "password") ?? "",
      confirmPassword: formString(fd, "confirmPassword") ?? "",
    });
    if (!parsed.success) return { errors: zodFieldErrors(parsed.error), message: "Confira os campos destacados." };

    const ip = await requestIp();
    const limit = ip ? checkRateLimit(`register:${ip}`, 10, 60 * 60 * 1000) : checkRateLimit("register:global", 60, 60 * 60 * 1000);
    if (!limit.ok) throw new RateLimitError(limit.retryAfterSeconds);

    const user = await registerUser(parsed.data);
    const session = await createSession(user.id, user.role, await requestUserAgent());
    await setSessionCookie(session.token, session.expiresAt);
    await mergeGuestCartAfterLogin(user.id);
    destination = safeNextPath(formString(fd, "next"), "/minha-conta");
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let destination = "/";
  try {
    const parsed = loginSchema.safeParse({
      email: formString(fd, "email") ?? "",
      password: formString(fd, "password") ?? "",
    });
    if (!parsed.success) return { errors: zodFieldErrors(parsed.error), message: "Confira os campos destacados." };
    const { email, password } = parsed.data;

    // Limite por e-mail (protege a conta) e, quando conhecido, por IP (protege contra varredura).
    const emailKey = `login:email:${email}`;
    const byEmail = checkRateLimit(emailKey, 8, FIFTEEN_MIN);
    if (!byEmail.ok) throw new RateLimitError(byEmail.retryAfterSeconds);
    const ip = await requestIp();
    if (ip) {
      const byIp = checkRateLimit(`login:ip:${ip}`, 40, FIFTEEN_MIN);
      if (!byIp.ok) throw new RateLimitError(byIp.retryAfterSeconds);
    }

    const user = await authenticate(email, password);
    // Mesma mensagem para e-mail inexistente e senha errada: não revela quais contas existem.
    if (!user) return { message: "E-mail ou senha incorretos." };

    resetRateLimit(emailKey);
    // Sempre uma sessão NOVA a cada login (evita fixação de sessão).
    const session = await createSession(user.id, user.role, await requestUserAgent());
    await setSessionCookie(session.token, session.expiresAt);
    await mergeGuestCartAfterLogin(user.id);

    const next = formString(fd, "next");
    destination = next ? safeNextPath(next) : user.role === "ADMIN" ? "/admin/dashboard" : "/minha-conta";
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

export async function logoutAction(): Promise<void> {
  await deleteSession(await readSessionToken());
  await clearSessionCookie();
  redirect("/");
}

/** Define a nova senha pelo link que o administrador gerou. Em caso de sucesso, manda para o login. */
export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const token = formString(fd, "token") ?? "";
    const password = formString(fd, "password") ?? "";
    const confirm = formString(fd, "confirmPassword") ?? "";
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return { errors: { password: parsed.error.issues[0].message }, message: "Confira os campos destacados." };
    if (password !== confirm) return { errors: { confirmPassword: "As senhas não conferem" }, message: "Confira os campos destacados." };

    const ip = await requestIp();
    const limit = checkRateLimit(ip ? `reset:ip:${ip}` : "reset:global", ip ? 15 : 60, FIFTEEN_MIN);
    if (!limit.ok) throw new RateLimitError(limit.retryAfterSeconds);

    await consumePasswordReset(token, password);
  } catch (error) {
    return failure(error);
  }
  redirect("/login?senha=redefinida");
}
