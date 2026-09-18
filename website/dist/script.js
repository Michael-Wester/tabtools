(() => {
  const stores = {
    chrome: 'https://chromewebstore.google.com/detail/tabtools/penbnlignepchllgkflhnpfbabdfalkk',
    firefox: 'https://addons.mozilla.org/en-US/firefox/addon/tabtools-michael-wester/',
    edge: 'https://microsoftedge.microsoft.com/addons/detail/tabtools/hajmbphgjkkinedfebgnpodlknanfdlh'
  };
  const browserNames = { chrome: 'Chrome', firefox: 'Firefox', edge: 'Edge' };
  const storeNames = {
    chrome: 'Chrome Web Store',
    firefox: 'Firefox Add-ons',
    edge: 'Microsoft Edge Add-ons'
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));

  function pageData() {
    try {
      const node = document.getElementById('locale-data');
      return node ? JSON.parse(node.textContent || '{}') : {};
    } catch (_) {
      return {};
    }
  }

  const data = pageData();
  const messages = data.messages || {};
  const registry = Array.isArray(data.registry) ? data.registry : [];
  const currentLocale = data.locale || document.documentElement.lang || 'en';

  function message(key, values = {}) {
    let value = messages[key] ?? '';
    if (typeof value !== 'string') return value;
    return value.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ('{' + name + '}')));
  }

  function browserKey() {
    const ua = navigator.userAgent || '';
    if (/Edg(?:e|A|iOS)?\//.test(ua)) return 'edge';
    if (/(?:Firefox|FxiOS)\//.test(ua)) return 'firefox';
    return 'chrome';
  }

  function browserLabel(key) {
    return storeNames[key] || storeNames.chrome;
  }

  function localisedAddLabel(key) {
    const value = message('web_addTo', { browser: browserNames[key] });
    return value.includes('{browser}')
      ? value.replace('{browser}', browserNames[key])
      : value;
  }

  function setCopyLabel(link, key) {
    const copy = link.querySelector('[data-browser-copy]');
    if (!copy) return;
    const name = link.querySelector('[data-browser-name]');
    const fullLabel = localisedAddLabel(key);
    if (name) {
      const template = message('web_addTo', { browser: '{browser}' });
      const parts = template.split('{browser}');
      name.textContent = browserNames[key];
      if (parts.length === 2) {
        copy.replaceChildren(
          document.createTextNode(parts[0]),
          name,
          document.createTextNode(parts[1])
        );
      } else {
        copy.replaceChildren(document.createTextNode(fullLabel));
      }
    } else {
      copy.replaceChildren(document.createTextNode(fullLabel));
    }
  }

  function setStoreLinks() {
    const detected = browserKey();
    $$('[data-store]').forEach(link => {
      const key = link.hasAttribute('data-adaptive-store') ? detected : link.dataset.store;
      if (!stores[key]) return;

      const url = new URL(stores[key]);
      url.searchParams.set('utm_source', 'tabtools.fyi');
      url.searchParams.set('utm_medium', 'referral');
      url.searchParams.set('utm_campaign', 'website');
      url.searchParams.set('utm_content', (link.dataset.utmPlacement || 'store') + '_' + key);
      link.href = url.href;
      link.dataset.store = key;
      setCopyLabel(link, key);

      const browserIcon = link.querySelector('[data-browser-icon]');
      if (browserIcon) browserIcon.src = '/assets/browsers/' + key + '.svg';
      const visibleLabel = link.textContent.trim().replace(/\s+/g, ' ');
      link.setAttribute('aria-label', message('web_storeAria', {
        label: visibleLabel,
        store: browserLabel(key)
      }));
    });

    $$('[data-alternative-store]').forEach(link => {
      link.hidden = link.dataset.store === detected;
    });

    const note = $('[data-store-note]');
    if (note) note.textContent = message('web_storeNote', { store: browserLabel(detected) });

    const mobileNote = $('[data-mobile-note]');
    if (mobileNote) {
      const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      mobileNote.hidden = !mobile;
    }
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('tabtools-site-theme', theme); } catch (_) {}

    const dark = theme === 'dark';
    const toggle = $('[data-theme-toggle]');
    if (toggle) {
      const label = dark ? message('web_switchLight') : message('web_switch_to_dark_mode');
      toggle.setAttribute('aria-label', label);
      toggle.title = label;
    }

    const label = $('[data-theme-label]');
    if (label) label.textContent = dark ? message('web_lightMode') : message('web_dark_mode');

    const metaTheme = $('meta[name="theme-color"]');
    if (metaTheme) metaTheme.content = dark ? '#111216' : '#f6f6f4';
  }

  function initTheme() {
    let current = document.documentElement.dataset.theme;
    if (!current) {
      try { current = localStorage.getItem('tabtools-site-theme'); } catch (_) {}
    }
    if (current !== 'dark' && current !== 'light') current = 'light';
    setTheme(current);

    const toggle = $('[data-theme-toggle]');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
      });
    }
  }

  function pathFor(locale) {
    const found = registry.find(item => item.locale === locale);
    if (!found || !found.path || found.path === '/') return '/';
    return found.path.endsWith('/') ? found.path : found.path + '/';
  }

  function localeForPreference(preference) {
    const raw = String(preference || '').replace('_', '-');
    const pathMatch = registry.find(item => item.path === raw || item.path === raw + '/');
    if (pathMatch) return pathMatch;
    const exact = registry.find(item => item.locale.toLowerCase() === raw.toLowerCase());
    if (exact) return exact;
    const language = raw.split('-')[0].toLowerCase();
    if (language === 'zh' && /hant/i.test(raw)) return registry.find(item => item.locale === 'zh-TW');
    if (language === 'zh' && /hans/i.test(raw)) return registry.find(item => item.locale === 'zh-CN');
    const matches = registry.filter(item => item.locale.toLowerCase().split('-')[0] === language);
    if (matches.length === 1) return matches[0];
    if (language === 'no') return registry.find(item => item.locale === 'nb');
    return registry.find(item => item.locale === 'en') || null;
  }

  function currentLocationSuffix() {
    return (window.location.search || '') + (window.location.hash || '');
  }

  function languageDisplayName(item) {
    return item?.languageName || item?.nativeName || item?.locale || '';
  }

  function languageFlagSrc(item) {
    return item?.flagAsset ? '/assets/flags/' + item.flagAsset : '';
  }

  function initLanguage() {
    const picker = $('[data-language-picker]');
    const trigger = $('[data-language-trigger]');
    const menu = $('[data-language-menu]');
    const options = () => $$('[data-language-option]');

    if (picker && trigger && menu) {
      const selected = registry.find(item => item.locale === currentLocale) || registry[0];
      const flag = trigger.querySelector?.('[data-language-flag-image]');
      const name = trigger.querySelector?.('[data-language-name]');

      const setTriggerSelection = item => {
        if (!item) return;
        const displayName = languageDisplayName(item);
        const src = languageFlagSrc(item);
        if (flag && src) flag.src = src;
        if (name) name.textContent = displayName;
        const accessibleLabel = message('web_language') + ': ' + displayName;
        trigger.setAttribute('aria-label', accessibleLabel);
        trigger.title = accessibleLabel;
      };
      setTriggerSelection(selected);

      const focusOption = option => {
        option?.focus?.();
        option?.scrollIntoView?.({ block: 'nearest' });
      };

      const setOpen = (open, focusSelected = false) => {
        picker.dataset.open = open ? 'true' : 'false';
        trigger.setAttribute('aria-expanded', String(open));
        menu.hidden = !open;
        if (open && focusSelected) {
          const current = options().find(option => option.dataset.locale === currentLocale);
          focusOption(current);
        }
      };

      const choose = (option, event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        const chosen = registry.find(item => item.locale === option.dataset.locale);
        if (!chosen) return;
        try { localStorage.setItem('tabtools-site-language', chosen.locale); } catch (_) {}
        setOpen(false);
        window.location.assign(pathFor(chosen.locale) + currentLocationSuffix());
      };

      options().forEach(option => {
        option.setAttribute('aria-selected', String(option.dataset.locale === currentLocale));
        option.setAttribute('lang', 'en');
        option.setAttribute('dir', 'ltr');
        option.addEventListener('click', event => choose(option, event));
        option.addEventListener('keydown', event => {
          const items = options();
          const index = items.indexOf(option);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const next = event.key === 'ArrowDown'
              ? (index + 1) % items.length
              : (index - 1 + items.length) % items.length;
            focusOption(items[next]);
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            focusOption(items[event.key === 'Home' ? 0 : items.length - 1]);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            trigger.focus?.();
          } else if (event.key === 'Enter' || event.key === ' ') {
            choose(option, event);
          }
        });
      });

      trigger.addEventListener('click', () => {
        setOpen(menu.hidden, menu.hidden);
      });
      trigger.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setOpen(true, true);
        } else if (event.key === 'Escape') {
          setOpen(false);
        }
      });

      document.addEventListener?.('click', event => {
        if (!picker.contains?.(event.target)) setOpen(false);
      });
      setOpen(false);
    }

    const suggestion = $('[data-language-suggestion]');
    if (!suggestion) return;
    let saved = null;
    try { saved = localStorage.getItem('tabtools-site-language'); } catch (_) {}
    const preferences = saved
      ? [saved].concat(Array.isArray(navigator.languages) ? navigator.languages : [])
      : (Array.isArray(navigator.languages) ? navigator.languages : []);
    let target = null;
    for (const preference of preferences) {
      const candidate = localeForPreference(preference);
      if (candidate && candidate.locale !== currentLocale) {
        target = candidate;
        break;
      }
    }
    if (!target) {
      suggestion.hidden = true;
      return;
    }

    const link = document.createElement('a');
    link.href = pathFor(target.locale) + currentLocationSuffix();
    link.textContent = message('web_languageSuggestion', { language: languageDisplayName(target) });
    suggestion.replaceChildren(link);
    suggestion.hidden = false;
  }

  function initPrivacyNavigation() {
    const card = $('#privacy .privacy-card');
    if (!card) return;

    function centerPrivacy() {
      const headerHeight = $('.site-header')?.getBoundingClientRect().height || 0;
      const rect = card.getBoundingClientRect();
      const spaceAbove = Math.max(16, (window.innerHeight - headerHeight - rect.height) / 2);
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({
        top: Math.max(0, window.scrollY + rect.top - headerHeight - spaceAbove),
        behavior: reducedMotion ? 'instant' : 'smooth'
      });
    }

    $$('a[href="#privacy"]').forEach(link => {
      link.addEventListener('click', event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (window.location.hash !== '#privacy') window.history.pushState(null, '', '#privacy');
        $('#privacy').focus({ preventScroll: true });
        centerPrivacy();
      });
    });
    window.addEventListener('hashchange', () => {
      if (window.location.hash === '#privacy') centerPrivacy();
    });
    window.addEventListener('load', () => {
      if (window.location.hash === '#privacy') centerPrivacy();
    }, { once: true });
  }

  function init() {
    setStoreLinks();
    initTheme();
    initLanguage();
    initPrivacyNavigation();
  }

  init();
})();
