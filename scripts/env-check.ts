/**
 * Confere as variáveis de ambiente do computador (arquivo .env) ou da sessão. Não conecta em nada e não mostra segredos.
 *   npm run env:check
 * Para conferir o que vai para o Netlify, cole os mesmos nomes/valores num .env temporário FORA do projeto
 * ou preencha as variáveis na sessão do PowerShell ($env:NOME = "valor") e rode o comando.
 */
import { collectEnvReport, formatEnvReport } from "./lib/env-report";

const lines = collectEnvReport(process.env);
console.log(formatEnvReport(lines));
process.exit(lines.some((l) => l.level === "falta") ? 1 : 0);
