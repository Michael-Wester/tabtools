// SPDX-License-Identifier: MPL-2.0
'use strict';
const assert = require('node:assert/strict');
const L = require('./localisation');
const read = file => JSON.parse(L.fs.readFileSync(L.path.join(L.root, file), 'utf8'));
function files(dir) {
  return L.fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = L.path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}
for (const browser of ['chrome', 'firefox', 'edge']) {
  const directory = L.path.join(L.root, 'dist', browser);
  const manifest = read(`dist/${browser}/manifest.json`);
  const baseline = read(`localisation/baseline/${browser}-manifest.json`);
  for (const field of ['manifest_version', 'version', 'permissions', 'browser_specific_settings']) {
    assert.deepEqual(manifest[field], baseline[field], `${browser}: changed ${field}`);
  }
  const codeFor = locale => browser === 'firefox' ? (locale.firefoxExtension || locale.extension) : locale.extension;
  const localeDirs = L.fs.readdirSync(L.path.join(directory, '_locales'));
  assert.deepEqual(localeDirs.sort(), L.registry.map(codeFor).sort(), `${browser}: unexpected locales`);
  for (const locale of L.registry) {
    const code = codeFor(locale);
    const actual = read(`dist/${browser}/_locales/${code}/messages.json`);
    assert.deepEqual(actual, L.toWebExtensionMessages(locale.locale), `${browser}/${code}: locale mismatch`);
    for (const match of JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)) {
      assert.ok(actual[match[1]]?.message, `${browser}/${code}: unresolved manifest message ${match[1]}`);
    }
  }
  const entries = files(directory);
  assert.ok(!entries.some(file => /marketing|baseline|COVERAGE|reviews/.test(file)), `${browser}: non-runtime material`);
  const popup = (manifest.action || manifest.browser_action).default_popup;
  const popupHtml = L.fs.readFileSync(L.path.join(directory, popup), 'utf8');
  const references = [manifest.background.service_worker, ...(manifest.background.scripts || []), popup,
    ...[...popupHtml.matchAll(/<script src="([^"]+)"/g)].map(match => L.path.join(L.path.dirname(popup), match[1]))];
  for (const ref of references.filter(Boolean)) {
    assert.ok(L.fs.existsSync(L.path.join(directory, ref)), `Missing ${browser} resource ${ref}`);
  }
  const bytes = entries.reduce((sum, file) => sum + L.fs.statSync(file).size, 0);
  console.log(`${browser}: ${entries.length} runtime files, ${L.registry.length} locales, ${bytes} uncompressed bytes`);
}
