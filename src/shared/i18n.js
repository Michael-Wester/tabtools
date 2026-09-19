// SPDX-License-Identifier: MPL-2.0
(function (root) {
  "use strict";
  const api = (typeof chrome !== "undefined" && chrome.i18n) ||
    (typeof browser !== "undefined" && browser.i18n) || null;
  const english = root.TabToolsEnglish || {};

  function browserMessage(key, args = []) {
    try { return api?.getMessage(key, args) || ""; } catch (_) { return ""; }
  }

  // Use the selected catalogue's language, including the browser's English
  // fallback, rather than plural rules for an unsupported UI language.
  function uiLocale() {
    return browserMessage("translationLocale") || "en";
  }

  function pluralCategory(count) {
    try { return new Intl.PluralRules(uiLocale()).select(Number(count)); }
    catch (_) { return Number(count) === 1 ? "one" : "other"; }
  }

  function number(value) {
    try { return new Intl.NumberFormat(uiLocale()).format(Number(value)); }
    catch (_) { return String(value); }
  }

  function getMessage(key, values = {}, options = {}) {
    const named = values && typeof values === "object" && !Array.isArray(values) ? values : {};
    const format = (name, value) => name === "count" && options.formatNumbers !== false ? number(value) : String(value);
    const sourceEntry = english[key];
    const plural = sourceEntry && typeof sourceEntry === "object";
    const source = plural ? sourceEntry.other : sourceEntry;
    const names = [...new Set((source || "").match(/\{\w+\}/g) || [])].map(token => token.slice(1, -1));
    const args = Array.isArray(values) ? values.map(String) :
      (names.length ? names : Object.keys(named)).map(name => format(name, named[name] ?? ""));
    const category = plural ? pluralCategory(named.count) : null;
    const messageKey = category ? key + "_" + category : key;
    let value = browserMessage(messageKey, args);
    if (!value && category) value = browserMessage(key + "_other", args);
    if (value) return value;

    // Keep error/empty states readable even if a browser message is unavailable.
    const fallback = english[key];
    value = typeof fallback === "object"
      ? fallback[Number(named.count) === 1 ? "one" : "other"]
      : fallback;
    return String(value || key).replace(/\{(\w+)\}/g, (_, name) => format(name, named[name] ?? ""));
  }

  function localizeDocument(documentRoot) {
    const scope = documentRoot || document;
    if (scope.documentElement) {
      scope.documentElement.lang = uiLocale();
      scope.documentElement.dir = browserMessage("translationDirection") === "rtl" ? "rtl" : "ltr";
    }
    scope.querySelectorAll("[data-i18n]").forEach(element => {
      element.textContent = getMessage(element.dataset.i18n);
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach(element => {
      element.placeholder = getMessage(element.dataset.i18nPlaceholder);
    });
    scope.querySelectorAll("[data-i18n-title]").forEach(element => {
      element.title = getMessage(element.dataset.i18nTitle);
    });
    scope.querySelectorAll("[data-i18n-aria]").forEach(element => {
      element.setAttribute("aria-label", getMessage(element.dataset.i18nAria));
    });
  }

  root.ttMessage = getMessage;
  root.ttLocalizeDocument = localizeDocument;
  root.ttPluralCategory = pluralCategory;
  root.ttNumber = number;
})(typeof globalThis !== "undefined" ? globalThis : this);
