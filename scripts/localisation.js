// SPDX-License-Identifier: MPL-2.0
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const registrySource = JSON.parse(fs.readFileSync(path.join(root, 'localisation', 'registry.json'), 'utf8'));
const registry = registrySource.locales.map(locale => ({
  ...locale,
  path: locale.website ? '/' + locale.website + '/' : '/',
}));

// Keep the source registry stable for URL, SEO and store mappings. The website
// picker gets a separate deterministic presentation order: English first, then
// the English display names in fixed English collation.
const presentationRegistry = [...registry].sort((left, right) => {
  if (left.locale === 'en') return -1;
  if (right.locale === 'en') return 1;
  return left.languageName.localeCompare(right.languageName, 'en', {
    sensitivity: 'base',
    numeric: false,
  }) || left.locale.localeCompare(right.locale, 'en');
});
const catalogueCache = new Map();

function catalogue(locale = 'en') {
  if (!catalogueCache.has(locale)) {
    const file = path.join(root, 'localisation', 'locales', locale + '.json');
    catalogueCache.set(locale, JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  return catalogueCache.get(locale);
}

function localeInfo(locale) {
  return registry.find(item => item.locale === locale) || registry[0];
}

function urlFor(localeOrEntry) {
  const item = typeof localeOrEntry === 'string' ? localeInfo(localeOrEntry) : localeOrEntry;
  return 'https://tabtools.fyi' + (item.website ? '/' + item.website + '/' : '/');
}

function escape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sourceFingerprint(key) {
  return fingerprint(catalogue('en')[key]);
}

function review(locale, key) {
  const file = path.join(root, 'localisation', 'reviews', locale + '.json');
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return data[key] || null;
}

function isStale(locale, key) {
  if (locale === 'en') return false;
  const entry = review(locale, key);
  return !entry || entry.source !== sourceFingerprint(key);
}

function extensionSource(catalogueValue) {
  return Object.fromEntries(
    Object.entries(catalogueValue).filter(([key]) => !key.startsWith('web_'))
  );
}

function webExtensionLocale(locale) {
  return localeInfo(locale).extension;
}

function toWebExtensionMessages(locale) {
  const source = extensionSource(catalogue(locale));
  const output = {
    translationLocale: { message: locale },
    translationDirection: { message: localeInfo(locale).direction },
  };

  for (const [key, value] of Object.entries(source)) {
    if (key === 'openCount' && value && typeof value === 'object') {
      for (const [category, text] of Object.entries(value)) {
        output['openCount_' + category] = messageEntry(text);
      }
      continue;
    }
    output[key] = messageEntry(value);
  }
  return output;
}

function messageEntry(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Extension messages must be strings');
  }
  const placeholders = {};
  const message = value.replace(/\{(\w+)\}/g, (_, name) => {
    placeholders[name] = {
      content: '$' + (Object.keys(placeholders).length + 1),
      example: name === 'site' ? 'example.com' : '3',
    };
    return '$' + name + '$';
  });
  const entry = { message };
  if (Object.keys(placeholders).length) entry.placeholders = placeholders;
  return entry;
}

module.exports = {
  fs,
  path,
  crypto,
  root,
  registrySource,
  registry,
  presentationRegistry,
  catalogue,
  localeInfo,
  urlFor,
  escape,
  fingerprint,
  sourceFingerprint,
  review,
  isStale,
  extensionSource,
  webExtensionLocale,
  toWebExtensionMessages,
};
