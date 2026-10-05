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
