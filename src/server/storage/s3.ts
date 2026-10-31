import { createHash, createHmac } from "node:crypto";
import { isValidStorageKey, type StorageProvider } from "./types";

/**
 * Armazenamento em serviço compatível com o Amazon S3 (Cloudflare R2, Backblaze B2, Amazon S3, MinIO...).
 * Sem dependência nova: a assinatura "AWS Signature Version 4" é feita aqui com o módulo `crypto` do Node.
 * Os testes conferem a assinatura contra os exemplos publicados na documentação da AWS.
 *
 * Usa endereço "path-style" (https://endpoint/bucket/chave), aceito pelo R2, B2 e MinIO.
 */

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Endereço público dos arquivos (CDN/domínio do bucket). Em branco = a loja serve as fotos pelo /uploads. */
  publicBaseUrl: string;
};

const sha256Hex = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

export const EMPTY_PAYLOAD_HASH = sha256Hex("");

/** Codifica um trecho de caminho como o S3 exige (RFC 3986, sem codificar "/"). */
export function encodeS3Path(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

export type SignInput = {
  method: string;
  /** Endereço completo (https://host/caminho?consulta). */
  url: string;
  /** Cabeçalhos que também serão assinados (host e x-amz-* são acrescentados automaticamente). */
  headers: Record<string, string>;
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
  /** AAAAMMDDTHHMMSSZ */
  amzDate: string;
};

/** Devolve os cabeçalhos finais (incluindo Authorization) de uma requisição assinada com SigV4. */
export function signRequestV4(input: SignInput): Record<string, string> {
  const service = input.service ?? "s3";
  const url = new URL(input.url);
  const dateStamp = input.amzDate.slice(0, 8);

  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.headers)) headers[name.toLowerCase()] = value.trim().replace(/\s+/g, " ");
  headers.host = headers.host ?? url.host;
  headers["x-amz-content-sha256"] = input.payloadHash;
  headers["x-amz-date"] = input.amzDate;

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join("");
  const signedHeaders = names.join(";");

  const canonicalQuery = [...url.searchParams.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  // O caminho já chega codificado em `url.pathname`; no S3 ele é codificado uma única vez.
  const canonicalRequest = [input.method.toUpperCase(), url.pathname, canonicalQuery, canonicalHeaders, signedHeaders, input.payloadHash].join("\n");

  const scope = `${dateStamp}/${input.region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", input.amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, dateStamp), input.region), service), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`,
  };
}

function amzDateNow(now = new Date()): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export class S3Storage implements StorageProvider {
  constructor(
    private readonly config: S3Config,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private objectUrl(key: string): string {
    if (!isValidStorageKey(key)) throw new Error("Chave de arquivo inválida.");
    return `${this.config.endpoint}/${encodeURIComponent(this.config.bucket)}/${encodeS3Path(key)}`;
  }

  private async send(method: "GET" | "PUT" | "DELETE", key: string, body?: Buffer, contentType?: string): Promise<Response> {
    const url = this.objectUrl(key);
    const headers: Record<string, string> = {};
    if (contentType) headers["content-type"] = contentType;
    if (method === "PUT") headers["cache-control"] = "public, max-age=31536000, immutable";
    const signed = signRequestV4({
      method,
      url,
      headers,
      payloadHash: body ? sha256Hex(body) : EMPTY_PAYLOAD_HASH,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: this.config.region,
      amzDate: amzDateNow(),
    });
    // O cabeçalho "host" é definido pelo próprio fetch.
    delete signed.host;
    return this.fetchImpl(url, { method, headers: signed, body: body ? new Uint8Array(body) : undefined, signal: AbortSignal.timeout(20_000) });
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const response = await this.send("PUT", key, data, contentType);
    if (!response.ok) throw new Error(`Falha ao gravar a foto no armazenamento externo (HTTP ${response.status}).`);
  }

  async get(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    const response = await this.send("GET", key);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Falha ao ler a foto no armazenamento externo (HTTP ${response.status}).`);
    return { data: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") ?? "application/octet-stream" };
  }

  async delete(key: string): Promise<void> {
    const response = await this.send("DELETE", key);
    // 404 = já não existia: tudo certo.
    if (!response.ok && response.status !== 404) throw new Error(`Falha ao apagar a foto no armazenamento externo (HTTP ${response.status}).`);
  }

  publicUrl(key: string): string {
    return this.config.publicBaseUrl ? `${this.config.publicBaseUrl}/${key}` : `/uploads/${key}`;
  }
}
