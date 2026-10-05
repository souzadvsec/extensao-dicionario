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
