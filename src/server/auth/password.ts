import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Hash de senha com scrypt (nativo do Node, sem dependências externas).
 * Formato guardado: scrypt$N$r$p$salt(base64)$hash(base64)
 * Os parâmetros ficam no próprio hash, então podem ser aumentados no futuro
 * sem invalidar senhas antigas.
 */
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function scryptAsync(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function maxMemFor(n: number, r: number): number {
  return 128 * n * r * 2;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: maxMemFor(N, R),
  });
  return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![n, r, p].every((v) => Number.isInteger(v) && v > 0) || n > 2 ** 20 || r > 32 || p > 16) return false;

  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const actual = await scryptAsync(password.normalize("NFKC"), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: maxMemFor(n, r),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

let dummyHashPromise: Promise<string> | undefined;

/**
 * Gasta o mesmo tempo de uma verificação real. Usado quando o e-mail não existe,
 * para que a resposta não revele (pelo tempo) se a conta existe.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHashPromise ??= hashPassword("senha-ficticia-para-igualar-tempo");
  await verifyPassword(password, await dummyHashPromise);
}
