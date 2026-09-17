// SPDX-License-Identifier: MPL-2.0
(() => {
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const locale = api.i18n.getMessage('translationLocale') || 'en';
  const direction = api.i18n.getMessage('translationDirection') || 'ltr';
  const number = value => new Intl.NumberFormat(locale).format(value);
  function t(key, values = {}) {
    const names = Object.keys(values).sort();
    const result = api.i18n.getMessage(key, names.map(name => String(values[name])));
    if (result) return result;
    const fallback = globalThis.TabToolsEnglish[key];
    return typeof fallback === 'string' ? fallback.replace(/\{([a-zA-Z]+)\}/g, (_,name) => String(values[name] ?? '')) : key;
  }
  function plural(key, count) {
    const category = new Intl.PluralRules(locale).select(count);
    const result = api.i18n.getMessage(`${key}_${category}`, number(count));
    if (result) return result;
    const english = globalThis.TabToolsEnglish[key];
    return (english[new Intl.PluralRules('en').select(count)] || english.other).replace('{count}', new Intl.NumberFormat('en').format(count));
  }
  function localise(root = document) {
    document.documentElement.lang=locale;
    document.documentElement.dir=direction;
    root.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n);});
    for(const attr of ['title','placeholder','aria-label']) {
      root.querySelectorAll(`[data-i18n-${attr}]`).forEach(el=>{el.setAttribute(attr,t(el.getAttribute(`data-i18n-${attr}`)));});
    }
  }
  globalThis.TabToolsI18n={t,plural,number,localise,locale,direction};
})();
