// SPDX-License-Identifier: MPL-2.0
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const L = require('./localisation');
const { fullDescription } = require('./generate-listings');

const errors = [];
const warnings = [];
const source = L.catalogue('en');
const sourceKeys = Object.keys(source).sort();

function fail(message) { errors.push(message); }
function warn(message) { warnings.push(message); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function keys(value) { return Object.keys(value).sort(); }
function count(value) { return Array.from(String(value)).length; }

assert.equal(new Set(L.registry.map(item => item.locale)).size, L.registry.length);
assert.equal(new Set(L.registry.map(item => item.extension)).size, L.registry.length);
assert.equal(new Set(L.registry.map(item => item.website)).size, L.registry.length);

for (const locale of L.registry) {
  const catalogue = L.catalogue(locale.locale);
  const missing = sourceKeys.filter(key => !(key in catalogue));
  const extra = Object.keys(catalogue).filter(key => !(key in source));
  if (missing.length) fail(locale.locale + ': missing source keys: ' + missing.join(', '));
  if (extra.length) warn(locale.locale + ': extra keys: ' + extra.join(', '));

  const messagesFile = path.join(L.root, 'src', 'shared', '_locales', locale.extension, 'messages.json');
  if (!fs.existsSync(messagesFile)) {
    fail(locale.locale + ': missing packaged locale ' + messagesFile);
  } else {
    const expected = L.toWebExtensionMessages(locale.locale);
    const actual = readJson(messagesFile);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail(locale.locale + ': packaged messages are out of date; run node scripts/generate-extension-locales.js');
    }
    for (const [key, value] of Object.entries(actual)) {
      if (!value || typeof value.message !== 'string' || !value.message.trim()) {
        fail(locale.locale + ': empty extension message ' + key);
      }
      if (value.placeholders) {
        for (const placeholder of Object.keys(value.placeholders)) {
          if (!value.message.includes('$' + placeholder + '$')) {
            fail(locale.locale + ': placeholder mismatch for ' + key + '.' + placeholder);
          }
        }
      }
    }
  }

  if (locale.locale !== 'en') {
    const reviewFile = path.join(L.root, 'localisation', 'reviews', locale.locale + '.json');
    if (!fs.existsSync(reviewFile)) {
      fail(locale.locale + ': missing review metadata');
    } else {
      const reviews = readJson(reviewFile);
      for (const key of sourceKeys) {
        const entry = reviews[key];
        if (!entry) {
          fail(locale.locale + ': missing review metadata for ' + key);
          continue;
        }
        if (entry.source !== L.sourceFingerprint(key)) {
          fail(locale.locale + ': stale source fingerprint for ' + key);
        }
        if (entry.translation !== L.fingerprint(catalogue[key])) {
          fail(locale.locale + ': review translation fingerprint mismatch for ' + key);
        }
        if (!entry.review || !entry.date) fail(locale.locale + ': incomplete review provenance for ' + key);
      }
    }
  }

  const page = path.join(L.root, 'website', 'dist', locale.website, 'index.html');
  if (!fs.existsSync(page)) {
    fail(locale.locale + ': missing generated website page');
  } else {
    const html = fs.readFileSync(page, 'utf8');
    if (html.includes('{{') || html.includes('__MSG_')) fail(locale.locale + ': unresolved template token');
    if (!html.includes('<html lang="' + locale.canonical + '" dir="' + locale.direction + '">')) fail(locale.locale + ': incorrect document language or direction');
    if (!html.includes('<link rel="canonical" href="' + L.urlFor(locale) + '" />')) fail(locale.locale + ': missing canonical');
    if (!html.includes('hreflang="x-default" href="' + L.urlFor('en') + '"')) fail(locale.locale + ': missing x-default');
    if (!html.includes('<title>' + L.escape(catalogue.web_tabtools_close_tabs_by_site) + '</title>')) fail(locale.locale + ': incorrect page title');
    const dataMatch = html.match(/<script type="application\/json" id="locale-data">([\s\S]*?)<\/script>/);
    if (!dataMatch) fail(locale.locale + ': missing embedded locale data');
    else if (JSON.parse(dataMatch[1]).locale !== locale.locale) fail(locale.locale + ': embedded locale data mismatch');
  }

  for (const store of ['chrome', 'firefox', 'edge']) {
    const file = path.join(L.root, 'marketing', 'listings', store, locale.locale + '.md');
    if (!fs.existsSync(file)) {
      fail(locale.locale + ': missing ' + store + ' listing text');
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    const expectedFingerprints = [
      '- Title source fingerprint: ' + L.fingerprint(source.extensionName),
      '- Summary source fingerprint: ' + L.fingerprint(source.extensionDescription),
      '- Full-description source fingerprint: ' + L.fingerprint(fullDescription(source)),
    ];
    for (const fingerprint of expectedFingerprints) {
      if (!text.includes(fingerprint)) fail(locale.locale + ': stale ' + store + ' source fingerprint');
    }
    const fields = [...text.matchAll(/Character count: (\d+)/g)].map(match => Number(match[1]));
    if (fields.length < 3) fail(locale.locale + ': incomplete ' + store + ' character counts');
    if (fields[0] > 75) fail(locale.locale + ': ' + store + ' title exceeds conservative 75-character limit');
    if (fields[1] > 132) fail(locale.locale + ': ' + store + ' summary exceeds conservative 132-character limit');
    if (fields[2] < 250 || fields[2] > 10000) fail(locale.locale + ': ' + store + ' full description is outside 250-10,000 characters');
  }
}

for (const manifestName of ['chrome', 'firefox', 'edge']) {
  const manifest = readJson(path.join(L.root, 'src', 'overrides', manifestName, 'manifest.json'));
  if (manifest.default_locale !== 'en') fail(manifestName + ': default_locale must be en');
  if (manifest.name !== '__MSG_extensionName__') fail(manifestName + ': manifest name is not localized');
  if (manifest.description !== '__MSG_extensionDescription__') fail(manifestName + ': manifest description is not localized');
}

const sitemap = fs.readFileSync(path.join(L.root, 'website', 'dist', 'sitemap.xml'), 'utf8');
for (const locale of L.registry) {
  if (!sitemap.includes('<loc>' + L.urlFor(locale) + '</loc>')) fail('sitemap missing ' + locale.locale);
}
if (/pages\.dev|chatgpt\.site/.test(sitemap)) fail('sitemap contains a preview or rollback host');

const coverage = [
  '# TabTools localisation coverage',
  '',
  'Baseline commit: ' + L.registrySource.baseCommit,
  'Registry verification date: ' + L.registrySource.verifiedAt,
  'Intersection status: ' + L.registrySource.intersectionStatus,
  '',
  '| Locale | Extension | Website | Store text | Source freshness | Technical | Linguistic review |',
  '| --- | ---: | ---: | ---: | --- | --- | --- |',
];
for (const locale of L.registry) {
  const catalogue = L.catalogue(locale.locale);
  const extensionCount = Object.keys(L.extensionSource(catalogue)).length;
  const webCount = Object.keys(catalogue).filter(key => key.startsWith('web_')).length;
  const staleKeys = locale.locale === 'en'
    ? []
    : sourceKeys.filter(key => L.isStale(locale.locale, key));
  const freshness = staleKeys.length ? 'STALE (' + staleKeys.length + ' keys)' : 'current';
  const linguistic = locale.locale === 'en'
    ? 'Source baseline'
    : 'AI self-review only; no native-speaker review';
  coverage.push('| ' + locale.locale + ' | ' + extensionCount + '/' + Object.keys(L.extensionSource(source)).length +
    ' | ' + webCount + '/' + Object.keys(source).filter(key => key.startsWith('web_')).length +
    ' | 3/3 fields × 3 stores | ' + freshness + ' | structural checks | ' + linguistic + ' |');
}
coverage.push('', 'No images, screenshots, banners, or videos are translated by this task.');
fs.writeFileSync(path.join(L.root, 'localisation', 'COVERAGE.md'), coverage.join('\n') + '\n');

if (warnings.length) console.warn(warnings.join('\n'));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Localisation validation passed for ' + L.registry.length + ' locales.');
