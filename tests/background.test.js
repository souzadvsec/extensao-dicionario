import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CASA_XML } from './fixtures.js';

// API falsa de extensão: guarda os listeners registrados e as injeções pedidas.
const listeners = {};
const executed = [];
const createdMenus = [];

globalThis.chrome = {
  runtime: {
    getURL: (path) => `chrome-extension://teste/${path}`,
    onInstalled: { addListener: (listener) => { listeners.installed = listener; } },
    onMessage: { addListener: (listener) => { listeners.message = listener; } },
  },
  contextMenus: {
    create: (properties) => { createdMenus.push(properties); },
    onClicked: { addListener: (listener) => { listeners.clicked = listener; } },
  },
  scripting: {
    executeScript: async (details) => {
      executed.push(details);
      return [];
    },
  },
};

globalThis.fetch = async (url) => {
  if (url === 'chrome-extension://teste/content/tooltip.css') return { ok: true, text: async () => '.panel {}' };
  if (url === 'https://api.dicionario-aberto.net/word/casa') return { ok: true, json: async () => [{ xml: CASA_XML }] };
  throw new Error(`URL inesperada: ${url}`);
};

const { MENU_ID, CONTENT_FILES, TOOLTIP_CSS } = await import('../extension/background.js');

test('cria o item "Checar significado" para seleções ao instalar', () => {
  listeners.installed();
  assert.deepEqual(createdMenus, [{ id: 'checar-significado', title: 'Checar significado', contexts: ['selection'] }]);
});

test('ao clicar no menu injeta os scripts e abre o tooltip no frame certo', async () => {
  executed.length = 0;
  await listeners.clicked({ menuItemId: MENU_ID, selectionText: 'casa', frameId: 3 }, { id: 7 });

  assert.equal(executed.length, 2);
  assert.deepEqual(executed[0], { target: { tabId: 7, frameIds: [3] }, files: CONTENT_FILES });
  assert.deepEqual(executed[1].target, { tabId: 7, frameIds: [3] });
  assert.deepEqual(executed[1].args, ['casa', '.panel {}']);

  // A função injetada chama o tooltip que tooltip.js deixou em globalThis.
  globalThis.dicioTooltip = { open: mock.fn() };
  executed[1].func(...executed[1].args);
  assert.deepEqual(globalThis.dicioTooltip.open.mock.calls[0].arguments, ['casa', '.panel {}']);
});

test('usa o frame principal quando o clique não informa frameId', async () => {
  executed.length = 0;
  await listeners.clicked({ menuItemId: MENU_ID, selectionText: 'casa' }, { id: 7 });
  assert.deepEqual(executed[0].target, { tabId: 7, frameIds: [0] });
});

test('ignora cliques de outros itens de menu', async () => {
  executed.length = 0;
  await listeners.clicked({ menuItemId: 'outro', selectionText: 'casa' }, { id: 7 });
  assert.equal(executed.length, 0);
});

test('não lança erro quando a página não aceita scripts', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis.chrome.scripting, 'executeScript', async () => {
    throw new Error('Cannot access a chrome:// URL');
  });
  await listeners.clicked({ menuItemId: MENU_ID, selectionText: 'casa' }, { id: 7 });
  assert.equal(warn.mock.callCount(), 1);
});

test('responde buscas "dicio:lookup" de forma assíncrona', async () => {
  const response = await new Promise((resolve) => {
    const keepChannelOpen = listeners.message({ type: 'dicio:lookup', text: 'Casa' }, {}, resolve);
    assert.equal(keepChannelOpen, true);
  });
  assert.equal(response.status, 'found');
  assert.equal(response.word, 'casa');
});

test('ignora mensagens desconhecidas', () => {
  assert.equal(listeners.message({ type: 'outra' }, {}, () => {}), false);
});

test('os arquivos injetados existem na extensão', () => {
  for (const path of [...CONTENT_FILES, TOOLTIP_CSS]) {
    assert.ok(existsSync(new URL(`../extension/${path}`, import.meta.url)), path);
  }
});
