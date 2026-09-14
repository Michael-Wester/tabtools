(() => {
  const stores = {
    chrome: 'https://chromewebstore.google.com/detail/tabtools/penbnlignepchllgkflhnpfbabdfalkk',
    firefox: 'https://addons.mozilla.org/en-US/firefox/addon/tabtools-michael-wester/',
    edge: 'https://microsoftedge.microsoft.com/addons/detail/tabtools/hajmbphgjkkinedfebgnpodlknanfdlh'
  };

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
        const visibleLabel = link.textContent.trim().replace(/\s+/g, ' ');
        link.setAttribute('aria-label', visibleLabel + ' — opens the ' + browserLabel(key) + ' in a new tab');
      }
    });

    $$('[data-alternative-store]').forEach(link => {
      link.hidden = link.dataset.store === detected;
    });

    const note = $('[data-store-note]');
    if (note) note.textContent = 'Opens the ' + browserLabel(detected) + '.';

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
      toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      toggle.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    }

    const label = $('[data-theme-label]');
    if (label) label.textContent = dark ? 'Light mode' : 'Dark mode';

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

  function init() {
    setStoreLinks();
    initTheme();
    initPrivacyNavigation();
  }

  init();
})();
