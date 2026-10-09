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

  function setCopyLabel(link, key, mobile) {
    const copy = link.querySelector('[data-browser-copy]');
    if (!copy) return;
    const name = link.querySelector('[data-browser-name]');
    const messageKey = mobile ? 'web_view' : 'web_addTo';
    const template = message(messageKey, { browser: '{browser}' }) ||
      (mobile ? 'View {browser}' : 'Add to {browser}');
    const fullLabel = template.replace('{browser}', browserNames[key]);
    if (name) {
      const parts = template.split('{browser}');
      name.textContent = browserNames[key];
      if (parts.length === 2) {
        const prefix = document.createElement('span');
        prefix.className = 'browser-button-prefix';
        prefix.textContent = parts[0];
        copy.replaceChildren(
          prefix,
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
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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
      setCopyLabel(link, key, mobile);

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

    $$('[data-mobile-note]').forEach(mobileNote => {
      mobileNote.hidden = !mobile;
    });
  }

  // The page follows the system's light or dark setting until the visitor
  // chooses one. Only a choice is saved: 'system' means nothing is stored.
  const root = document.documentElement;
  const systemDark = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const themeColors = { light: '#f6f6f4', dark: '#1a1b21' };
  const accents = ['blue', 'green', 'orange', 'pink', 'graphite'];

  function theme() {
    return root.dataset.theme === 'dark' || root.dataset.theme === 'light' ? root.dataset.theme : 'system';
  }

  function shownTheme() {
    const chosen = theme();
    if (chosen !== 'system') return chosen;
    return systemDark && systemDark.matches ? 'dark' : 'light';
  }

  function accent() {
    return accents.includes(root.dataset.accent) ? root.dataset.accent : 'purple';
  }

  function store(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (_) {}
  }

  function syncAppearance() {
    const dark = shownTheme() === 'dark';
    const toggle = $('[data-theme-toggle]');
    if (toggle) {
      const label = dark ? message('web_switchLight') : message('web_switch_to_dark_mode');
      toggle.setAttribute('aria-label', label);
      toggle.title = label;
    }
    // The browser's own bars take the page colour: one tag per system setting
    // while following the system, the chosen colour in both once chosen.
    const chosen = theme();
    $$('meta[name="theme-color"]').forEach(meta => {
      const forDark = /dark/.test(meta.getAttribute('media') || '');
      meta.content = themeColors[chosen === 'system' ? (forDark ? 'dark' : 'light') : chosen];
    });
    if (typeof Event === 'function' && document.dispatchEvent) document.dispatchEvent(new Event('tabtools:appearance'));
  }

  function setTheme(value) {
    if (value === 'dark' || value === 'light') {
      root.dataset.theme = value;
      store('tabtools-site-theme', value);
    } else {
      delete root.dataset.theme;
      store('tabtools-site-theme', null);
    }
    syncAppearance();
  }

  function setAccent(value) {
    if (accents.includes(value)) {
      root.dataset.accent = value;
      store('tabtools-site-accent', value);
    } else {
      delete root.dataset.accent;
      store('tabtools-site-accent', null);
    }
    syncAppearance();
  }

  function initTheme() {
    syncAppearance();
    const toggle = $('[data-theme-toggle]');
    if (toggle) toggle.addEventListener('click', () => setTheme(shownTheme() === 'dark' ? 'light' : 'dark'));
    if (systemDark && systemDark.addEventListener) systemDark.addEventListener('change', syncAppearance);
    // The working popup's Settings view changes the same two things.
    window.TabToolsSite = { theme, setTheme, accent, setAccent };
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
    return null;
  }

  function currentLocationSuffix() {
    return (window.location.search || '') + (window.location.hash || '');
  }

  // Keep actual hrefs current, including middle-click and context-menu opens.
  function updateLanguageLinks() {
    const links = $$('[data-language-option]');
    const suggestionLink = $('[data-language-suggestion]')?.querySelector('a');
    if (suggestionLink) links.push(suggestionLink);
    links.forEach(link => {
      link.href = pathFor(link.dataset.locale) + currentLocationSuffix();
    });
  }

  // Each language goes by its own name, so nobody has to know its English one.
  function languageDisplayName(item) {
    return item?.nativeName || item?.locale || '';
  }

  function languageFlagSrc(item) {
    return item?.flagAsset ? '/assets/flags/' + item.flagAsset : '';
  }

  function initLanguage() {
    window.addEventListener('hashchange', updateLanguageLinks);
    window.addEventListener('popstate', updateLanguageLinks);
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
        options().forEach(item => { item.tabIndex = item === option ? 0 : -1; });
        option?.focus?.();
        option?.scrollIntoView?.({ block: 'nearest' });
      };

      const setOpen = (open, focusSelected = false) => {
        if (open) updateLanguageLinks();
        picker.dataset.open = open ? 'true' : 'false';
        trigger.setAttribute('aria-expanded', String(open));
        menu.hidden = !open;
        if (open && focusSelected) {
          const current = options().find(option => option.dataset.locale === currentLocale);
          focusOption(current);
        }
      };

      const choose = (option, event) => {
        option.href = pathFor(option.dataset.locale) + currentLocationSuffix();
        if (event?.ctrlKey || event?.metaKey || event?.shiftKey || event?.altKey || event?.button > 0) return;
        event?.preventDefault?.();
        event?.stopPropagation?.();
        const chosen = registry.find(item => item.locale === option.dataset.locale);
        if (!chosen) return;
        try { localStorage.setItem('tabtools-site-language', chosen.locale); } catch (_) {}
        setOpen(false);
        trigger.focus?.();
        // Selecting this page's language can be a same-document navigation.
        // Apply the saved choice immediately instead of retaining an outdated
        // browser-language suggestion until a reload.
        if (chosen.locale === currentLocale) {
          const suggestion = $('[data-language-suggestion]');
          if (suggestion) suggestion.hidden = true;
        }
        window.location.assign(pathFor(chosen.locale) + currentLocationSuffix());
      };

      options().forEach(option => {
        option.href = pathFor(option.dataset.locale) + currentLocationSuffix();
        option.setAttribute('aria-selected', String(option.dataset.locale === currentLocale));
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
          } else if (event.key === 'Escape' || (event.key === 'Tab' && event.shiftKey)) {
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

      picker.addEventListener('focusout', event => {
        if (!picker.contains(event.relatedTarget)) setOpen(false);
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
    // Honour the first supported preference, including the current language.
    // Do not suggest a second-choice browser language after a saved choice.
    const target = preferences.map(localeForPreference).find(Boolean);
    if (!target || target.locale === currentLocale) {
      suggestion.hidden = true;
      return;
    }

    const link = document.createElement('a');
    link.dataset.locale = target.locale;
    link.href = pathFor(target.locale) + currentLocationSuffix();
    const label = document.createElement('bdi');
    label.lang = target.canonical || target.locale;
    label.textContent = languageDisplayName(target);
    const parts = message('web_languageSuggestion', { language: '{language}' }).split('{language}');
    link.replaceChildren(document.createTextNode(parts[0]), label, document.createTextNode(parts[1] || ''));
    link.addEventListener('click', event => {
      updateLanguageLinks();
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
      try { localStorage.setItem('tabtools-site-language', target.locale); } catch (_) {}
    });
    suggestion.replaceChildren(link);
    suggestion.hidden = false;
  }

  // How much of the top of the window the header covers: its height while it
  // stays pinned, nothing on phones where it scrolls away with the page.
  function headerCover() {
    const header = $('.site-header');
    if (!header || getComputedStyle(header).position !== 'sticky') return 0;
    return header.getBoundingClientRect().height;
  }

  function initHeaderOffset() {
    const header = $('.site-header');
    if (!header) return;
    const update = () => {
      const cover = headerCover();
      root.style.setProperty('--header-offset', Math.ceil(cover) + (cover ? 16 : 12) + 'px');
    };
    update();
    if ('ResizeObserver' in window) new ResizeObserver(update).observe(header);
    window.addEventListener('resize', update);
  }

  function initPrivacyNavigation() {
    const card = $('#privacy .privacy-card');
    if (!card) return;

    function centerPrivacy() {
      const headerHeight = headerCover();
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
        updateLanguageLinks();
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

  // The stylesheet trims the name's box to its capitals, which puts the middle
  // of the letters on the line of the mark's cross. A browser that cannot trim
  // centres the whole line instead; measure the font and move the name by the
  // difference, as the extension's popup does.
  function initBrand() {
    try {
      if (window.CSS && CSS.supports && CSS.supports('text-box', 'trim-both cap alphabetic')) return;
      const context = document.createElement('canvas').getContext('2d');
      if (!context) return;
      for (const name of document.querySelectorAll('.brand > span, .pp-brand')) {
        const style = getComputedStyle(name);
        context.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
        const metrics = context.measureText('T');
        const below = (metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent - metrics.actualBoundingBoxAscent) / 2;
        if (Number.isFinite(below) && Math.abs(below) < 6) name.style.translate = '0 ' + (-below).toFixed(2) + 'px';
      }
    } catch (_) { /* the name stays where the browser put it */ }
  }

  function init() {
    setStoreLinks();
    initBrand();
    initTheme();
    initHeaderOffset();
    initLanguage();
    initPrivacyNavigation();
  }

  init();
})();
