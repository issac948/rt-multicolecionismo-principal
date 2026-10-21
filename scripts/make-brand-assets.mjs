/**
 * Gera as versões da logo oficial (public/brand, ícone do navegador, ícone do iPhone e imagem de
 * compartilhamento) a partir de public/brand/logo-rt-original.png, SEM redesenhar nem distorcer.
 * Só é preciso rodar de novo se o arquivo original for trocado:  node scripts/make-brand-assets.mjs
 */
import sharp from "sharp";

const SRC = "public/brand/logo-rt-original.png";
const OUT = "public/brand/";

const meta = await sharp(SRC).metadata();
console.log("original", meta.width, meta.height);

// 1) Quadrado sem distorcer: o original tem 851x847; completa os poucos pixels que faltam com preto
//    (os cantos da logo já são preto puro, então a emenda é invisível).
const S = Math.max(meta.width, meta.height);
const squareBuf = await sharp(SRC)
  .extend({
    top: Math.floor((S - meta.height) / 2),
    bottom: Math.ceil((S - meta.height) / 2),
    left: Math.floor((S - meta.width) / 2),
    right: Math.ceil((S - meta.width) / 2),
    background: "#000000",
  })
  .removeAlpha()
  .png()
  .toBuffer();

// 2) Versão circular com fundo transparente, para usar sobre fundo claro (o aro dourado encosta na borda).
const r = S / 2;
const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`);
const circleBuf = await sharp(squareBuf).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();

for (const size of [96, 192, 512]) {
  await sharp(circleBuf).resize(size, size, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toFile(`${OUT}logo-rt-${size}.png`);
}
await sharp(squareBuf).resize(180, 180).png().toFile("src/app/apple-icon.png");
await sharp(circleBuf).resize(192, 192).png({ compressionLevel: 9 }).toFile("src/app/icon.png");

// 3) Imagem de compartilhamento (1200x630): fundo preto da marca e a logo inteira, centralizada.
await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#000000" } })
  .composite([{ input: await sharp(squareBuf).resize(630, 630).png().toBuffer(), gravity: "center" }])
  .png({ compressionLevel: 9 })
  .toFile("src/app/opengraph-image.png");

console.log("ok");
