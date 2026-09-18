// SPDX-License-Identifier: MPL-2.0
'use strict';

const fs = require('fs');
const path = require('path');
const L = require('./localisation');

const sourceDir = path.join(L.root, 'website', 'src');
const outputDir = path.join(L.root, 'website', 'dist');
const template = fs.readFileSync(path.join(sourceDir, 'template.html'), 'utf8');

function htmlMessage(value) {
  return String(value)
    .replaceAll('<em>', '<span>')
    .replaceAll('</em>', '</span>')
    .replaceAll('<br>', '<br />');
}

function replaceLiterals(input, replacements) {
  const aliases = new Map();
  const tokenValues = [];

  replacements.forEach(({ source, replacement }, index) => {
    if (!source || typeof source !== 'string') return;
    const token = '__TABTOOLS_LOCALE_' + index + '__';
    tokenValues.push([token, replacement]);
    for (const literal of new Set([source, L.escape(source)])) {
      if (!literal) continue;
      const existing = aliases.get(literal);
      if (existing && existing.replacement !== replacement) {
        throw new Error('Ambiguous website localisation source: ' + literal);
      }
      aliases.set(literal, { token, replacement });
    }
  });

  let output = input;
  [...aliases.entries()]
    .sort((left, right) => right[0].length - left[0].length)
    .forEach(([literal, value]) => {
      output = output.split(literal).join(value.token);
    });
  for (const [token, replacement] of tokenValues) {
    output = output.split(token).join(replacement);
  }
  return output;
}

function replaceAttribute(input, name, value) {
  const expression = new RegExp('(<[^>]+(?:name|property)="' + name + '"[^>]*content=")[^"]*(")', 'i');
  return input.replace(expression, '$1' + L.escape(value) + '$2');
}

function localeData(locale) {
  return {
    locale: locale.locale,
    registry: L.registry.map(item => ({
      locale: item.locale,
      canonical: item.canonical,
      path: item.path,
      nativeName: item.nativeName,
    })),
    messages: L.catalogue(locale.locale),
  };
}

function selectOptions(current) {
  return L.registry.map(item => {
    const selected = item.locale === current.locale ? ' selected' : '';
    return '<option lang="' + L.escape(item.canonical) + '" value="' +
      L.escape(item.path) + '"' + selected + '>' +
      L.escape(item.nativeName) + '</option>';
  }).join('');
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
  const source = L.catalogue('en');
  const target = L.catalogue(locale.locale);

  const headlineBindings = [
    ['web_heroTitle', 'Close tabs from the <span>same site.</span>'],
    ['web_featuresTitle', 'Close by site.<br /><span>Sort what stays.</span>'],
    ['web_workflowTitle', 'Add TabTools.<br /><span>Choose what to clear.</span>'],
    ['web_privacyTitle', 'Your tab data stays<br />in your browser.'],
    ['web_finalTitle', 'Close finished tabs.<br /><span>Sort what’s left.</span>'],
  ];
  const replacements = headlineBindings.map(([key, existing]) => ({
    source: existing,
    replacement: htmlMessage(target[key]),
  }));

  for (const [key, value] of Object.entries(source)) {
    if (!key.startsWith('web_') || typeof value !== 'string') continue;
    replacements.push({
      source: value,
      replacement: htmlMessage(target[key]),
    });
  }

  // A few instructional labels are shared with the extension UI rather than
  // the website catalogue. Replace those source literals too so generated
  // pages do not leave English UI labels behind (for example, “Open TabTools”).
  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith('web_') || typeof value !== 'string') continue;
    replacements.push({
      source: value,
      replacement: htmlMessage(target[key]),
    });
  }

  let output = replaceLiterals(html, replacements);

  const addToParts = String(target.web_addTo).split('{browser}');
  if (addToParts.length === 2) {
    output = output.replace(
      /(<span class="browser-button-copy" data-browser-copy="[^"]*">)[\s\S]*?(<span class="browser-button-name" data-browser-name>[^<]*<\/span>)(<\/span>)/g,
      '$1' + L.escape(addToParts[0]) + '$2' + L.escape(addToParts[1]) + '$3'
    );
  }

  output = output.replace(/<html lang="[^"]+" dir="[^"]+">/, '<html lang="' +
    L.escape(locale.canonical) + '" dir="' + L.escape(locale.direction) + '">');

  const title = target.web_tabtools_close_tabs_by_site;
  const description = target.web_close_tabs_from_the_same;
  const ogDescription = target.web_close_tabs_by_site_sort;
  output = output.replace(/<title>[^<]*<\/title>/, '<title>' + L.escape(title) + '</title>');
  output = replaceAttribute(output, 'description', description);
  output = replaceAttribute(output, 'og:title', title);
  output = replaceAttribute(output, 'og:description', ogDescription);
  output = replaceAttribute(output, 'twitter:title', title);
  output = replaceAttribute(output, 'twitter:description', ogDescription);
  output = output.replace(/(<meta property="og:url" content=")[^"]*(")/, '$1' + L.urlFor(locale) + '$2');
  output = output.replace(/(<link rel="canonical" href=")[^"]*(")/, '$1' + L.urlFor(locale) + '$2');

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'TabTools',
    url: L.urlFor(locale),
    description: target.web_structuredDescription,
    inLanguage: locale.locale,
    applicationCategory: 'BrowserApplication',
    isAccessibleForFree: true,
  };
  output = output.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    '<script type="application/ld+json">' + safeJson(structuredData) + '</script>'
  );
  output = output.replace(
    /\s*<link rel="alternate" hreflang="en"[^>]*>[\s\S]*?<link rel="alternate" hreflang="x-default"[^>]*>\s*/,
    '\n' + seoLinks() + '\n'
  );
  output = output.replace(
    /<script type="application\/json" id="locale-data">[\s\S]*?<\/script>/,
    '<script type="application/json" id="locale-data">' +
      safeJson(localeData(locale)) + '</script>'
  );
  output = output.replace(
    /<select data-language-select[^>]*>[\s\S]*?<\/select>/,
    '<select data-language-select aria-label="' + L.escape(target.web_language) + '">' +
      selectOptions(locale) + '</select>'
  );
  output = output.replace(
    /(<span data-store-note>)[\s\S]*?(<\/span>)/,
    '$1' + L.escape(String(target.web_storeNote).replace('{store}', 'Chrome Web Store')) + '$2'
  );

  return output;
}

function writePage(locale) {
  const output = applyTranslations(template, locale);
  const directory = path.join(outputDir, locale.website);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), output);
}

function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(path.join(sourceDir, 'styles.css'), path.join(outputDir, 'styles.css'));
  fs.copyFileSync(path.join(sourceDir, 'script.js'), path.join(outputDir, 'script.js'));
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

module.exports = { applyTranslations, localeData, selectOptions, seoLinks };
