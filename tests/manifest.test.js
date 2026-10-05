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
