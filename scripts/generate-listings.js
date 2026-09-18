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

function fullDescription(catalogue) {
  return [
    catalogue.web_close_tabs_by_site_sort,
    '',
    catalogue.web_close_a_site_s_tabs + ': ' + catalogue.web_siteBody.replace(/<[^>]+>/g, ''),
    catalogue.web_sort_tabs_by_site + ': ' + catalogue.web_bring_tabs_from_the_same,
    catalogue.web_remove_duplicate_tabs + ': ' + catalogue.web_close_extra_copies_of_the,
    catalogue.web_search_by_keyword_or_domain + ': ' + catalogue.web_type_a_word_to_match,
    catalogue.web_clear_inactive_tabs + ': ' + catalogue.web_choose_an_inactivity_threshold_in,
    '',
    catalogue.web_the_tabtools_extension_processes_tab,
    '',
    catalogue.web_tabtools_is_available_for_chrome,
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
    '- Full-description source keys: web_close_tabs_by_site_sort, web_siteBody, web_bring_tabs_from_the_same, web_close_extra_copies_of_the, web_type_a_word_to_match, web_choose_an_inactivity_threshold_in, web_the_tabtools_extension_processes_tab, web_tabtools_is_available_for_chrome',
    '- Linguistic review: AI self-review only; no native-speaker review claimed',
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
}

if (require.main === module) main();

module.exports = { fullDescription, listing, stores };
