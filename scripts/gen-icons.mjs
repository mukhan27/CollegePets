// Dev-only icon generator. Produces the PWA / home-screen PNG icons from a
// hand-drawn graduation-cap motif — no image libraries, no runtime deps. Run
// once with `node scripts/gen-icons.mjs` whenever the icon design changes.
// PNGs are encoded by hand (RGBA scanlines, zlib-deflated) so this works on a
// bare Node install with nothing else available.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = join(root, 'icons');
mkdirSync(iconDir, { recursive: true });

// ---- minimal PNG encoder (truecolour + alpha) ----
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const body = Buffer.concat([tb, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  // raw scanlines, each prefixed with a 0 (no) filter byte
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- the motif: a graduation cap on the brand background ----
const BG = [26, 42, 58], ORANGE = [255, 159, 67], ORANGE2 = [224, 138, 46], GOLD = [255, 209, 102], DARK = [18, 28, 40];
const inRhombus = (u, v, cx, cy, hw, hh) => Math.abs(u - cx) / hw + Math.abs(v - cy) / hh <= 1;

// motif space coords roughly span [-1,1]; `fill` sets how much of the icon it occupies
function draw(size, fill, opaqueBg = true) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (((x + 0.5) / size) * 2 - 1) / fill;
    const v = (1 - ((y + 0.5) / size) * 2) / fill;
    let col = BG;
    // cap band (the head-piece under the board) — drawn first so the board sits on top
    if (v <= 0.10 && v >= -0.55) { const t = (0.10 - v) / 0.65, hwb = 0.42 + (0.30 - 0.42) * t; if (Math.abs(u) <= hwb) col = ORANGE2; }
    // mortarboard (flat diamond)
    if (inRhombus(u, v, 0, 0.18, 0.82, 0.34)) col = ORANGE;
    // centre button
    if ((u * u + (v - 0.20) * (v - 0.20)) <= 0.06 * 0.06) col = DARK;
    // tassel string + bead down the right side
    if (Math.abs(u - 0.60) < 0.025 && v < 0.18 && v > -0.42) col = GOLD;
    if ((u - 0.60) * (u - 0.60) + (v + 0.50) * (v + 0.50) <= 0.10 * 0.10) col = GOLD;
    const o = (y * size + x) * 4;
    px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = opaqueBg ? 255 : 255;
  }
  return px;
}

const out = [
  ['icon-192.png', 192, 0.78],
  ['icon-512.png', 512, 0.78],
  ['icon-maskable-512.png', 512, 0.60], // smaller motif → stays inside the maskable safe zone
  ['apple-touch-icon.png', 180, 0.78],  // iOS rounds the corners itself; must be fully opaque
];
for (const [name, size, fill] of out) {
  writeFileSync(join(iconDir, name), encodePng(size, draw(size, fill)));
  console.log('wrote icons/' + name + ' (' + size + 'x' + size + ')');
}
