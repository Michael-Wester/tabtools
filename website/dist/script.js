(() => {
  const stores = {
    chrome: 'https://chromewebstore.google.com/detail/tabtools/penbnlignepchllgkflhnpfbabdfalkk',
    firefox: 'https://tabtools.michaelwester.com/firefox',
    edge: 'https://tabtools.michaelwester.com/edge'
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));

  function browserKey() {
    const ua = navigator.userAgent || '';
    if (/Edg\//.test(ua)) return 'edge';
    if (/Firefox\//.test(ua)) return 'firefox';
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
      if (stores[key]) link.href = stores[key];
    });

    const note = $('[data-store-note]');
    if (note) note.textContent = 'Opens the ' + browserLabel(detected) + '.';
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
      current = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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

  function initVideo() {
    const video = $('.product-video');
    const replay = $('[data-video-replay]');
    if (!video || !replay) return;

    replay.addEventListener('click', () => {
      video.currentTime = 0;
      const playback = video.play();
      if (playback && typeof playback.catch === 'function') playback.catch(() => {});
    });
  }

  function init() {
    setStoreLinks();
    initTheme();
    initVideo();
  }

  init();
})();
