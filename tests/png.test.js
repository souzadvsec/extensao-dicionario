import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { encodePng, drawIcon, BRAND_BLUE } from '../scripts/png.js';

const TWO_PIXELS = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128]);

test('encodePng escreve assinatura, IHDR RGBA e IEND válidos', () => {
  const png = encodePng(2, 1, TWO_PIXELS);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), 2); // largura
  assert.equal(png.readUInt32BE(20), 1); // altura
  assert.equal(png[24], 8); // bits por canal
  assert.equal(png[25], 6); // RGBA
  // IEND vazio tem CRC conhecido (AE 42 60 82): valida o CRC32.
  assert.deepEqual([...png.subarray(-12)], [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
});

test('encodePng comprime cada linha com o filtro None', () => {
  const png = encodePng(2, 1, TWO_PIXELS);
  assert.equal(png.toString('ascii', 37, 41), 'IDAT');
  const idatLength = png.readUInt32BE(33);
  const raw = inflateSync(png.subarray(41, 41 + idatLength));
  assert.deepEqual([...raw], [0, 255, 0, 0, 255, 0, 0, 255, 128]);
});

test('drawIcon gera RGBA do tamanho pedido com cantos transparentes', () => {
  const pixels = drawIcon(16);
  assert.equal(pixels.length, 16 * 16 * 4);
  assert.equal(pixels[3], 0); // alfa do pixel (0, 0)
});

test('drawIcon desenha fundo azul e lupa branca', () => {
  const size = 128;
  const pixels = drawIcon(size);
  const at = (x, y) => [...pixels.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];
  assert.deepEqual(at(64, 115), [...BRAND_BLUE, 255]); // fundo, abaixo da lupa
  assert.deepEqual(at(81, 55), [255, 255, 255, 255]); // aro da lente
  assert.deepEqual(at(55, 55), [...BRAND_BLUE, 255]); // interior da lente
});
