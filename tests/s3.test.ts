import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { EMPTY_PAYLOAD_HASH, encodeS3Path, S3Storage, signRequestV4 } from "@/server/storage/s3";

const ACCESS = "AKIAIOSFODNN7EXAMPLE";
const SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

describe("assinatura AWS SigV4 (exemplos publicados na documentação da AWS)", () => {
  it("GET Object com cabeçalho Range", () => {
    const signed = signRequestV4({
      method: "GET",
      url: "https://examplebucket.s3.amazonaws.com/test.txt",
      headers: { Range: "bytes=0-9" },
      payloadHash: EMPTY_PAYLOAD_HASH,
      accessKeyId: ACCESS,
      secretAccessKey: SECRET,
      region: "us-east-1",
      amzDate: "20130524T000000Z",
    });
    expect(signed.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
  });

  it("PUT Object com caractere especial no nome e cabeçalhos extras", () => {
    const body = "Welcome to Amazon S3.";
    const signed = signRequestV4({
      method: "PUT",
      url: `https://examplebucket.s3.amazonaws.com/${encodeS3Path("test$file.text")}`,
      headers: { Date: "Fri, 24 May 2013 00:00:00 GMT", "x-amz-storage-class": "REDUCED_REDUNDANCY" },
      payloadHash: createHash("sha256").update(body).digest("hex"),
      accessKeyId: ACCESS,
      secretAccessKey: SECRET,
      region: "us-east-1",
      amzDate: "20130524T000000Z",
    });
    expect(signed.authorization).toContain("SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class");
    expect(signed.authorization).toContain("Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd");
  });
});

describe("S3Storage (com servidor S3 simulado)", () => {
  function fakeS3() {
    const files = new Map<string, { data: Buffer; contentType: string }>();
    const calls: Array<{ method: string; url: string; auth: string | null }> = [];
    const impl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method);
      const headers = init?.headers as Record<string, string>;
      calls.push({ method, url, auth: headers.authorization ?? null });
      const path = new URL(url).pathname.replace(/^\/bucket-teste\//, "");
      if (method === "PUT") {
        files.set(path, { data: Buffer.from(init!.body as Uint8Array), contentType: headers["content-type"] });
        return new Response(null, { status: 200 });
      }
      if (method === "GET") {
        const f = files.get(path);
        return f ? new Response(new Uint8Array(f.data), { status: 200, headers: { "content-type": f.contentType } }) : new Response("", { status: 404 });
      }
      files.delete(path);
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    return { files, calls, impl };
  }

  const config = { endpoint: "https://conta.r2.cloudflarestorage.com", region: "auto", bucket: "bucket-teste", accessKeyId: ACCESS, secretAccessKey: SECRET, publicBaseUrl: "" };

  it("grava, lê, apaga e trata arquivo inexistente", async () => {
    const fake = fakeS3();
    const storage = new S3Storage(config, fake.impl);
    await storage.put("events/a.webp", Buffer.from("abc"), "image/webp");
    expect((await storage.get("events/a.webp"))?.data.toString()).toBe("abc");
    expect((await storage.get("events/a.webp"))?.contentType).toBe("image/webp");
    await storage.delete("events/a.webp");
    expect(await storage.get("events/a.webp")).toBeNull();
    await storage.delete("events/nao-existe.webp"); // 404 na exclusão não é erro
    expect(fake.calls.every((c) => c.auth?.startsWith("AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/"))).toBe(true);
    expect(fake.calls[0].url).toBe("https://conta.r2.cloudflarestorage.com/bucket-teste/events/a.webp");
  });

  it("recusa chaves perigosas e usa o endereço público quando configurado", async () => {
    const storage = new S3Storage({ ...config, publicBaseUrl: "https://fotos.exemplo.com.br" }, fakeS3().impl);
    await expect(storage.put("../segredo.webp", Buffer.from("x"), "image/webp")).rejects.toThrow();
    expect(storage.publicUrl("products/a.webp")).toBe("https://fotos.exemplo.com.br/products/a.webp");
    expect(new S3Storage(config, fakeS3().impl).publicUrl("products/a.webp")).toBe("/uploads/products/a.webp");
  });

  it("devolve erro claro quando o serviço recusa (sem vazar a chave secreta)", async () => {
    const impl = (async () => new Response("denied", { status: 403 })) as typeof fetch;
    const storage = new S3Storage(config, impl);
    await expect(storage.put("events/a.webp", Buffer.from("x"), "image/webp")).rejects.toThrow(/HTTP 403/);
    await storage.put("events/a.webp", Buffer.from("x"), "image/webp").catch((e: Error) => expect(e.message).not.toContain(SECRET));
  });
});
