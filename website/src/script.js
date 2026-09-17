(() => {
  const page = JSON.parse(document.getElementById('locale-data').textContent);
  const t = (key, values = {}) => page.messages[key].replace(/\{([a-zA-Z]+)\}/g, (_, name) => String(values[name] ?? ''));
  const stores = {
    chrome: 'https://chromewebstore.google.com/detail/tabtools/penbnlignepchllgkflhnpfbabdfalkk',
    firefox: 'https://addons.mozilla.org/en-US/firefox/addon/tabtools-michael-wester/',
    edge: 'https://microsoftedge.microsoft.com/addons/detail/tabtools/hajmbphgjkkinedfebgnpodlknanfdlh'
  };
  const browserNames = { chrome: 'Chrome', firefox: 'Firefox', edge: 'Edge' };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));

  function browserKey() {
    const ua = navigator.userAgent || '';
    if (/Edg(?:e|A|iOS)?\//.test(ua)) return 'edge';
    if (/(?:Firefox|FxiOS)\//.test(ua)) return 'firefox';
    return 'chrome';
  }

  function browserLabel(key) {
    if (key === 'firefox') return 'Firefox Add-ons';
    if (key === 'edge') return 'Microsoft Edge Add-ons';
    return 'Chrome Web Store';
  }

  function setStoreLinks() {
    const detected = browserKey();
    $$('[data-store]').forEach(link => {
      const key = link.hasAttribute('data-adaptive-store') ? detected : link.dataset.store;
      if (stores[key]) {
        const url = new URL(stores[key]);
        url.searchParams.set('utm_source', 'tabtools.fyi');
        url.searchParams.set('utm_medium', 'referral');
        url.searchParams.set('utm_campaign', 'website');
        url.searchParams.set('utm_content', link.dataset.utmPlacement + '_' + key);
        link.href = url.href;
        link.dataset.store = key;
        const copy = link.querySelector('[data-browser-copy]');
        if (copy) {
          const parts = page.messages.web_addTo.split('{browser}');
          const name = document.createElement('span');
          name.className = 'browser-button-name';
          name.dataset.browserName = '';
          name.textContent = browserNames[key];
          copy.replaceChildren(document.createTextNode(parts[0]), name, document.createTextNode(parts[1] || ''));
        }
        const browserIcon = link.querySelector('[data-browser-icon]');
        if (browserIcon) browserIcon.src = '/assets/browsers/' + key + '.svg';
        const visibleLabel = link.textContent.trim().replace(/\s+/g, ' ');
        link.setAttribute('aria-label', t('web_storeAria', {label: visibleLabel, store: browserLabel(key)}));
      }
    });

    $$('[data-alternative-store]').forEach(link => {
      link.hidden = link.dataset.store === detected;
    });

    const note = $('[data-store-note]');
    if (note) note.textContent = t('web_storeNote', {store: browserLabel(detected)});

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
      toggle.setAttribute('aria-label', dark ? t('web_switchLight') : t('web_switch_to_dark_mode'));
      toggle.title = dark ? t('web_switchLight') : t('web_switch_to_dark_mode');
    }

    const label = $('[data-theme-label]');
    if (label) label.textContent = dark ? t('web_lightMode') : t('web_dark_mode');

    const metaTheme = $('meta[name="theme-color"]');
    if (metaTheme) metaTheme.content = dark ? '#111216' : '#f6f6f4';
  }

  function initTheme() {
    let current = document.documentElement.dataset.theme;
    if (!current) {
      try { current = localStorage.getItem('tabtools-site-theme'); } catch (_) {}
    }
    if (current !== 'dark' && current !== 'light') {
      current = 'light';
    }
    setTheme(current);

    const toggle = $('[data-theme-toggle]');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
      });
    }
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

  function initLanguage() {
    const select = $('[data-language-select]');
    select.addEventListener('change', () => {
      const target = page.registry.find(item => item.path === select.value);
      if (!target) return;
      try { localStorage.setItem('tabtools-site-language', target.locale); } catch (_) {}
      // An explicit locale URL always owns the displayed content.
      window.location.assign(target.path + window.location.search + window.location.hash);
    });
    let saved;
    try { saved = localStorage.getItem('tabtools-site-language'); } catch (_) {}
    const match = preferences => {
      for (let pref of preferences) {
        pref = String(pref).replace(/_/g, '-').toLowerCase();
        if (pref === 'no' || pref.startsWith('no-') || pref.startsWith('nb-')) pref = 'nb';
        if (/^zh-(hant|tw|hk|mo)(-|$)/.test(pref)) pref = 'zh-tw';
        else if (/^zh-(hans|cn|sg)(-|$)/.test(pref)) pref = 'zh-cn';
        const exact = page.registry.find(item => item.locale.toLowerCase() === pref);
        if (exact) return exact;
        // Only generic target locales may match a region. Never guess which
        // Portuguese or Chinese variant a generic preference means.
        const generic = page.registry.find(item => item.locale.toLowerCase() === pref.split('-')[0]);
        if (generic) return generic;
      }
      return page.registry.find(item => item.locale === 'en');
    };
    const suggested = match(saved ? [saved] : (navigator.languages || [navigator.language]));
    if (suggested.locale !== page.locale) {
      const note = $('[data-language-suggestion]');
      const link = document.createElement('a');
      link.href = suggested.path + window.location.search + window.location.hash;
      link.hreflang = suggested.locale;
      link.textContent = t('web_languageSuggestion', {language:suggested.nativeName});
      link.addEventListener('click', () => { try { localStorage.setItem('tabtools-site-language', suggested.locale); } catch (_) {} });
      note.append(link);
      note.hidden = false;
    }
  }

  function init() {
    initLanguage();
    setStoreLinks();
    initTheme();
    initPrivacyNavigation();
  }

  init();
})();
