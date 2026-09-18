// SPDX-License-Identifier: MPL-2.0
'use strict';
const richKeys = new Set(['web_heroTitle', 'web_featuresTitle', 'web_workflowTitle', 'web_privacyTitle', 'web_finalTitle', 'web_siteBody']);
const placeholders = text => (String(text).match(/\{\w+\}/g) || []).sort();

function validateCatalogue(source, catalogue, locale) {
  const errors = [];
  for (const key of Object.keys(catalogue)) {
    if (!(key in source)) errors.push(`${key}: unknown key`);
  }
  for (const [key, original] of Object.entries(source)) {
    const value = catalogue[key];
    if (typeof original === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${key}: expected plural forms`);
        continue;
      }
      const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
      for (const category of new Set([...categories, 'other'])) {
        if (!(category in value)) errors.push(`${key}: missing plural ${category}`);
      }
      for (const [category, text] of Object.entries(value)) {
        if (!['zero', 'one', 'two', 'few', 'many', 'other'].includes(category)) errors.push(`${key}: invalid plural ${category}`);
        check(`${key}.${category}`, text, original.other, false);
      }
    } else {
      check(key, value, original, richKeys.has(key));
    }
  }
  return errors;

  function check(key, value, original, rich) {
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(`${key}: expected nonempty text`);
      return;
    }
    if (JSON.stringify(placeholders(value)) !== JSON.stringify(placeholders(original))) errors.push(`${key}: changed placeholders`);
    const tags = value.match(/<[^>]*>/g) || [];
    const allowed = rich ? /^(<\/?(?:em|strong)>|<br>)$/ : /a^/;
    if (tags.some(tag => !allowed.test(tag)) || /[<>]/.test(value.replace(/<[^>]*>/g, ''))) {
      errors.push(`${key}: unsupported markup`);
    }
    const stack = [];
    for (const tag of tags) {
      if (tag === '<br>') continue;
      if (tag.startsWith('</')) {
        if (stack.pop() !== tag.slice(2, -1)) errors.push(`${key}: unbalanced markup`);
      } else stack.push(tag.slice(1, -1));
    }
    if (stack.length) errors.push(`${key}: unbalanced markup`);
    for (const brand of ['TabTools', 'Chrome', 'Firefox', 'Edge', 'YouTube', 'GitHub', 'youtube.com']) {
      if (String(original).includes(brand) && !value.includes(brand)) errors.push(`${key}: missing brand/domain ${brand}`);
    }
  }
}
module.exports = { validateCatalogue, richKeys };
