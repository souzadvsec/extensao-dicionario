# Dicionário Rápido (extensão Chrome/Firefox) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** Extensão Manifest V3 para Chrome e Firefox: o usuário seleciona uma palavra, clica com o botão direito em **"Checar significado"** e vê a definição em português num tooltip flutuante perto da palavra, com botão de fechar.

**Arquitetura:** Um único `manifest.json` híbrido serve aos dois navegadores (`background.service_worker` para o Chrome, `background.scripts` para o Firefox, ambos como módulo ES). O background cria o menu de contexto, injeta o content script **sob demanda** (`activeTab` + `scripting`) só na aba onde o usuário clicou e faz as consultas HTTP ao Dicionário Aberto. O content script desenha o tooltip num Shadow DOM fechado, isolado do CSS da página, e pede as definições ao background por mensagem.

**Tecnologias:** JavaScript puro (ES2022), WebExtensions MV3, Shadow DOM, CSS com custom properties. Testes com `node:test` (Node ≥ 22). Zero dependências npm em runtime e nos testes. `web-ext` (via `npx`) apenas para lint do Firefox.

## Restrições globais

- Manifest V3. Navegadores mínimos: **Chrome 121** (aceita o manifesto híbrido) e **Firefox 140** (`data_collection_permissions`).
- Sem bundler e sem build: a pasta `extension/` é carregada diretamente no navegador.
- Texto do item de menu: exatamente `Checar significado`. Toda a UI em português do Brasil.
- API: Dicionário Aberto, `https://api.dicionario-aberto.net`, endpoints `/word/{palavra}` e `/near/{palavra}`. O conteúdo é CC BY-SA 2.5 PT, então o tooltip **sempre** mostra o link "Fonte: Dicionário Aberto".
- Segurança: dados da API **nunca** passam por `innerHTML`. Use só `textContent`, `append` e `setAttribute`.
- Namespace cross-browser: `const api = globalThis.browser ?? globalThis.chrome;`. Nada de polyfill.
- Identificadores em inglês, textos de UI e comentários em português (comentários curtos, só onde o "porquê" não é óbvio).
- Commits no padrão Conventional Commits, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Contexto que o executor precisa saber

**Fatos verificados em 2026-10-05:**

- `GET https://api.dicionario-aberto.net/word/casa` → `200`, `Access-Control-Allow-Origin: *`, corpo = array de objetos; o campo útil é `xml` (TEI simplificado):
  ```xml
  <entry id="casa">
  <form><orth>Casa</orth></form>
  <sense>
  <gramGrp>f.</gramGrp>
  <def>
  Edifício para habitação: _uma casa moderna_.
  Morada, moradia, vivenda: _vou para minha casa_.
  </def>
  </sense>
  <sense ast="1"><usg type="style">Gír.</usg><def>
  _Café frio_, xícara de vinho.
  </def></sense>
  <etym orig="Lat">(Lat. _casa_)</etym>
  </entry>
  ```
  - Cada **linha** dentro de `<def>` é uma acepção. `_texto_` marca exemplos em itálico. `^2` remete a homônimo. Algumas respostas usam CRLF.
  - Palavras com homônimos (ex.: `manga`) retornam **várias** entradas no array.
- A API **diferencia maiúsculas** (`/word/Casa` → `[]`) e **não conhece flexões** (`casas`, `correu` → `[]`).
- `GET /near/casas` → `["canas","casa","casal","casar","cassa"]`; `/near/correu` → `["coreu","corre","correr","corréu"]`. Servem de sugestões quando não há verbete.
- Página pública de busca: `https://dicionario-aberto.net/search/{palavra}` (200).
- Firefox **não** suporta `background.service_worker`. A partir do 121 ele ignora essa chave e usa `background.scripts`. O Chrome 121+ ignora `background.scripts`. `background.type: "module"` existe desde o Chrome 92 e o Firefox 112.
- A AMO exige `browser_specific_settings.gecko.data_collection_permissions` em extensões novas desde 2025-11-03 (Firefox 140+). Enviar o texto selecionado a terceiros se enquadra em `websiteContent`.
- O service worker do Chrome **não tem `DOMParser`**, por isso o parser do XML usa regex.
- O Chrome **não** aceita SVG em `icons`, por isso os ícones são PNG.

**Decisões de arquitetura:**

| Decisão | Escolha | Motivo |
|---|---|---|
| Injeção do content script | `activeTab` + `scripting.executeScript` no clique | Evita a permissão "ler e alterar dados em todos os sites"; o script só roda quando o usuário pede |
| Onde buscar na API | No background | `host_permissions` dispensam CORS e o fetch não sofre com a CSP da página |
| Isolamento visual | `<dicio-tooltip>` + Shadow DOM `closed`, estilos do host com `!important` | O CSS da página não quebra o tooltip, e o tooltip não vaza estilo para a página |
| Entrega do CSS | Background lê `content/tooltip.css` e passa o texto ao content script, que cria `<style>` no shadow root | O CSS fica num arquivo `.css` de verdade, sem `web_accessible_resources` |
| Palavra flexionada | Mostrar até 5 sugestões clicáveis vindas de `/near/` | Sem isso, "casas" ou "correu" nunca encontrariam nada |

**Fluxo:**

```
seleciona → botão direito → "Checar significado"
background.js  contextMenus.onClicked
  ├─ fetch(runtime.getURL('content/tooltip.css')) → texto do CSS
  ├─ scripting.executeScript({ files: ['content/position.js', 'content/tooltip.js'] })
  └─ scripting.executeScript({ func: dicioTooltip.open, args: [textoSelecionado, css] })
tooltip.js     cria o tooltip perto da seleção, mostra "Buscando…"
  └─ runtime.sendMessage({ type: 'dicio:lookup', text })
background.js  runtime.onMessage → lookupWord(text) → /word (e /near se vazio)
tooltip.js     ← { status: 'found' | 'not-found' | 'invalid' | 'error', ... } → renderiza
```

## Estrutura de arquivos

```
extensao-dicionario/
├── package.json                  # só dev: "type": "module", scripts test/icons/lint
├── .gitignore
├── README.md                     # como carregar no Chrome/Firefox, testes, limitações, créditos
├── scripts/
│   ├── png.js                    # drawIcon() + encodePng() — puros, testados
│   └── generate-icons.js         # CLI: grava extension/icons/*.png
├── extension/                    # ← pasta carregada no navegador
│   ├── manifest.json
│   ├── background.js             # módulo ES: menu, injeção, mensagens
│   ├── lib/
│   │   ├── parse-entry.js        # XML do verbete → { headword, senses, etymology }
│   │   └── dictionary.js         # normalizeWord() + lookupWord() (fetch, timeout, sugestões)
│   ├── content/
│   │   ├── position.js           # script clássico: computeTooltipPosition() puro
│   │   ├── tooltip.js            # script clássico: UI do tooltip (Shadow DOM)
│   │   └── tooltip.css           # visual do tooltip (claro/escuro)
│   └── icons/
│       └── icon-16.png, icon-32.png, icon-48.png, icon-128.png
└── tests/
    ├── fixtures.js               # XMLs reais da API
    ├── parse-entry.test.js
    ├── dictionary.test.js
    ├── png.test.js
    ├── position.test.js
    ├── manifest.test.js
    └── background.test.js
```

`content/*.js` são **scripts clássicos** (content scripts não podem usar `import` estático). Eles publicam suas APIs em `globalThis` (`dicioPosition`, `dicioTooltip`) e não usam `import`/`export`, então os testes conseguem importá-los pelo efeito colateral.

---

### Task 1: Base do projeto + parser do verbete

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `tests/fixtures.js`
- Create: `extension/lib/parse-entry.js`
- Test: `tests/parse-entry.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `parseEntryXml(xml: string | undefined): Entry`, com
    `Entry = { headword: string | null, senses: Sense[], etymology: string | null }` e
    `Sense = { grammar: string | null, usage: string | null, definitions: string[] }`.
  - `tests/fixtures.js` exporta `CASA_XML`, `CAFE_XML` (CRLF), `MANGA_XML` (strings).

- [ ] **Step 1: Garantir Node ≥ 22**

Run: `node --version`
Expected: `v22.x` ou maior. Se o comando não existir (era o caso em 2026-10-05), instale:

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

Depois reinicie o terminal ou o VS Code. Se precisar continuar na mesma sessão do PowerShell, recarregue o PATH com:

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
```

Run de novo: `node --version` → `v22.x`+ e `npm --version` → qualquer versão.

- [ ] **Step 2: Criar `package.json`**

```json
{
  "name": "extensao-dicionario",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Extensão Chrome/Firefox (Manifest V3) que mostra o significado de palavras em português.",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "test": "node --test",
    "icons": "node scripts/generate-icons.js",
    "lint:firefox": "npx --yes web-ext lint --source-dir extension"
  }
}
```

`node --test` sem argumentos roda todos os `**/*.test.js` (ignorando `node_modules`).

- [ ] **Step 3: Criar `.gitignore`**

```gitignore
node_modules/
web-ext-artifacts/
*.zip
*.xpi
```

- [ ] **Step 4: Criar `tests/fixtures.js`**

```js
// Trechos reais de respostas de https://api.dicionario-aberto.net/word/{palavra}

export const CASA_XML = [
  '<entry id="casa">',
  '<form>',
  '<orth>Casa</orth>',
  '</form>',
  '<sense>',
  '<gramGrp>f.</gramGrp>',
  '<def>',
  'Edifício para habitação: _uma casa moderna_.',
  'Morada, moradia, vivenda: _vou para minha casa_.',
  '</def>',
  '</sense>',
  '<sense ast="1">',
  '<def>',
  '_Casa de saúde_, hospital particular, em que os doentes pagam o tratamento.',
  '</def>',
  '</sense>',
  '<etym orig="Lat">(Lat. _casa_)</etym>',
  '</entry>',
].join('\n');

export const CAFE_XML = [
  '<entry id="café">',
  '<form>',
  '<orth>Café</orth>',
  '</form>',
  '<sense>',
  '<gramGrp>m.</gramGrp>',
  '<def>',
  'Semente de cafezeiro.',
  'Infusão dessa semente, depois de torrada e moída.',
  '</def>',
  '</sense>',
  '<sense ast="1">',
  '<usg type="style">Gír.</usg>',
  '<def>',
  '_Café frio_, xícara de vinho.',
  '</def>',
  '</sense>',
  '<etym orig="ár">(Do ár. _cahua_)</etym>',
  '</entry>',
].join('\r\n');

export const MANGA_XML = [
  '<entry n="1" id="manga:1" type="hom">',
  '<form>',
  '<orth>Manga</orth>',
  '</form>',
  '<sense>',
  '<gramGrp>f.</gramGrp>',
  '<def>',
  'Filtro afunilado, para líquidos.',
  'Mangueira^2.',
  '</def>',
  '</sense>',
  '</entry>',
].join('\n');
```

- [ ] **Step 5: Escrever o teste que falha — `tests/parse-entry.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEntryXml } from '../extension/lib/parse-entry.js';
import { CASA_XML, CAFE_XML, MANGA_XML } from './fixtures.js';

test('extrai verbete, classe gramatical, acepções e etimologia', () => {
  assert.deepEqual(parseEntryXml(CASA_XML), {
    headword: 'Casa',
    senses: [
      {
        grammar: 'f.',
        usage: null,
        definitions: [
          'Edifício para habitação: uma casa moderna.',
          'Morada, moradia, vivenda: vou para minha casa.',
        ],
      },
      {
        grammar: null,
        usage: null,
        definitions: ['Casa de saúde, hospital particular, em que os doentes pagam o tratamento.'],
      },
    ],
    etymology: '(Lat. casa)',
  });
});

test('aceita quebras de linha CRLF e marca de uso (usg)', () => {
  assert.deepEqual(parseEntryXml(CAFE_XML).senses, [
    {
      grammar: 'm.',
      usage: null,
      definitions: ['Semente de cafezeiro.', 'Infusão dessa semente, depois de torrada e moída.'],
    },
    { grammar: null, usage: 'Gír.', definitions: ['Café frio, xícara de vinho.'] },
  ]);
});

test('remove remissões a homônimos (^2) e aceita verbete sem etimologia', () => {
  const entry = parseEntryXml(MANGA_XML);
  assert.deepEqual(entry.senses[0].definitions, ['Filtro afunilado, para líquidos.', 'Mangueira.']);
  assert.equal(entry.etymology, null);
});

test('decodifica entidades XML e remove tags internas', () => {
  const xml =
    '<entry><form><orth>Teste</orth></form><sense><def>\n' +
    'Ver <ref>casa</ref> &amp; &lt;lar&gt;: &#233; &#xE9;.\n' +
    '</def></sense></entry>';
  assert.deepEqual(parseEntryXml(xml).senses[0].definitions, ['Ver casa & <lar>: é é.']);
});

test('descarta acepções vazias e tolera entrada inválida', () => {
  assert.deepEqual(parseEntryXml('<entry><sense><gramGrp>m.</gramGrp></sense></entry>').senses, []);
  assert.deepEqual(parseEntryXml(undefined), { headword: null, senses: [], etymology: null });
});
```

- [ ] **Step 6: Rodar o teste e confirmar que falha**

Run: `node --test tests/parse-entry.test.js`
Expected: FAIL com `ERR_MODULE_NOT_FOUND` (arquivo `extension/lib/parse-entry.js` não existe).

- [ ] **Step 7: Implementar `extension/lib/parse-entry.js`**

```js
// Converte o XML (TEI simplificado) de um verbete do Dicionário Aberto em dados simples.
// Usa regex porque o service worker do Chrome não tem DOMParser.

/**
 * @typedef {{ grammar: string|null, usage: string|null, definitions: string[] }} Sense
 * @typedef {{ headword: string|null, senses: Sense[], etymology: string|null }} Entry
 */

/** @returns {Entry} */
export function parseEntryXml(xml) {
  const source = typeof xml === 'string' ? xml : '';
  return {
    headword: cleanText(firstTag(source, 'orth')) || null,
    senses: allTags(source, 'sense')
      .map(parseSense)
      .filter((sense) => sense.definitions.length > 0),
    etymology: cleanText(firstTag(source, 'etym')) || null,
  };
}

function parseSense(senseXml) {
  return {
    grammar: cleanText(firstTag(senseXml, 'gramGrp')) || null,
    usage: cleanText(firstTag(senseXml, 'usg')) || null,
    // Cada linha dentro de <def> é uma acepção.
    definitions: (firstTag(senseXml, 'def') ?? '').split(/\r?\n/).map(cleanText).filter(Boolean),
  };
}

function allTags(xml, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  return Array.from(xml.matchAll(pattern), (match) => match[1]);
}

function firstTag(xml, tag) {
  return allTags(xml, tag)[0] ?? null;
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function cleanText(fragment) {
  if (!fragment) return '';
  return fragment
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, decodeEntity)
    .replace(/_/g, '') // _itálico_ dos exemplos
    .replace(/\^\d+/g, '') // remissão a homônimo: "Mangueira^2"
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntity(match, name) {
  if (name[0] !== '#') return NAMED_ENTITIES[name.toLowerCase()] ?? match;
  const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
  return Number.isInteger(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
}
```

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Run: `node --test tests/parse-entry.test.js`
Expected: PASS, 5 testes, 0 falhas.

- [ ] **Step 9: Commit**

```bash
git add package.json .gitignore tests/fixtures.js tests/parse-entry.test.js extension/lib/parse-entry.js
git commit -m "feat: parser do XML de verbetes do Dicionário Aberto" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Cliente do dicionário (normalização, busca, sugestões)

**Files:**
- Create: `extension/lib/dictionary.js`
- Test: `tests/dictionary.test.js`

**Interfaces:**
- Consumes: `parseEntryXml` de `extension/lib/parse-entry.js`; `CASA_XML` de `tests/fixtures.js`.
- Produces:
  - `normalizeWord(text: unknown): string | null`: forma usada pela API (minúsculas, NFC, sem pontuação nas pontas) ou `null` se não for uma única palavra.
  - `lookupWord(text: string, options?: { fetchFn?: typeof fetch, timeoutMs?: number }): Promise<LookupResult>`, que **nunca rejeita**:
    ```
    LookupResult =
      | { status: 'found',     word: string, entries: Entry[] }
      | { status: 'not-found', word: string, suggestions: string[] }   // até 5
      | { status: 'invalid',   message: string }
      | { status: 'error',     word: string, message: string }
    ```
  - `API_BASE = 'https://api.dicionario-aberto.net'`, `MESSAGES = { invalid, error }`.

- [ ] **Step 1: Escrever o teste que falha — `tests/dictionary.test.js`**

```js
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/dictionary.test.js`
Expected: FAIL com `ERR_MODULE_NOT_FOUND` (`extension/lib/dictionary.js`).

- [ ] **Step 3: Implementar `extension/lib/dictionary.js`**

```js
// Cliente do Dicionário Aberto (https://dicionario-aberto.net), usado pelo background.
import { parseEntryXml } from './parse-entry.js';

export const API_BASE = 'https://api.dicionario-aberto.net';

export const MESSAGES = {
  invalid: 'Selecione apenas uma palavra (sem números ou símbolos).',
  error: 'Não foi possível consultar o dicionário. Verifique sua conexão e tente novamente.',
};

const MAX_WORD_LENGTH = 40;
const MAX_SUGGESTIONS = 5;
// Letras, com hífen ou apóstrofo internos: "guarda-chuva", "d'água".
const WORD_PATTERN = /^\p{L}+(?:[-'’]\p{L}+)*$/u;
const EDGE_NON_LETTERS = /^[^\p{L}]+|[^\p{L}]+$/gu;

/** Forma da palavra usada pela API, ou null se o texto não for uma única palavra. */
export function normalizeWord(text) {
  if (typeof text !== 'string') return null;
  const word = text.normalize('NFC').trim().replace(EDGE_NON_LETTERS, '');
  if (word.length === 0 || word.length > MAX_WORD_LENGTH || !WORD_PATTERN.test(word)) return null;
  return word.toLocaleLowerCase('pt-BR');
}

/** Busca o significado de `text`. Nunca rejeita: falhas viram { status: 'error' }. */
export async function lookupWord(text, { fetchFn = (...args) => globalThis.fetch(...args), timeoutMs = 8000 } = {}) {
  const word = normalizeWord(text);
  if (!word) return { status: 'invalid', message: MESSAGES.invalid };

  try {
    const rows = await getJson(`${API_BASE}/word/${encodeURIComponent(word)}`, fetchFn, timeoutMs);
    const entries = (Array.isArray(rows) ? rows : [])
      .map((row) => parseEntryXml(row?.xml))
      .filter((entry) => entry.senses.length > 0);
    if (entries.length > 0) return { status: 'found', word, entries };

    // Sem verbete (plurais, verbos conjugados…): sugere palavras próximas.
    const near = await getJson(`${API_BASE}/near/${encodeURIComponent(word)}`, fetchFn, timeoutMs).catch(() => []);
    const suggestions = (Array.isArray(near) ? near : [])
      .filter((item) => typeof item === 'string' && item !== word)
      .slice(0, MAX_SUGGESTIONS);
    return { status: 'not-found', word, suggestions };
  } catch {
    return { status: 'error', word, message: MESSAGES.error };
  }
}

async function getJson(url, fetchFn, timeoutMs) {
  // setTimeout + AbortController (e não AbortSignal.timeout) para o timer manter o Node vivo nos testes.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test tests/dictionary.test.js`
Expected: PASS, 10 testes, 0 falhas.

Run: `npm test`
Expected: PASS em todos os arquivos (`parse-entry` + `dictionary`).

- [ ] **Step 5: Commit**

```bash
git add extension/lib/dictionary.js tests/dictionary.test.js
git commit -m "feat: cliente do Dicionário Aberto com normalização, timeout e sugestões" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Ícones PNG

**Files:**
- Create: `scripts/png.js`
- Create: `scripts/generate-icons.js`
- Create (gerados): `extension/icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`
- Test: `tests/png.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `encodePng(width: number, height: number, rgba: Uint8Array | number[]): Buffer`: PNG RGBA 8 bits.
  - `drawIcon(size: number): Uint8Array`: `size*size*4` bytes RGBA, com lupa branca sobre quadrado arredondado azul.
  - `BRAND_BLUE = [37, 99, 235]` (`#2563eb`).
  - Arquivos `extension/icons/icon-{16,32,48,128}.png` (usados pelo manifest na Task 5).

- [ ] **Step 1: Escrever o teste que falha — `tests/png.test.js`**

```js
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/png.test.js`
Expected: FAIL com `ERR_MODULE_NOT_FOUND` (`scripts/png.js`).

- [ ] **Step 3: Implementar `scripts/png.js`**

```js
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
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/png.test.js`
Expected: PASS, 4 testes, 0 falhas.

- [ ] **Step 5: Criar `scripts/generate-icons.js`**

```js
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
```

- [ ] **Step 6: Gerar os ícones e conferir visualmente**

Run: `npm run icons`
Expected: 4 linhas `ícone gerado: extension/icons/icon-N.png` e os 4 arquivos criados.

Abra `extension/icons/icon-128.png` (no VS Code ou com a ferramenta Read). Deve aparecer um quadrado azul de cantos arredondados com uma lupa branca (aro + cabo diagonal para baixo e para a direita), sem serrilhado forte. Abra também `icon-16.png`: a lupa precisa continuar reconhecível.

- [ ] **Step 7: Commit**

```bash
git add scripts/png.js scripts/generate-icons.js tests/png.test.js extension/icons
git commit -m "feat: ícones PNG da extensão gerados por script sem dependências" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Tooltip (posicionamento, UI em Shadow DOM e CSS)

**Files:**
- Create: `extension/content/position.js`
- Create: `extension/content/tooltip.css`
- Create: `extension/content/tooltip.js`
- Test: `tests/position.test.js`

**Interfaces:**
- Consumes: o contrato de mensagens do background (implementado na Task 5). O content script envia `{ type: 'dicio:lookup', text: string }` via `runtime.sendMessage` e recebe um `LookupResult` (definido na Task 2). Campos usados: `status`, `word`, `entries[].senses[].{grammar, usage, definitions}`, `entries[].etymology`, `suggestions`, `message`.
- Produces:
  - `globalThis.dicioPosition.computeTooltipPosition({ anchor: {top, bottom, left}, tooltip: {width, height}, viewport: {width, height}, gap = 8, margin = 8 }) → { top: number, left: number, placement: 'below' | 'above' }` (coordenadas da viewport).
  - `globalThis.dicioTooltip.open(text: string, css: string): void` e `globalThis.dicioTooltip.close(): void`.
  - Ordem de injeção exigida: `content/position.js` antes de `content/tooltip.js`.

- [ ] **Step 1: Escrever o teste que falha — `tests/position.test.js`**

```js
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/position.test.js`
Expected: FAIL com `ERR_MODULE_NOT_FOUND` (`extension/content/position.js`).

- [ ] **Step 3: Implementar `extension/content/position.js`**

```js
// Cálculo puro da posição do tooltip, em coordenadas da viewport.
// Script clássico: injetado antes de tooltip.js e importado pelos testes (sem import/export).
(function (root) {
  function computeTooltipPosition({ anchor, tooltip, viewport, gap = 8, margin = 8 }) {
    const spaceBelow = viewport.height - anchor.bottom - gap - margin;
    const spaceAbove = anchor.top - gap - margin;
    const placement = tooltip.height <= spaceBelow || spaceBelow >= spaceAbove ? 'below' : 'above';
    const top = placement === 'below' ? anchor.bottom + gap : anchor.top - gap - tooltip.height;
    return {
      top: clamp(top, margin, viewport.height - tooltip.height - margin),
      left: clamp(anchor.left, margin, viewport.width - tooltip.width - margin),
      placement,
    };
  }

  // Se não couber, o limite mínimo vence: o canto superior esquerdo fica visível.
  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  root.dicioPosition = { computeTooltipPosition };
})(globalThis);
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/position.test.js`
Expected: PASS, 6 testes, 0 falhas.

- [ ] **Step 5: Criar `extension/content/tooltip.css`**

```css
/* Visual do tooltip. Carregado como <style> dentro do Shadow DOM (isolado da página). */
:host {
  --dicio-bg: #ffffff;
  --dicio-fg: #1f2937;
  --dicio-muted: #6b7280;
  --dicio-border: #e5e7eb;
  --dicio-accent: #2563eb;
  --dicio-accent-soft: #eff6ff;
  --dicio-danger: #b91c1c;
  --dicio-shadow: 0 10px 30px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.08);
}

@media (prefers-color-scheme: dark) {
  :host {
    --dicio-bg: #1f2937;
    --dicio-fg: #f3f4f6;
    --dicio-muted: #9ca3af;
    --dicio-border: #374151;
    --dicio-accent: #93c5fd;
    --dicio-accent-soft: #1e3a8a;
    --dicio-danger: #fca5a5;
    --dicio-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  }
}

.panel {
  box-sizing: border-box;
  width: max-content;
  min-width: 220px;
  max-width: min(340px, calc(100vw - 16px));
  overflow: hidden;
  background: var(--dicio-bg);
  color: var(--dicio-fg);
  border: 1px solid var(--dicio-border);
  border-radius: 12px;
  box-shadow: var(--dicio-shadow);
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  text-align: left;
  animation: dicio-in 120ms ease-out;
}

@keyframes dicio-in {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
}

@media (prefers-reduced-motion: reduce) {
  .panel {
    animation: none;
  }
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 10px 8px 14px;
  border-bottom: 1px solid var(--dicio-border);
}

.word {
  font-size: 15px;
  font-weight: 650;
  overflow-wrap: anywhere;
}

.close {
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--dicio-muted);
  font: 20px/1 system-ui, sans-serif;
  cursor: pointer;
}

.close:hover {
  background: var(--dicio-accent-soft);
  color: var(--dicio-fg);
}

.close:focus-visible,
.suggestion:focus-visible,
.source:focus-visible {
  outline: 2px solid var(--dicio-accent);
  outline-offset: 2px;
}

.body {
  max-height: 260px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 10px 14px 12px;
}

.entry {
  counter-reset: dicio-def;
}

.entry + .entry {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--dicio-border);
}

.sense + .sense {
  margin-top: 8px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 4px;
}

.tag {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--dicio-accent-soft);
  color: var(--dicio-accent);
  font-size: 11px;
  font-weight: 600;
  font-style: italic;
}

.defs {
  margin: 0;
  padding: 0;
  list-style: none;
}

.defs li {
  position: relative;
  padding-left: 22px;
  counter-increment: dicio-def;
}

.defs li + li {
  margin-top: 3px;
}

.defs li::before {
  content: counter(dicio-def) ".";
  position: absolute;
  left: 0;
  color: var(--dicio-muted);
  font-variant-numeric: tabular-nums;
}

.etym {
  margin: 8px 0 0;
  color: var(--dicio-muted);
  font-size: 12px;
  font-style: italic;
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.status-error {
  color: var(--dicio-danger);
}

.spinner {
  flex: none;
  width: 14px;
  height: 14px;
  border: 2px solid var(--dicio-border);
  border-top-color: var(--dicio-accent);
  border-radius: 50%;
  animation: dicio-spin 700ms linear infinite;
}

@keyframes dicio-spin {
  to {
    transform: rotate(360deg);
  }
}

.hint {
  margin: 10px 0 6px;
  color: var(--dicio-muted);
  font-size: 12px;
}

.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.suggestion {
  padding: 3px 10px;
  border: 1px solid var(--dicio-border);
  border-radius: 999px;
  background: transparent;
  color: var(--dicio-accent);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.suggestion:hover {
  background: var(--dicio-accent-soft);
}

.footer {
  padding: 6px 14px 8px;
  border-top: 1px solid var(--dicio-border);
  font-size: 11px;
}

.source {
  color: var(--dicio-muted);
  text-decoration: none;
}

.source:hover {
  color: var(--dicio-accent);
  text-decoration: underline;
}
```

- [ ] **Step 6: Criar `extension/content/tooltip.js`**

```js
// Content script da interface: tooltip flutuante com o significado da palavra.
// Injetado sob demanda pelo background; pode ser injetado várias vezes na mesma página.
(() => {
  if (globalThis.dicioTooltip) return;

  const api = globalThis.browser ?? globalThis.chrome;
  const SEARCH_URL = 'https://dicionario-aberto.net/search/';
  const MAX_TITLE_LENGTH = 40;
  const TEXT = {
    loading: 'Buscando significado…',
    notFound: (word) => `Nenhum significado encontrado para “${word}”.`,
    suggestions: 'Você quis dizer:',
    error: 'Não foi possível consultar o dicionário. Verifique sua conexão e tente novamente.',
    close: 'Fechar',
    source: 'Fonte: Dicionário Aberto',
  };

  let current = null;

  function open(text, css) {
    close();
    const host = document.createElement('dicio-tooltip');
    setImportantStyles(host, {
      all: 'initial',
      display: 'block',
      position: 'absolute',
      top: '0px',
      left: '0px',
      'z-index': '2147483647',
    });
    const root = host.attachShadow({ mode: 'closed' });

    const title = el('span', { class: 'word' });
    const closeButton = el('button', { class: 'close', type: 'button', 'aria-label': TEXT.close, title: TEXT.close }, '×');
    const body = el('div', { class: 'body', 'aria-live': 'polite' });
    const source = el('a', { class: 'source', href: SEARCH_URL, target: '_blank', rel: 'noopener noreferrer' }, TEXT.source);
    const panel = el(
      'div',
      { class: 'panel', role: 'dialog' },
      el('div', { class: 'header' }, title, closeButton),
      body,
      el('div', { class: 'footer' }, source),
    );
    root.append(el('style', {}, css), panel);
    document.documentElement.append(host);

    current = { host, panel, title, body, source, anchor: captureAnchor(), token: null };
    closeButton.addEventListener('click', close);
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('pointerdown', onPointerdown, true);
    lookup(text);
  }

  function close() {
    if (!current) return;
    current.host.remove();
    document.removeEventListener('keydown', onKeydown, true);
    document.removeEventListener('pointerdown', onPointerdown, true);
    current = null;
  }

  function onKeydown(event) {
    if (event.key === 'Escape') close();
  }

  function onPointerdown(event) {
    if (current && !event.composedPath().includes(current.host)) close();
  }

  async function lookup(text) {
    const token = {};
    current.token = token;
    showWord(text.trim().replace(/\s+/g, ' '));
    render(el('p', { class: 'status' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), TEXT.loading));

    let result = null;
    try {
      result = await api.runtime.sendMessage({ type: 'dicio:lookup', text });
    } catch {
      // Sem resposta do background: cai no erro genérico abaixo.
    }
    if (current?.token !== token) return; // tooltip fechado ou outra busca começou
    if (result?.word) showWord(result.word);
    render(...renderResult(result));
  }

  function showWord(word) {
    const label = word.length > MAX_TITLE_LENGTH ? `${word.slice(0, MAX_TITLE_LENGTH - 1)}…` : word;
    current.title.textContent = label;
    current.panel.setAttribute('aria-label', `Significado de ${label}`);
    current.source.href = SEARCH_URL + encodeURIComponent(word);
  }

  function renderResult(result) {
    switch (result?.status) {
      case 'found':
        return result.entries.map(renderEntry);
      case 'not-found':
        return renderNotFound(result);
      case 'invalid':
        return [el('p', { class: 'status' }, result.message)];
      default:
        return [el('p', { class: 'status status-error' }, result?.message ?? TEXT.error)];
    }
  }

  function renderEntry(entry) {
    const section = el('section', { class: 'entry' });
    for (const sense of entry.senses) {
      const tags = [sense.grammar, sense.usage].filter(Boolean).map((tag) => el('span', { class: 'tag' }, tag));
      const definitions = el('ol', { class: 'defs' }, ...sense.definitions.map((definition) => el('li', {}, definition)));
      section.append(
        el('div', { class: 'sense' }, ...(tags.length > 0 ? [el('div', { class: 'tags' }, ...tags)] : []), definitions),
      );
    }
    if (entry.etymology) section.append(el('p', { class: 'etym' }, entry.etymology));
    return section;
  }

  function renderNotFound({ word, suggestions }) {
    const nodes = [el('p', { class: 'status' }, TEXT.notFound(word))];
    if (suggestions.length > 0) {
      const buttons = suggestions.map((suggestion) => {
        const button = el('button', { class: 'suggestion', type: 'button' }, suggestion);
        button.addEventListener('click', () => lookup(suggestion));
        return button;
      });
      nodes.push(el('p', { class: 'hint' }, TEXT.suggestions), el('div', { class: 'suggestions' }, ...buttons));
    }
    return nodes;
  }

  function render(...nodes) {
    current.body.replaceChildren(...nodes);
    place();
  }

  // Retângulo da seleção; em <input>/<textarea> usa o próprio campo; sem nada, o topo da página.
  function captureAnchor() {
    const selection = window.getSelection();
    const selectionRect = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).getBoundingClientRect() : null;
    const active = document.activeElement;
    const activeRect =
      active && active !== document.body && active !== document.documentElement ? active.getBoundingClientRect() : null;
    const rect = [selectionRect, activeRect].find((r) => r && (r.width > 0 || r.height > 0)) ?? { top: 0, bottom: 0, left: 0 };
    // Coordenadas da página, para o tooltip acompanhar a rolagem.
    return { top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY, left: rect.left + window.scrollX };
  }

  function place() {
    const { host, panel, anchor } = current;
    const size = panel.getBoundingClientRect();
    const position = globalThis.dicioPosition.computeTooltipPosition({
      anchor: { top: anchor.top - window.scrollY, bottom: anchor.bottom - window.scrollY, left: anchor.left - window.scrollX },
      tooltip: { width: size.width, height: size.height },
      viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
    });
    setImportantStyles(host, { top: `${position.top + window.scrollY}px`, left: `${position.left + window.scrollX}px` });
  }

  function el(tag, attributes = {}, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    node.append(...children); // strings viram nós de texto: nunca HTML
    return node;
  }

  function setImportantStyles(node, styles) {
    for (const [property, value] of Object.entries(styles)) node.style.setProperty(property, value, 'important');
  }

  globalThis.dicioTooltip = { open, close };
})();
```

- [ ] **Step 7: Verificar a sintaxe e a suíte completa**

Run: `node --check extension/content/tooltip.js`
Expected: nenhuma saída, exit code 0.

Run: `npm test`
Expected: PASS em todos os arquivos (parse-entry, dictionary, png, position).

O comportamento visual só pode ser verificado com a extensão carregada no navegador. Isso fica para a Task 6, depois que o background (Task 5) estiver pronto.

- [ ] **Step 8: Commit**

```bash
git add extension/content tests/position.test.js
git commit -m "feat: tooltip em Shadow DOM com posicionamento, estados e tema claro/escuro" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Manifest e background (menu de contexto + mensagens)

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/background.js`
- Test: `tests/manifest.test.js`
- Test: `tests/background.test.js`

**Interfaces:**
- Consumes:
  - `lookupWord(text)` de `extension/lib/dictionary.js` (Task 2).
  - `extension/icons/icon-{16,32,48,128}.png` (Task 3).
  - `content/position.js`, `content/tooltip.js`, `content/tooltip.css` e `globalThis.dicioTooltip.open(text, css)` (Task 4).
  - `CASA_XML` de `tests/fixtures.js`.
- Produces:
  - Exports de `extension/background.js`: `MENU_ID = 'checar-significado'`, `CONTENT_FILES = ['content/position.js', 'content/tooltip.js']`, `TOOLTIP_CSS = 'content/tooltip.css'`.
  - Handler de `runtime.onMessage` para `{ type: 'dicio:lookup', text }`, que responde com `LookupResult` via `sendResponse` (e retorna `true`).

- [ ] **Step 1: Escrever o teste do manifest que falha — `tests/manifest.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const extensionFile = (path) => new URL(`../extension/${path}`, import.meta.url);
const manifest = JSON.parse(readFileSync(extensionFile('manifest.json'), 'utf8'));

test('é Manifest V3 com background que funciona no Chrome e no Firefox', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.background, { service_worker: 'background.js', scripts: ['background.js'], type: 'module' });
  assert.ok(existsSync(extensionFile(manifest.background.service_worker)));
});

test('pede apenas as permissões necessárias', () => {
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'contextMenus', 'scripting']);
  assert.deepEqual(manifest.host_permissions, ['https://api.dicionario-aberto.net/*']);
});

test('declara id, versão mínima e coleta de dados exigidos pelo Firefox', () => {
  const { gecko } = manifest.browser_specific_settings;
  assert.match(gecko.id, /^[\w.-]+@[\w.-]+$/);
  assert.equal(gecko.strict_min_version, '140.0');
  assert.deepEqual(gecko.data_collection_permissions, { required: ['websiteContent'] });
});

test('descrição cabe no limite da Chrome Web Store', () => {
  assert.ok(manifest.description.length <= 132, `${manifest.description.length} caracteres`);
});

test('todos os ícones existem e são PNG do tamanho declarado', () => {
  for (const [size, path] of Object.entries(manifest.icons)) {
    const png = readFileSync(extensionFile(path));
    assert.equal(png.toString('ascii', 1, 4), 'PNG', path);
    assert.equal(png.readUInt32BE(16), Number(size), `${path}: largura`);
    assert.equal(png.readUInt32BE(20), Number(size), `${path}: altura`);
  }
});
```

- [ ] **Step 2: Escrever o teste do background que falha — `tests/background.test.js`**

```js
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
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `node --test tests/manifest.test.js tests/background.test.js`
Expected: FAIL. O `manifest.test.js` acusa `ENOENT` em `extension/manifest.json` e o `background.test.js` acusa `ERR_MODULE_NOT_FOUND` em `extension/background.js`.

- [ ] **Step 4: Criar `extension/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Dicionário Rápido",
  "version": "0.1.0",
  "description": "Selecione uma palavra, clique com o botão direito em “Checar significado” e veja a definição em português.",
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "permissions": ["contextMenus", "activeTab", "scripting"],
  "host_permissions": ["https://api.dicionario-aberto.net/*"],
  "background": {
    "service_worker": "background.js",
    "scripts": ["background.js"],
    "type": "module"
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "dicionario-rapido@exemplo.com.br",
      "strict_min_version": "140.0",
      "data_collection_permissions": {
        "required": ["websiteContent"]
      }
    }
  }
}
```

- [ ] **Step 5: Criar `extension/background.js`**

```js
// Service worker (Chrome) / event page (Firefox): menu de contexto, injeção da UI e consultas à API.
import { lookupWord } from './lib/dictionary.js';

const api = globalThis.browser ?? globalThis.chrome;

export const MENU_ID = 'checar-significado';
export const CONTENT_FILES = ['content/position.js', 'content/tooltip.js'];
export const TOOLTIP_CSS = 'content/tooltip.css';

api.runtime.onInstalled.addListener(() => {
  api.contextMenus.create({ id: MENU_ID, title: 'Checar significado', contexts: ['selection'] });
});

api.contextMenus.onClicked.addListener(handleMenuClick);

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'dicio:lookup') return false;
  lookupWord(message.text).then(sendResponse);
  return true; // resposta assíncrona
});

async function handleMenuClick(info, tab) {
  if (info.menuItemId !== MENU_ID || tab?.id === undefined) return;
  const target = { tabId: tab.id, frameIds: [info.frameId ?? 0] };
  try {
    // O CSS vai como texto para o <style> dentro do Shadow DOM do tooltip.
    const css = await (await fetch(api.runtime.getURL(TOOLTIP_CSS))).text();
    await api.scripting.executeScript({ target, files: CONTENT_FILES });
    await api.scripting.executeScript({ target, func: openTooltip, args: [info.selectionText ?? '', css] });
  } catch (error) {
    // chrome://, about:, lojas de extensões e iframes de outra origem não aceitam scripts.
    console.warn('[Dicionário Rápido] Não foi possível mostrar o significado nesta página.', error);
  }
}

// Roda dentro da página, no mesmo mundo isolado em que tooltip.js foi injetado.
function openTooltip(text, css) {
  globalThis.dicioTooltip.open(text, css);
}
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `node --test tests/manifest.test.js tests/background.test.js`
Expected: PASS, 5 testes (manifest) + 8 testes (background), 0 falhas.

Run: `npm test`
Expected: PASS em todos os 6 arquivos de teste.

- [ ] **Step 7: Commit**

```bash
git add extension/manifest.json extension/background.js tests/manifest.test.js tests/background.test.js
git commit -m "feat: manifest MV3 híbrido e background com menu 'Checar significado'" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: README, lint do Firefox e verificação manual nos dois navegadores

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: a extensão completa em `extension/` e os scripts `npm test`, `npm run icons` e `npm run lint:firefox`.
- Produces: documentação de uso e o registro de que a extensão funciona no Chrome e no Firefox.

- [ ] **Step 1: Criar `README.md`**

````markdown
# Dicionário Rápido

Extensão para **Chrome** e **Firefox** (Manifest V3): selecione uma palavra, clique com o botão direito em **Checar significado** e veja a definição em português num tooltip ao lado da palavra.

As definições vêm do [Dicionário Aberto](https://dicionario-aberto.net) (licença CC BY-SA 2.5 PT).

## Estrutura

```
extension/            pasta carregada no navegador
  manifest.json       manifesto único para Chrome e Firefox
  background.js       menu de contexto, injeção do tooltip e consultas à API
  lib/                parser do verbete e cliente da API
  content/            tooltip (position.js, tooltip.js, tooltip.css)
  icons/              ícones PNG (gerados por scripts/generate-icons.js)
scripts/              geração dos ícones
tests/                testes (node:test)
```

## Instalar para desenvolvimento

**Chrome (121+)**
1. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e escolha a pasta `extension/`.
3. Avisos esperados e inofensivos: `browser_specific_settings` não reconhecido e `background.scripts` ignorado. Eles existem por causa do Firefox.

**Firefox (140+)**
1. Abra `about:debugging#/runtime/this-firefox`.
2. Clique em **Carregar extensão temporária…** e escolha `extension/manifest.json`.

Depois de alterar o código, recarregue a extensão (botão ↻ no Chrome, **Recarregar** no Firefox) e a aba de teste.

## Desenvolvimento

Requer Node.js 22 ou mais recente (só para testes e ícones; a extensão não tem build).

```bash
npm test               # testes unitários
npm run icons          # regenera extension/icons/*.png
npm run lint:firefox   # valida o pacote com o web-ext (Mozilla)
```

Logs do background: no Chrome, `chrome://extensions` → **service worker**; no Firefox, `about:debugging` → **Inspecionar**.

## Limitações conhecidas

- O Dicionário Aberto não reconhece flexões ("casas", "correu"). Nesses casos o tooltip sugere palavras próximas ("casa", "correr").
- A fonte é um dicionário antigo, então algumas definições usam ortografia pré-reforma ("objecto", "taboleiro").
- O navegador não permite scripts em páginas internas (`chrome://`, `about:`, lojas de extensões). Nelas o menu não faz nada.
- Iframes de outra origem não recebem o tooltip, porque `activeTab` só cobre a página principal.
- Antes de publicar na AMO, troque o id `dicionario-rapido@exemplo.com.br` em `manifest.json` por um id seu.
````

- [ ] **Step 2: Rodar a suíte e o lint do Firefox**

Run: `npm test`
Expected: PASS, 6 arquivos, 0 falhas.

Run: `npm run lint:firefox`
Expected: `errors 0`. Avisos (por exemplo, sobre `background.service_worker`) são aceitáveis; copie a lista para o relatório da task. Se houver **erro**, corrija o manifest antes de seguir.

- [ ] **Step 3: Verificação manual no Chrome**

Carregue `extension/` conforme o README e abra `https://pt.wikipedia.org/wiki/Casa`. Verifique cada item:

1. Selecione "casa" → botão direito → **Checar significado**. O tooltip aparece logo abaixo da palavra, mostra "Buscando significado…" e depois a tag "f.", as acepções numeradas, a etimologia e o rodapé "Fonte: Dicionário Aberto".
2. Selecione "casas". Aparece "Nenhum significado encontrado para “casas”." com sugestões. Clique em "casa": as definições aparecem no mesmo tooltip.
3. Selecione duas palavras. Aparece "Selecione apenas uma palavra (sem números ou símbolos).".
4. Feche de três formas: botão ×, tecla Esc e clique fora. As três funcionam.
5. Role a página até a palavra ficar perto da borda inferior e consulte. O tooltip abre **acima** da palavra e não sai da tela.
6. Ative o tema escuro do sistema. O tooltip usa as cores escuras.
7. Abra `chrome://extensions`, selecione texto e use o menu. Nada aparece, e o console do service worker mostra o aviso `[Dicionário Rápido] Não foi possível mostrar...` (sem erro não tratado).
8. Desligue a rede (Wi-Fi off) e consulte "casa". Aparece a mensagem de erro amigável em vermelho.
9. No console do service worker não há erros vermelhos além do item 7.

- [ ] **Step 4: Verificação manual no Firefox**

Carregue `extension/manifest.json` via `about:debugging` e repita os itens 1 a 6 e 8 do Step 3 na mesma página. No lugar do item 7, use `about:addons`: nada aparece e o console de **Inspecionar** mostra o aviso. Confira também que o console de **Inspecionar** não tem erros vermelhos.

Se algum item falhar em qualquer navegador, **pare** e use superpowers:systematic-debugging antes de alterar código. Em especial, se o tooltip aparecer sem estilo numa página, anote a URL: pode ser uma CSP que bloqueia `<style>` injetado (ver "Riscos" abaixo).

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README com instalação no Chrome/Firefox, testes e limitações" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Riscos conhecidos

- **API sem SLA:** o Dicionário Aberto é um projeto comunitário. Falhas viram uma mensagem amigável, e trocar de fonte só exige mexer em `extension/lib/dictionary.js`, que mantém o mesmo `LookupResult`.
- **CSP estrita:** páginas com `style-src` sem `'unsafe-inline'` podem bloquear o `<style>` do Shadow DOM, principalmente no Firefox. Se a verificação manual mostrar isso, a mitigação é trocar por `adoptedStyleSheets`, num plano separado.
- **Posição com `<html>` transformado/posicionado:** o host usa `position: absolute` relativo ao documento. Páginas com `transform` no `<html>`/`<body>` podem deslocar o tooltip. Isso é aceitável para a versão inicial.

## Fora do escopo

Popup ou página de opções, cache de buscas, frases com várias palavras, outras línguas, empacotamento e publicação nas lojas, Safari, testes E2E automatizados no navegador.
