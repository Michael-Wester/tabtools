// SPDX-License-Identifier: MPL-2.0
'use strict';

const fs = require('fs');
const path = require('path');
const L = require('./localisation');

const demo = require('../website/demo-content.cjs');

const sourceDir = path.join(L.root, 'website', 'src');
const outputDir = path.join(L.root, 'website', 'dist');
const template = fs.readFileSync(path.join(sourceDir, 'template.html'), 'utf8');

function htmlMessage(value) {
  return L.escape(value)
    .replace(/&lt;(\/?)(em|strong)&gt;/g, (_, end, tag) => '<' + end + (tag === 'em' ? 'span' : tag) + '>')
    .replaceAll('&lt;br&gt;', '<br />');
}

// Text the page's own scripts show. Everything else is already in the HTML, so
// the page does not carry a second copy of the whole catalogue.
const runtimeKeys = [
  'web_addTo', 'web_view', 'web_storeAria', 'web_storeNote', 'web_language', 'web_languageSuggestion',
  'web_switchLight', 'web_switch_to_dark_mode',
];

// A release branch can hold English text ahead of its translations. A string a
// language does not have yet is shown in English, as the extension does, and
// validation reports it as awaiting translation. English itself has no fallback.
function message(locale, key) {
  const value = L.catalogue(locale.locale)[key];
  return value === undefined && locale.locale !== 'en' ? L.catalogue('en')[key] : value;
}

function localeData(locale) {
  return {
    locale: locale.locale,
    registry: L.presentationRegistry.map(item => ({
      locale: item.locale,
      canonical: item.canonical,
      path: item.path,
      nativeName: item.nativeName,
      flagAsset: item.flagAsset,
    })),
    messages: Object.fromEntries(runtimeKeys.map(key => [key, message(locale, key)])),
    demo: demo.data(locale),
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

// Each language is listed under its own name, marked up in that language.
function nameMarkup(item, className, extra = '') {
  return '<span' + (className ? ' class="' + className + '"' : '') + extra + ' lang="' + L.escape(item.canonical) +
    '" dir="' + L.escape(item.direction) + '">' + L.escape(item.nativeName) + '</span>';
}

function languagePickerMarkup(current, label) {
  const options = L.presentationRegistry.map(item => {
    const selected = item.locale === current.locale;
    return '<a class="language-option" data-language-option data-locale="' +
      L.escape(item.locale) + '" role="option" aria-selected="' + selected +
      '" tabindex="-1" href="' + L.escape(item.path) + '">' +
      flagMarkup(item, 'language-flag-option') +
      nameMarkup(item, 'language-option-name') +
      '<span class="language-option-check" aria-hidden="true">✓</span>' +
      '</a>';
  }).join('');
  const accessibleLabel = String(label) + ': ' + current.nativeName;
  const fallbackOptions = L.presentationRegistry.map(item =>
    '<a class="language-fallback-option" href="' + L.escape(item.path) + '"' +
      (item.locale === current.locale ? ' aria-current="page"' : '') + '>' +
      flagMarkup(item, 'language-flag-option') +
      nameMarkup(item, '') + '</a>'
  ).join('');
  return '<div class="language-picker" data-language-picker>' +
    '<button class="language-trigger" type="button" data-language-trigger aria-label="' + L.escape(accessibleLabel) +
      '" title="' + L.escape(accessibleLabel) + '" aria-haspopup="listbox" aria-expanded="false" aria-controls="language-menu">' +
      flagMarkup(current, 'language-flag-current') +
      nameMarkup(current, 'language-name', ' data-language-name') +
      '<svg class="language-chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 3.5 5 7l3.5-3.5"></path></svg>' +
    '</button>' +
    '<div id="language-menu" class="language-menu" data-language-menu role="listbox" aria-label="' + L.escape(label) + '" hidden>' +
      options +
    '</div>' +
  '</div>' +
    '<noscript><details class="language-fallback">' +
      '<summary class="language-fallback-trigger" aria-label="' + L.escape(accessibleLabel) + '">' +
        flagMarkup(current, 'language-flag-fallback') +
        '<span class="sr-only">' + L.escape(accessibleLabel) + '</span>' +
      '</summary>' +
      '<nav class="language-fallback-menu" aria-label="' + L.escape(label) + '">' + fallbackOptions + '</nav>' +
    '</details></noscript>';
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
  const { richKeys } = require('./catalogue-validation');
  const text = key => message(locale, key);
  const structuredData = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication',
    name: 'TabTools', url: L.urlFor(locale), description: text('web_structuredDescription'),
    inLanguage: locale.locale, applicationCategory: 'BrowserApplication', isAccessibleForFree: true,
  };
  const special = {
    locale: L.escape(locale.canonical), direction: L.escape(locale.direction),
    canonical: L.urlFor(locale), alternates: seoLinks(),
    structuredData: '<script type="application/ld+json">' + safeJson(structuredData) + '</script>',
    pageData: '<script type="application/json" id="locale-data">' + safeJson(localeData(locale)) + '</script>',
    languageSelector: languagePickerMarkup(locale, text('web_language')),
    // Only built when the template asks for it, since it needs a string of its own.
    get demo() { return demo.markup(locale, required('web_demoHint')); },
    // "2 hr+", as the popup's Inactive row words the default time.
    inactiveHint: L.escape(new Intl.NumberFormat(locale.canonical, { style: 'unit', unit: 'hour', unitDisplay: 'short' })
      .format(demo.threshold / 60) + '+'),
  };
  function required(key) {
    const value = text(key);
    if (typeof value !== 'string') throw new Error('Missing website message ' + locale.locale + ':' + key);
    return value;
  }
  return html.replace(/{{(\w+)(?::([^}]+))?}}/g, (_, key, argument) => {
    if (Object.hasOwn(special, key)) return special[key];
    if (key === 'storeLabel') return L.escape(required('web_addTo').replace('{browser}', argument));
    const value = required(key);
    if (key === 'web_addTo') {
      return L.escape(value).replace('{browser}',
        '<span class="browser-button-name" data-browser-name>' + L.escape(argument) + '</span>');
    }
    if (key === 'web_storeNote') return L.escape(value.replace('{store}', argument));
    return richKeys.has(key) ? htmlMessage(value) : L.escape(value);
  });
}

function writePage(locale) {
  const output = applyTranslations(template, locale)
    .replace(/href="\/guides\//g, 'href="' + locale.path + 'guides/');
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
    if (entry.isDirectory() && !['assets', 'guides'].includes(entry.name) && !expectedDirectories.has(entry.name)) {
      fs.rmSync(path.join(outputDir, entry.name), { recursive: true, force: true });
    }
  }
  fs.copyFileSync(path.join(sourceDir, 'styles.css'), path.join(outputDir, 'styles.css'));
  fs.copyFileSync(path.join(sourceDir, 'no-script.css'), path.join(outputDir, 'no-script.css'));
  fs.copyFileSync(path.join(sourceDir, 'guides.css'), path.join(outputDir, 'guides.css'));
  fs.copyFileSync(path.join(sourceDir, 'script.js'), path.join(outputDir, 'script.js'));
  fs.copyFileSync(path.join(sourceDir, 'demo.js'), path.join(outputDir, 'demo.js'));
  copyFlagAssets();
  for (const locale of L.registry) writePage(locale);

  const urls = L.registry.map(L.urlFor).map(url => '  <url>\n    <loc>' + url + '</loc>\n  </url>');
  fs.writeFileSync(
    path.join(outputDir, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.join('\n') + '\n</urlset>\n'
  );
  require('../website/build-guides.cjs').buildGuides();
}

if (require.main === module) main();

module.exports = { main, applyTranslations, localeData, languagePickerMarkup, seoLinks, runtimeKeys, message };
