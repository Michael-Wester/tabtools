// SPDX-License-Identifier: MPL-2.0
'use strict';

const fs = require('fs');
const path = require('path');
const L = require('./localisation');

const stores = {
  chrome: {
    name: 'Chrome Web Store',
    url: 'https://chromewebstore.google.com/detail/tabtools/penbnlignepchllgkflhnpfbabdfalkk',
    titleField: 'Title',
    summaryField: 'Summary',
  },
  firefox: {
    name: 'Firefox Add-ons',
    url: 'https://addons.mozilla.org/en-US/firefox/addon/tabtools-michael-wester/',
    titleField: 'Name',
    summaryField: 'Short description',
  },
  edge: {
    name: 'Microsoft Edge Add-ons',
    url: 'https://microsoftedge.microsoft.com/addons/detail/tabtools/hajmbphgjkkinedfebgnpodlknanfdlh',
    titleField: 'Extension name',
    summaryField: 'Short description',
  },
};

const featureKeys = [
  ['web_close_a_site_s_tabs', 'web_siteBody'],
  ['web_sort_tabs_by_site', 'web_bring_tabs_from_the_same'],
  ['web_remove_duplicate_tabs', 'web_close_extra_copies_of_the'],
  ['web_search_by_keyword_or_domain', 'web_type_a_word_to_match'],
  ['web_clear_inactive_tabs', 'web_choose_an_inactivity_threshold_in'],
];
const descriptionKeys = [
  'web_close_tabs_by_site_sort', ...featureKeys.flat(),
  'web_the_tabtools_extension_processes_tab',
];

function fullDescription(catalogue) {
  return [
    catalogue.web_close_tabs_by_site_sort,
    '',
    ...featureKeys.map(([heading, body]) => catalogue[heading] + ': ' + catalogue[body].replace(/<[^>]+>/g, '')),
    '',
    catalogue.web_the_tabtools_extension_processes_tab,
  ].join('\n');
}

function listing(locale, store) {
  const c = L.catalogue(locale.locale);
  const title = c.extensionName;
  const summary = c.extensionDescription;
  const description = fullDescription(c);
  const source = L.catalogue('en');
  const sourceDescription = fullDescription(source);
  return [
    '# TabTools listing text',
    '',
    '- Store: ' + store.name,
    '- Locale: ' + locale.locale + ' (' + locale.nativeName + ')',
    '- Store locale code: ' + locale.stores[store.key],
    '- Source baseline: ' + L.registrySource.baseCommit,
    '- Source URL: ' + store.url,
    '- Generated from localisation/locales/' + locale.locale + '.json',
    '',
    '## ' + store.titleField,
    '',
    title,
    '',
    'Character count: ' + Array.from(title).length,
    '',
    '## ' + store.summaryField,
    '',
    summary,
    '',
    'Character count: ' + Array.from(summary).length,
    '',
    '## Full description',
    '',
    description,
    '',
    'Character count: ' + Array.from(description).length,
    '',
    '## Maintenance metadata',
    '',
    '- Title source fingerprint: ' + L.fingerprint(source.extensionName),
    '- Summary source fingerprint: ' + L.fingerprint(source.extensionDescription),
    '- Full-description source fingerprint: ' + L.fingerprint(sourceDescription),
    '- Full-description source keys: ' + descriptionKeys.join(', '),
    '- Linguistic review: AI self-review only; no native-speaker review claimed',
    '',
  ].join('\n');
}

function listingIndex() {
  return [
    '# Store-text index',
    '',
    'All fields are proposed next-release text; no live listings were edited. See [maintenance and release checklist](README.md).',
    '',
    '| Locale | Chrome | Firefox | Edge |',
    '|---|---|---|---|',
    ...L.registry.map(locale => '| ' + locale.locale + ' | ' + Object.keys(stores).map(store =>
      '[Text](listings/' + store + '/' + locale.locale + '.md)').join(' | ') + ' |'),
    '',
  ].join('\n');
}

function main() {
  const root = path.join(L.root, 'marketing', 'listings');
  for (const locale of L.registry) {
    for (const [key, config] of Object.entries(stores)) {
      const directory = path.join(root, key);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, locale.locale + '.md'), listing(locale, { ...config, key }));
    }
  }
  const expected = new Set(L.registry.map(locale => locale.locale + '.md'));
  for (const key of Object.keys(stores)) {
    const directory = path.join(root, key);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md') && !expected.has(entry.name)) {
        fs.rmSync(path.join(directory, entry.name), { force: true });
      }
    }
  }
  fs.writeFileSync(path.join(L.root, 'marketing', 'INDEX.md'), listingIndex());
}

if (require.main === module) main();

module.exports = { main, fullDescription, listing, listingIndex, stores };
