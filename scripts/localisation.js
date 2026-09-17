// SPDX-License-Identifier: MPL-2.0
// Shared build-time helpers. No network, dependencies, or runtime translation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const registry = read('localisation/registry.json');
const english = read('localisation/locales/en.json');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tokens = value => [...String(value).matchAll(/\{([a-zA-Z]+)\}/g)].map(m => m[1]).sort();
const catalogue = locale => read(`localisation/locales/${locale}.json`);
const urlFor = locale => `https://tabtools.fyi/${locale.website ? locale.website + '/' : ''}`;
function write(file, content, check = false) {
  const target = path.join(root, file);
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) throw new Error(`Stale generated file: ${file}`);
  } else {
    fs.mkdirSync(path.dirname(target), {recursive:true});
    fs.writeFileSync(target, content);
  }
}
const json = value => JSON.stringify(value, null, 2) + '\n';
const listingKeys = [
  'extensionDescription','web_siteBody','web_bring_tabs_from_the_same',
  'web_close_extra_copies_of_the','web_type_a_word_to_match',
  'web_choose_an_inactivity_threshold_in','web_use_undo_immediately_after_closing',
  'web_light_and_dark_themes','web_local_cleanup_statistics',
  'web_the_tabtools_extension_processes_tab'
];
const plain = value => value.replace(/<\/?(?:em|strong)>|<br>/g, '');
function listing(data) {
  return {name:data.extensionName, summary:data.extensionDescription,
    description:listingKeys.map(key => plain(data[key])).join('\n\n')};
}
function messages(data, locale) {
  const out = {translationLocale:{message:locale.locale}, translationDirection:{message:locale.direction}};
  function entry(key, value) {
    const names = [...new Set(tokens(value))];
    const placeholders = Object.fromEntries(names.map((name, i) => [name, {content:'$'+(i+1), example:name === 'count' ? '3' : 'example.com'}]));
    out[key] = {message:value.replace(/\{([a-zA-Z]+)\}/g, (_, name) => '$'+name+'$')};
    if (names.length) out[key].placeholders = placeholders;
  }
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('web_')) continue;
    if (typeof value === 'object') {
      // Define every category: native getMessage fallback must never select an
      // English plural form just because the target language has fewer forms.
      for (const category of ['zero','one','two','few','many','other']) entry(`${key}_${category}`, value[category] || value.other);
    } else entry(key,value);
  }
  return out;
}
function issuesFor(locale, data) {
  const errors = [], identical = [];
  let reviews = {};
  try { reviews = read(`localisation/reviews/${locale.locale}.json`); } catch (_) {}
  for (const [key, original] of Object.entries(english)) {
    const value = data[key];
    if (!value || typeof value !== typeof original) {errors.push(`missing/type: ${key}`); continue;}
    const values = typeof value === 'object' ? Object.values(value) : [value];
    const sourceValue = typeof original === 'object' ? original.other : original;
    for (const v of values) {
      if (typeof v !== 'string' || !v.trim()) {errors.push(`empty: ${key}`);continue;}
      if (JSON.stringify(tokens(v)) !== JSON.stringify(tokens(sourceValue))) errors.push(`placeholders: ${key}`);
      const tags = s => (s.match(/<\/?(?:em|strong)>|<br>/g)||[]).sort().join();
      if (tags(v) !== tags(sourceValue)) errors.push(`markup: ${key}`);
      if (/<(?!\/?(?:em|strong)>|br>)/.test(v)) errors.push(`unsupported markup: ${key}`);
    }
    if (typeof value === 'object') for (const category of new Intl.PluralRules(locale.locale).resolvedOptions().pluralCategories) {
      if (!value[category]) errors.push(`plural ${category}: ${key}`);
    }
    if (locale.locale !== 'en') {
      const review = reviews[key];
      if (!review || review.source !== hash(original) || review.translation !== hash(value)) errors.push(`stale/unreviewed: ${key}`);
      if (JSON.stringify(value) === JSON.stringify(original) && !review?.identicalReason) identical.push(key);
    }
  }
  for (const key of Object.keys(data)) if (!(key in english)) errors.push(`unknown key: ${key}`);
  if (data.extensionName && data.extensionDescription) {
    const fields=listing(data);
    // UTF-16 length is conservative for supplementary characters on platforms
    // that count Unicode code points. All copy is plain text.
    if (fields.name.length > 50) errors.push('name exceeds AMO 50-character limit');
    if (fields.summary.length > 132) errors.push('summary exceeds Chromium 132-character limit');
    if (fields.description.length < 250 || fields.description.length > 10000) errors.push('description outside Edge 250–10000 characters');
    if (/\{[a-z]+\}/.test(fields.description)) errors.push('unresolved listing placeholders');
  }
  return {errors, identical};
}
module.exports = {fs,path,root,read,registry,english,catalogue,hash,escape,tokens,urlFor,write,json,listing,listingKeys,messages,issuesFor};
