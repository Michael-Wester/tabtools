// SPDX-License-Identifier: MPL-2.0
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../scripts/localisation');

test('registry uses distinct locale, extension, website, and hreflang identifiers', () => {
  assert.equal(L.registry.length, 29);
  assert.equal(L.registry.some(item => item.locale === 'en-GB'), false);
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

test('built packages preserve metadata and contain each browser locale', () => {
  const { spawnSync } = require('node:child_process');
  for (const args of [['build.js'], ['scripts/check-packages.js']]) {
    const result = spawnSync(process.execPath, args, { cwd: L.root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  assert.ok(fs.existsSync(path.join(L.root, 'dist/firefox/_locales/nb/messages.json')));
  assert.ok(!fs.existsSync(path.join(L.root, 'dist/firefox/_locales/no')));
  const invalid = spawnSync(process.execPath, ['build.js', '../outside'], { cwd: L.root, encoding: 'utf8' });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Unknown browser/);
});
