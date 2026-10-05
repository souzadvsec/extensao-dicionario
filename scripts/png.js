// Desenha e codifica os ícones PNG sem dependências (o Chrome não aceita SVG em "icons").
import { deflateSync } from 'node:zlib';

export const BRAND_BLUE = [37, 99, 235]; // #2563eb
const WHITE = [255, 255, 255];
const SAMPLES = 4; // supersampling 4x4 por pixel para suavizar as bordas

/** Lupa branca sobre quadrado arredondado azul, em RGBA (coordenadas normalizadas 0..1). */
export function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let glyph = 0;
      let background = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          if (!insideRoundedSquare(x, y)) continue;
          if (insideMagnifier(x, y)) glyph++;
          else background++;
        }
      }
      const covered = glyph + background;
      if (covered === 0) continue;
      const offset = (py * size + px) * 4;
      for (let c = 0; c < 3; c++) {
        pixels[offset + c] = Math.round((WHITE[c] * glyph + BRAND_BLUE[c] * background) / covered);
      }
      pixels[offset + 3] = Math.round((255 * covered) / (SAMPLES * SAMPLES));
    }
  }
  return pixels;
}

function insideRoundedSquare(x, y) {
  const inset = 0.03;
  const radius = 0.22;
  const cx = Math.min(Math.max(x, inset + radius), 1 - inset - radius);
  const cy = Math.min(Math.max(y, inset + radius), 1 - inset - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function insideMagnifier(x, y) {
  const fromLensCenter = Math.hypot(x - 0.43, y - 0.43);
  if (fromLensCenter >= 0.16 && fromLensCenter <= 0.25) return true; // aro
  return distanceToSegment(x, y, 0.6, 0.6, 0.78, 0.78) <= 0.06; // cabo
}

function distanceToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/** Codifica pixels RGBA de 8 bits como PNG. */
export function encodePng(width, height, rgba) {
  const pixels = Buffer.from(rgba);
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height); // byte 0 de cada linha = filtro None
  for (let row = 0; row < height; row++) {
    pixels.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  }
  const header = Buffer.alloc(13); // bytes 10..12 (compressão, filtro, entrelaçamento) = 0
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
