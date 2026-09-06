/* Манифест и код легко расходятся - тут проверяем сцепки, которые Chrome
   покажет только в рантайме и только на живой странице Rask. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const url = (name) => new URL(`../${name}`, import.meta.url);
const manifest = JSON.parse(fs.readFileSync(url('manifest.json'), 'utf8'));
const code = fs.readFileSync(url('common.js'), 'utf8');
const RASK = new Function(`${code}\nreturn RASK;`)();

test('манифест валиден и объявляет MV3', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.version);
  assert.equal(manifest.minimum_chrome_version, '102'); // нужен chrome.storage.session
});

test('разрешения совпадают с разрешённым доменом из common.js', () => {
  assert.deepEqual(manifest.host_permissions, [`${RASK.ALLOWED_ORIGIN}/*`]);
  assert.deepEqual(manifest.content_scripts[0].matches, [`${RASK.ALLOWED_ORIGIN}/*`]);
});

test('common.js подключён во все контексты и раньше своих потребителей', () => {
  const js = manifest.content_scripts[0].js;
  assert.deepEqual(js, ['common.js', 'content.js']);

  for (const page of ['mux.html', 'popup.html']) {
    const html = fs.readFileSync(url(page), 'utf8');
    const common = html.indexOf('common.js');
    const consumer = html.indexOf(page === 'mux.html' ? 'mux.js' : 'popup.js');
    assert.ok(common > -1, `${page}: не подключён common.js`);
    assert.ok(common < consumer, `${page}: common.js должен идти раньше`);
  }

  const sw = fs.readFileSync(url(manifest.background.service_worker), 'utf8');
  assert.match(sw, /importScripts\('common\.js'\)/);
});

test('расширение просит только те разрешения, что описаны в README', () => {
  assert.deepEqual(manifest.permissions.slice().sort(), ['downloads', 'storage']);
});

test('CSP страниц расширения разрешает wasm и запрещает чужой код', () => {
  const csp = manifest.content_security_policy.extension_pages;
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.doesNotMatch(csp, /unsafe-inline|https:/);
});
