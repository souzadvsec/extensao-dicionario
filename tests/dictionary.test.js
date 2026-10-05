import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWord, lookupWord, API_BASE, MESSAGES } from '../extension/lib/dictionary.js';
import { CASA_XML } from './fixtures.js';

// fetch falso: responde só às URLs do mapa; o resto simula queda de rede.
function fakeFetch(routes) {
  const calls = [];
  async function fetchFn(url) {
    calls.push(url);
    const route = routes[url];
    if (!route) throw new TypeError(`Falha de rede simulada: ${url}`);
    const status = route.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => route.body };
  }
  return { fetchFn, calls };
}

test('normalizeWord deixa a palavra no formato da API', () => {
  assert.equal(normalizeWord('Casa'), 'casa');
  assert.equal(normalizeWord('  “Coração,”  '), 'coração');
  assert.equal(normalizeWord('casa[1]'), 'casa');
  assert.equal(normalizeWord('guarda-chuva'), 'guarda-chuva');
  assert.equal(normalizeWord("d'água"), "d'água");
  assert.equal(normalizeWord('café'), 'café'); // acento decomposto → NFC
});

test('normalizeWord rejeita o que não é uma única palavra', () => {
  for (const text of ['uma casa', '', '   ', '123', 'a1b', 'a'.repeat(41), undefined, null]) {
    assert.equal(normalizeWord(text), null, `entrada: ${String(text)}`);
  }
});

test('lookupWord retorna os verbetes encontrados', async () => {
  const { fetchFn, calls } = fakeFetch({ [`${API_BASE}/word/casa`]: { body: [{ xml: CASA_XML }] } });
  const result = await lookupWord('Casa,', { fetchFn });
  assert.equal(result.status, 'found');
  assert.equal(result.word, 'casa');
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].headword, 'Casa');
  assert.deepEqual(calls, [`${API_BASE}/word/casa`]);
});

test('lookupWord codifica acentos na URL', async () => {
  const { fetchFn, calls } = fakeFetch({ [`${API_BASE}/word/caf%C3%A9`]: { body: [{ xml: CASA_XML }] } });
  await lookupWord('Café', { fetchFn });
  assert.deepEqual(calls, [`${API_BASE}/word/caf%C3%A9`]);
});

test('lookupWord sugere palavras próximas quando não há verbete', async () => {
  const { fetchFn } = fakeFetch({
    [`${API_BASE}/word/casas`]: { body: [] },
    [`${API_BASE}/near/casas`]: { body: ['casas', 'canas', 'casa', 'casal', 'casar', 'cassa', 'caspa'] },
  });
  assert.deepEqual(await lookupWord('casas', { fetchFn }), {
    status: 'not-found',
    word: 'casas',
    suggestions: ['canas', 'casa', 'casal', 'casar', 'cassa'],
  });
});

test('lookupWord ignora verbetes sem acepções', async () => {
  const { fetchFn } = fakeFetch({
    [`${API_BASE}/word/casa`]: { body: [{ xml: '<entry><form><orth>Casa</orth></form></entry>' }] },
    [`${API_BASE}/near/casa`]: { body: [] },
  });
  assert.deepEqual(await lookupWord('casa', { fetchFn }), { status: 'not-found', word: 'casa', suggestions: [] });
});

test('lookupWord segue sem sugestões se /near falhar', async () => {
  const { fetchFn } = fakeFetch({
    [`${API_BASE}/word/casas`]: { body: [] },
    [`${API_BASE}/near/casas`]: { status: 500 },
  });
  assert.deepEqual(await lookupWord('casas', { fetchFn }), { status: 'not-found', word: 'casas', suggestions: [] });
});

test('lookupWord rejeita seleções inválidas sem chamar a API', async () => {
  const { fetchFn, calls } = fakeFetch({});
  assert.deepEqual(await lookupWord('duas palavras', { fetchFn }), { status: 'invalid', message: MESSAGES.invalid });
  assert.equal(calls.length, 0);
});

test('lookupWord transforma falhas HTTP e de rede em erro amigável', async () => {
  const expected = { status: 'error', word: 'casa', message: MESSAGES.error };
  const httpError = fakeFetch({ [`${API_BASE}/word/casa`]: { status: 503 } });
  assert.deepEqual(await lookupWord('casa', { fetchFn: httpError.fetchFn }), expected);
  const offline = fakeFetch({});
  assert.deepEqual(await lookupWord('casa', { fetchFn: offline.fetchFn }), expected);
});

test('lookupWord desiste após o tempo limite', async () => {
  const hangingFetch = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('abortado')));
    });
  assert.deepEqual(await lookupWord('casa', { fetchFn: hangingFetch, timeoutMs: 20 }), {
    status: 'error',
    word: 'casa',
    message: MESSAGES.error,
  });
});
