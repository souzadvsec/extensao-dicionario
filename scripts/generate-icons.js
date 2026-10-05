// Uso: npm run icons  →  extension/icons/icon-{16,32,48,128}.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { drawIcon, encodePng } from './png.js';

const SIZES = [16, 32, 48, 128];
const outDir = new URL('../extension/icons/', import.meta.url);

mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  writeFileSync(new URL(`icon-${size}.png`, outDir), encodePng(size, size, drawIcon(size)));
  console.log(`ícone gerado: extension/icons/icon-${size}.png`);
}
