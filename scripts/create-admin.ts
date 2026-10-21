/**
 * Cria (ou atualiza a senha de) uma conta de ADMINISTRADOR.
 * Esta é a ÚNICA forma de criar um administrador: nenhuma tela pública dá esse papel.
 *
 * Uso interativo:   npm run admin:create
 * Uso automatizado: ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npm run admin:create
 */
import { createInterface } from "node:readline";
import { pool } from "../src/server/db";
import { createAdminUser } from "../src/server/services/users";

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Não mostra a senha enquanto é digitada.
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
        if (s.includes(question)) process.stdout.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não está definida. Configure o arquivo .env primeiro.");
    process.exit(1);
  }

  const email = process.env.ADMIN_EMAIL || (await ask("E-mail do administrador: "));
  const name = process.env.ADMIN_NAME || (await ask("Nome do administrador: "));
  let password = process.env.ADMIN_PASSWORD || "";

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    console.error("E-mail inválido.");
    process.exit(1);
  }
  if (name.length < 2) {
    console.error("Informe o nome.");
    process.exit(1);
  }

  if (!password) {
    password = await ask("Senha (mínimo 10 caracteres): ", true);
    const confirm = await ask("Repita a senha: ", true);
    if (password !== confirm) {
      console.error("As senhas não conferem.");
      process.exit(1);
    }
  }

  const { user, created } = await createAdminUser({ email, name, password });
  console.log(created ? `Administrador criado: ${user.email}` : `Conta existente promovida a administrador e senha atualizada: ${user.email}`);
}

main()
  .catch((error) => {
    console.error("Não foi possível criar o administrador:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
