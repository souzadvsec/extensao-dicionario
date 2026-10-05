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

O `web-ext lint` mostra 2 avisos esperados: `service_worker` é ignorado pelo Firefox (ele usa `background.scripts`), e a declaração de coleta de dados exige Firefox para Android 142+ (o alvo da extensão é o Firefox desktop).

## Limitações conhecidas

### Da fonte de dados (Dicionário Aberto)

O Dicionário Aberto é baseado num dicionário de 1913. Isso causa três limitações, todas confirmadas com a API em 2026-10-05:

- **Ortografia pré-reforma.** Os verbetes usam a grafia antiga, então várias palavras na grafia atual não são encontradas. Exemplo: "arquitetura" não tem verbete, mas está em "arquitectura". O tooltip mostra "arquitectura" como sugestão, e clicar nela leva à definição. As próprias definições também usam a grafia antiga ("objecto", "taboleiro").
- **Sem flexões.** Só existe o verbete da forma básica (singular, masculino). Exemplo: "casas" não é encontrada; o tooltip sugere "casa".
- **Sem formas verbais conjugadas.** Particípios, gerúndios e tempos conjugados não têm verbete. Exemplos: "correu" sugere "correr", que funciona. Já "considerado" sugere só "considerando", que **não** leva ao verbo: o verbete existe como "considerar", mas a API não o sugere. Nesses casos, selecione ou procure o infinitivo.

As sugestões vêm do endpoint `/near/` da API, que encontra palavras com grafia parecida. Ele não entende morfologia, então nem sempre a sugestão é a forma básica da palavra.

### Do navegador

- O navegador não permite scripts em páginas internas (`chrome://`, `about:`, lojas de extensões). Nelas o menu não faz nada.
- Iframes de outra origem não recebem o tooltip, porque `activeTab` só cobre a página principal.

### Publicação

- Antes de publicar na AMO, troque o id `dicionario-rapido@exemplo.com.br` em `manifest.json` por um id seu.
