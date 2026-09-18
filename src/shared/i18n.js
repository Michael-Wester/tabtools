// SPDX-License-Identifier: MPL-2.0
(function (root) {
  "use strict";

  const api =
    (typeof chrome !== "undefined" && chrome.i18n) ||
    (typeof browser !== "undefined" && browser.i18n) ||
    null;

  function uiLocale() {
    try {
      if (api && typeof api.getUILanguage === "function") {
        return api.getUILanguage();
      }
    } catch (_) {}
    return "en";
  }

  function pluralCategory(count) {
    try {
      return new Intl.PluralRules(uiLocale()).select(Number(count));
    } catch (_) {
      return Number(count) === 1 ? "one" : "other";
    }
  }

  function substitutions(values) {
    if (values === undefined || values === null) return [];
    if (Array.isArray(values)) return values.map(String);
    return Object.values(values).map(String);
  }

  function getMessage(key, values) {
    let messageKey = key;
    const replacementValues = values && typeof values === "object" && !Array.isArray(values)
      ? values
      : {};

    if (key === "openCount") {
      const category = pluralCategory(replacementValues.count);
      messageKey = "openCount_" + category;
    }

    const args = substitutions(values);
    let value = "";
    try {
      if (api && typeof api.getMessage === "function") {
        value = api.getMessage(messageKey, args) || "";
        if (!value && messageKey.startsWith("openCount_")) {
          value = api.getMessage("openCount_other", args) || "";
        }
      }
    } catch (_) {}

    if (!value) {
      const fallback = {
        extensionName: "TabTools - Close & Sort Tabs by Site",
        extensionDescription: "Close tabs from the same website, sort tabs by site and remove duplicates to keep your browser organised.",
      };
      value = fallback[key] || key;
      value = value.replace(/\{(\w+)\}/g, function (_, name) {
        return replacementValues[name] === undefined ? "" : String(replacementValues[name]);
      });
    }
    return value;
  }

  function localizeDocument(documentRoot) {
    const scope = documentRoot || document;
    scope.querySelectorAll("[data-i18n]").forEach(function (element) {
      element.textContent = getMessage(element.dataset.i18n);
    });
    scope.querySelectorAll("[data-i18n-html]").forEach(function (element) {
      element.innerHTML = getMessage(element.dataset.i18nHtml);
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach(function (element) {
      element.placeholder = getMessage(element.dataset.i18nPlaceholder);
    });
    scope.querySelectorAll("[data-i18n-title]").forEach(function (element) {
      element.title = getMessage(element.dataset.i18nTitle);
    });
    scope.querySelectorAll("[data-i18n-aria]").forEach(function (element) {
      element.setAttribute("aria-label", getMessage(element.dataset.i18nAria));
    });
  }

  root.ttMessage = getMessage;
  root.ttLocalizeDocument = localizeDocument;
  root.ttPluralCategory = pluralCategory;
})(typeof globalThis !== "undefined" ? globalThis : this);
