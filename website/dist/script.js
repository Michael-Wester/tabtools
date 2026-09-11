(() => {
  const stores = {
    chrome: 'https://chromewebstore.google.com/detail/tabtools/penbnlignepchllgkflhnpfbabdfalkk',
    firefox: 'https://tabtools.michaelwester.com/firefox',
    edge: 'https://tabtools.michaelwester.com/edge'
  };

  const tabs = [
    { id: 'docs-1', site: 'docs.example', title: 'Project notes', color: '' },
    { id: 'mail-1', site: 'mail.app', title: 'Inbox — 4 unread', color: 'cyan' },
    { id: 'docs-2', site: 'docs.example', title: 'Sprint brief', color: '' },
    { id: 'shop-1', site: 'shop.test', title: 'Saved items', color: 'orange' },
    { id: 'docs-3', site: 'docs.example', title: 'Research links', color: '' },
    { id: 'video-1', site: 'video.test', title: 'Watch later', color: 'pink' }
  ];
  let activeTabs = tabs.map(tab => ({ ...tab }));
  let selectedId = null;

  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));

  function browserKey() {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return 'edge';
    if (/Firefox\//.test(ua)) return 'firefox';
    if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) return 'chrome';
    return 'chrome';
  }

  function setStoreLinks() {
    const detected = browserKey();
    $$('[data-store]').forEach(link => {
      const key = link.dataset.store;
      link.href = stores[key];
    });
    $$('[data-primary-install]').forEach(label => {
      label.textContent = detected === 'firefox' ? 'Add to Firefox — free' : detected === 'edge' ? 'Add to Edge — free' : 'Add to Chrome — free';
    });
    $$('[data-store="chrome"]').forEach(link => {
      if (link.classList.contains('button-primary') && link.closest('.nav-actions')) link.textContent = detected === 'firefox' ? 'Add to Firefox' : detected === 'edge' ? 'Add to Edge' : 'Add to Chrome';
    });
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
    if (metaTheme) metaTheme.content = dark ? '#0d0e18' : '#f5f6fa';
  }

  function initTheme() {
    const current = document.documentElement.dataset.theme || 'light';
    setTheme(current);
    $('[data-theme-toggle]')?.addEventListener('click', () => setTheme((document.documentElement.dataset.theme || 'light') === 'dark' ? 'light' : 'dark'));
  }

  function renderTabs() {
    const strip = $('[data-tab-strip]');
    if (!strip) return;
    strip.innerHTML = '';
    activeTabs.forEach(tab => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tab-item';
      button.dataset.tabId = tab.id;
      button.setAttribute('aria-label', `${tab.title} from ${tab.site}. Open cleanup menu`);
      button.setAttribute('aria-selected', tab.id === selectedId ? 'true' : 'false');
      button.innerHTML = `<span class="tab-favicon ${tab.color}" aria-hidden="true"></span><span>${tab.site}</span>`;
      button.addEventListener('click', () => selectTab(tab.id));
      strip.appendChild(button);
    });
    const open = $('[data-open-count]');
    const sameSite = $('[data-site-count]');
    if (open) open.textContent = String(activeTabs.length);
    const selectedSite = selectedId ? activeTabs.find(tab => tab.id === selectedId)?.site : null;
    if (sameSite) sameSite.textContent = String(selectedSite ? activeTabs.filter(tab => tab.site === selectedSite).length : 3);
    const status = $('.browser-body-status');
    if (status) status.textContent = `${activeTabs.length} open tab${activeTabs.length === 1 ? '' : 's'}`;
  }

  function selectTab(id) {
    selectedId = id;
    renderTabs();
    const tab = activeTabs.find(item => item.id === id);
    const menu = $('[data-context-menu]');
    if (!tab || !menu) return;
    $('[data-context-site]').textContent = tab.site;
    menu.hidden = false;
    $('[data-close-site]').focus();
  }

  function closeMenu() {
    const menu = $('[data-context-menu]');
    if (menu) menu.hidden = true;
    selectedId = null;
    renderTabs();
  }

  function closeSelectedSite() {
    if (!selectedId) return;
    const selected = activeTabs.find(tab => tab.id === selectedId);
    if (!selected) return;
    const original = activeTabs.length;
    activeTabs = activeTabs.filter(tab => tab.site !== selected.site);
    const removed = original - activeTabs.length;
    selectedId = null;
    closeMenu();
    renderTabs();
    const message = $('.demo-message');
    if (message) message.innerHTML = `<div class="demo-message-icon" aria-hidden="true">✓</div><div><strong>${removed} ${selected.site} tab${removed === 1 ? '' : 's'} cleared</strong><span>Pick another tab, or reset the demo.</span></div>`;
  }

  function resetDemo() {
    activeTabs = tabs.map(tab => ({ ...tab }));
    selectedId = null;
    closeMenu();
    const message = $('.demo-message');
    if (message) message.innerHTML = '<div class="demo-message-icon" aria-hidden="true">✦</div><div><strong>Pick a tab to clean up</strong><span>Then choose “Close site tabs”.</span></div>';
    renderTabs();
  }

  function initDemo() {
    renderTabs();
    $('[data-close-site]')?.addEventListener('click', closeSelectedSite);
    $('[data-reset-demo]')?.addEventListener('click', resetDemo);
    $$('[data-menu-action]').forEach(button => button.addEventListener('click', closeMenu));
    document.addEventListener('click', event => {
      const menu = $('[data-context-menu]');
      if (!menu || menu.hidden) return;
      if (!menu.contains(event.target) && !event.target.closest('.tab-item')) closeMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenu();
      if (event.key === 'Enter' && selectedId && !$('[data-context-menu]').hidden && document.activeElement === $('[data-close-site]')) closeSelectedSite();
    });
  }

  function init() {
    setStoreLinks();
    initTheme();
    initDemo();
  }

  init();
})();
