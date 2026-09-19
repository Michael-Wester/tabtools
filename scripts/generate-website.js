// SPDX-License-Identifier: MPL-2.0
'use strict';

const fs = require('fs');
const path = require('path');
const L = require('./localisation');

const sourceDir = path.join(L.root, 'website', 'src');
const outputDir = path.join(L.root, 'website', 'dist');
const template = fs.readFileSync(path.join(sourceDir, 'template.html'), 'utf8');

function htmlMessage(value) {
  return L.escape(value)
    .replace(/&lt;(\/?)(em|strong)&gt;/g, (_, end, tag) => '<' + end + (tag === 'em' ? 'span' : tag) + '>')
    .replaceAll('&lt;br&gt;', '<br />');
}

function localeData(locale) {
  return {
    locale: locale.locale,
    registry: L.presentationRegistry.map(item => ({
      locale: item.locale,
      canonical: item.canonical,
      path: item.path,
      languageName: item.languageName,
      flagAsset: item.flagAsset,
    })),
    messages: L.catalogue(locale.locale),
  };
}

function flagMarkup(item, className) {
  const asset = item.flagAsset;
  if (!asset) {
    return '<span class="language-flag ' + className + '" aria-hidden="true"></span>';
  }
  return '<span class="language-flag ' + className + '" aria-hidden="true">' +
    '<img class="language-flag-image"' + (className === 'language-flag-current' ? ' data-language-flag-image' : '') + ' src="/assets/flags/' + L.escape(asset) +
    '" width="32" height="32" alt="" />' +
    '</span>';
}

function languagePickerMarkup(current, label) {
  const options = L.presentationRegistry.map(item => {
    const selected = item.locale === current.locale;
    return '<a class="language-option" data-language-option data-locale="' +
      L.escape(item.locale) + '" role="option" aria-selected="' + selected +
      '" tabindex="-1" href="' + L.escape(item.path) + '">' +
      flagMarkup(item, 'language-flag-option') +
      '<span class="language-option-name" lang="en" dir="ltr">' + L.escape(item.languageName) + '</span>' +
      '<span class="language-option-check" aria-hidden="true">✓</span>' +
      '</a>';
  }).join('');
  const currentName = current.languageName || current.locale;
  const accessibleLabel = String(label) + ': ' + currentName;
  return '<div class="language-picker" data-language-picker>' +
    '<button class="language-trigger" type="button" data-language-trigger aria-label="' + L.escape(accessibleLabel) +
      '" title="' + L.escape(accessibleLabel) + '" aria-haspopup="listbox" aria-expanded="false" aria-controls="language-menu">' +
      flagMarkup(current, 'language-flag-current') +
      '<span class="language-name sr-only" data-language-name lang="en" dir="ltr">' + L.escape(currentName) + '</span>' +
    '</button>' +
    '<div id="language-menu" class="language-menu" data-language-menu role="listbox" aria-label="' + L.escape(label) + '" hidden>' +
      options +
    '</div>' +
  '</div>';
}

function seoLinks() {
  return L.registry.map(item =>
    '    <link rel="alternate" hreflang="' + L.escape(item.hreflang) +
    '" href="' + L.urlFor(item) + '" />'
  ).join('\n') + '\n    <link rel="alternate" hreflang="x-default" href="' + L.urlFor('en') + '" />';
}

function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

function applyTranslations(html, locale) {
  const target = L.catalogue(locale.locale);
  const { richKeys } = require('./catalogue-validation');
  const structuredData = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication',
    name: 'TabTools', url: L.urlFor(locale), description: target.web_structuredDescription,
    inLanguage: locale.locale, applicationCategory: 'BrowserApplication', isAccessibleForFree: true,
  };
  const special = {
    locale: L.escape(locale.canonical), direction: L.escape(locale.direction),
    canonical: L.urlFor(locale), alternates: seoLinks(),
    structuredData: '<script type="application/ld+json">' + safeJson(structuredData) + '</script>',
    pageData: '<script type="application/json" id="locale-data">' + safeJson(localeData(locale)) + '</script>',
    languageSelector: languagePickerMarkup(locale, target.web_language),
  };
  return html.replace(/{{(\w+)(?::([^}]+))?}}/g, (_, key, argument) => {
    if (Object.hasOwn(special, key)) return special[key];
    const value = target[key];
    if (typeof value !== 'string') throw new Error('Missing website message ' + locale.locale + ':' + key);
    if (key === 'web_addTo') {
      return L.escape(value).replace('{browser}',
        '<span class="browser-button-name" data-browser-name>' + L.escape(argument) + '</span>');
    }
    if (key === 'web_storeNote') return L.escape(value.replace('{store}', argument));
    return richKeys.has(key) ? htmlMessage(value) : L.escape(value);
  });
}

function writePage(locale) {
  const output = applyTranslations(template, locale);
  const directory = path.join(outputDir, locale.website);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), output);
}

function copyFlagAssets() {
  const sourceFlags = path.join(sourceDir, 'assets', 'flags');
  const outputFlags = path.join(outputDir, 'assets', 'flags');
  fs.rmSync(outputFlags, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(outputFlags), { recursive: true });
  fs.cpSync(sourceFlags, outputFlags, { recursive: true });
}

function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const expectedDirectories = new Set(L.registry.map(locale => locale.website).filter(Boolean));
  for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== 'assets' && !expectedDirectories.has(entry.name)) {
      fs.rmSync(path.join(outputDir, entry.name), { recursive: true, force: true });
    }
  }
  fs.copyFileSync(path.join(sourceDir, 'styles.css'), path.join(outputDir, 'styles.css'));
  fs.copyFileSync(path.join(sourceDir, 'script.js'), path.join(outputDir, 'script.js'));
  copyFlagAssets();
  for (const locale of L.registry) writePage(locale);

  const urls = L.registry.map(L.urlFor).map(url => '  <url>\n    <loc>' + url + '</loc>\n  </url>');
  fs.writeFileSync(
    path.join(outputDir, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.join('\n') + '\n</urlset>\n'
  );
}

if (require.main === module) main();

module.exports = { main, applyTranslations, localeData, languagePickerMarkup, seoLinks };
