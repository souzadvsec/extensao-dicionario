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
