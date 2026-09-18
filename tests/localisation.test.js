// SPDX-License-Identifier: MPL-2.0
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../scripts/localisation');

test('registry uses distinct locale, extension, website, and hreflang identifiers', () => {
  assert.equal(L.registry.length, 30);
  for (const field of ['locale', 'extension', 'website', 'hreflang']) {
    assert.equal(new Set(L.registry.map(item => item[field])).size, L.registry.length, field);
  }
  assert.equal(L.localeInfo('he').direction, 'rtl');
  assert.equal(L.localeInfo('zh-CN').extension, 'zh_CN');
  assert.equal(L.localeInfo('nb').extension, 'no');
});

test('extension messages preserve interpolation and plural categories', () => {
  const messages = L.toWebExtensionMessages('cs');
  assert.ok(messages.closedCount.message.includes('$count$'));
  assert.equal(messages.closedCount.placeholders.count.content, '$1');
  assert.ok(messages.openCount_one);
  assert.ok(messages.openCount_few);
  assert.ok(messages.openCount_other);
});

test('i18n helper selects a browser message and plural fallback', () => {
  const calls = [];
  const context = {
    chrome: {
      i18n: {
        getUILanguage: () => 'fr',
        getMessage: (key, substitutions) => {
          calls.push([key, substitutions]);
          if (key === 'openCount_one') return substitutions[0] + ' onglet ouvert';
          if (key === 'openCount_other') return substitutions[0] + ' onglets ouverts';
          return '';
        },
      },
    },
    Intl,
  };
  context.globalThis = context;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'src/shared/i18n.js'), 'utf8'),
    context
  );
  assert.equal(context.ttMessage('openCount', { count: 1 }), '1 onglet ouvert');
  assert.equal(context.ttMessage('openCount', { count: 3 }), '3 onglets ouverts');
  assert.deepEqual(calls.map(call => call[0]), ['openCount_one', 'openCount_other']);
});

test('all browser packages contain every registry locale', () => {
  for (const browser of ['chrome', 'firefox', 'edge']) {
    const manifest = JSON.parse(fs.readFileSync(
      path.join(L.root, 'src/overrides', browser, 'manifest.json'),
      'utf8'
    ));
    assert.equal(manifest.default_locale, 'en');
    assert.equal(manifest.name, '__MSG_extensionName__');
    for (const locale of L.registry) {
      assert.ok(fs.existsSync(path.join(
        L.root, 'src/shared/_locales', locale.extension, 'messages.json'
      )));
    }
  }
});
