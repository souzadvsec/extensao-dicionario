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
