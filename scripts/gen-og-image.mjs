#!/usr/bin/env node
/**
 * Generates rasterized favicon/icon variants and the OG PNG from the SVG sources in public/.
 * Run locally: `node scripts/gen-og-image.mjs` (requires sharp, installed as a transient dev tool).
 * Outputs are committed to public/ — this script only needs to run when the SVGs change.
 */
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pub = path.resolve(__dirname, '..', 'public');

async function main() {
  const faviconSvg = await readFile(path.join(pub, 'favicon.svg'));
  const ogSvg = await readFile(path.join(pub, 'og-image.svg'));

  // Icon variants from favicon.svg
  await sharp(faviconSvg, { density: 384 })
    .resize(512, 512)
    .png()
    .toFile(path.join(pub, 'icon-512.png'));
  console.log('✓ icon-512.png');

  await sharp(faviconSvg, { density: 192 })
    .resize(192, 192)
    .png()
    .toFile(path.join(pub, 'icon-192.png'));
  console.log('✓ icon-192.png');

  await sharp(faviconSvg, { density: 180 })
    .resize(180, 180)
    .png()
    .toFile(path.join(pub, 'apple-touch-icon.png'));
  console.log('✓ apple-touch-icon.png');

  // favicon.ico: multi-size PNG-in-ICO is overkill; browsers accept a PNG renamed .ico
  // but a real ICO is safer. sharp can't emit ICO — emit a 32px PNG and a 64px, then
  // wrap as ICO with a minimal header. Simpler: many sites serve favicon.svg + a 32px png.
  await sharp(faviconSvg, { density: 256 })
    .resize(32, 32)
    .png()
    .toFile(path.join(pub, 'favicon-32.png'));
  console.log('✓ favicon-32.png');

  // Build a real multi-image ICO (16,32,48,64) from PNG buffers.
  const sizes = [16, 32, 48, 64];
  const pngBufs = [];
  for (const s of sizes) {
    pngBufs.push(await sharp(faviconSvg, { density: Math.max(96, s * 4) }).resize(s, s).png().toBuffer());
  }
  const ico = buildIco(pngBufs, sizes);
  await writeFile(path.join(pub, 'favicon.ico'), ico);
  console.log('✓ favicon.ico (16/32/48/64)');

  // OG image 1200×630 PNG
  await sharp(ogSvg, { density: 144 })
    .resize(1200, 630, { fit: 'fill' })
    .png({ quality: 92 })
    .toFile(path.join(pub, 'og-image.png'));
  console.log('✓ og-image.png (1200×630)');
}

/**
 * Minimal multi-image ICO builder (ICONDIR + ICONDIRENTRY[] + PNG payloads).
 * PNG-format icons are supported by all modern browsers (Vista+).
 */
function buildIco(pngBufs, sizes) {
  const headerSize = 6;
  const entrySize = 16;
  const count = pngBufs.length;
  const dirSize = headerSize + entrySize * count;
  const buf = Buffer.alloc(dirSize + pngBufs.reduce((a, b) => a + b.length, 0));
  // ICONDIR
  buf.writeUInt16LE(0, 0); // reserved
  buf.writeUInt16LE(1, 2); // type = icon
  buf.writeUInt16LE(count, 4);
  let offset = dirSize;
  for (let i = 0; i < count; i++) {
    const s = sizes[i];
    const p = headerSize + entrySize * i;
    buf.writeUInt8(s === 256 ? 0 : s, p);      // width
    buf.writeUInt8(s === 256 ? 0 : s, p + 1);  // height
    buf.writeUInt8(0, p + 2);                   // palette
    buf.writeUInt8(0, p + 3);                   // reserved
    buf.writeUInt16LE(1, p + 4);                // planes
    buf.writeUInt16LE(32, p + 6);               // bpp
    buf.writeUInt32LE(pngBufs[i].length, p + 8);
    buf.writeUInt32LE(offset, p + 12);
    pngBufs[i].copy(buf, offset);
    offset += pngBufs[i].length;
  }
  return buf;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
