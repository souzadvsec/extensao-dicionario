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
