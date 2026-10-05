import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../extension/content/position.js';

const { computeTooltipPosition } = globalThis.dicioPosition;
const viewport = { width: 1000, height: 800 };
const tooltip = { width: 300, height: 200 };

test('posiciona abaixo da palavra, alinhado à esquerda', () => {
  const anchor = { top: 100, bottom: 120, left: 50 };
  assert.deepEqual(computeTooltipPosition({ anchor, tooltip, viewport }), { top: 128, left: 50, placement: 'below' });
});

test('vira para cima quando não cabe abaixo', () => {
  const anchor = { top: 700, bottom: 720, left: 50 };
  assert.deepEqual(computeTooltipPosition({ anchor, tooltip, viewport }), { top: 492, left: 50, placement: 'above' });
});

test('não ultrapassa a borda direita', () => {
  const anchor = { top: 100, bottom: 120, left: 900 };
  assert.equal(computeTooltipPosition({ anchor, tooltip, viewport }).left, 692);
});

test('não ultrapassa a borda esquerda', () => {
  const anchor = { top: 100, bottom: 120, left: -20 };
  assert.equal(computeTooltipPosition({ anchor, tooltip, viewport }).left, 8);
});

test('escolhe o lado com mais espaço quando não cabe em nenhum', () => {
  const anchor = { top: 500, bottom: 520, left: 50 };
  const tall = { width: 300, height: 550 };
  assert.deepEqual(computeTooltipPosition({ anchor, tooltip: tall, viewport: { width: 1000, height: 600 } }), {
    top: 8,
    left: 50,
    placement: 'above',
  });
});

test('tooltip maior que a viewport fica preso no canto superior esquerdo', () => {
  const anchor = { top: 10, bottom: 30, left: 10 };
  assert.deepEqual(computeTooltipPosition({ anchor, tooltip, viewport: { width: 200, height: 150 } }), {
    top: 8,
    left: 8,
    placement: 'below',
  });
});
