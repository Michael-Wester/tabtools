'use strict';
// Official destinations are configured here; links are also rendered in initial HTML.
const STORES = {
 chrome: { name: 'Chrome Web Store', url: 'https://chromewebstore.google.com/detail/tabtools/penbnlignepchllgkflhnpfbabdfalkk' },
 firefox: { name: 'Firefox add-on', url: null },
 edge: { name: 'Edge add-on', url: null }
};
for (const link of document.querySelectorAll('[data-store]')) {
 const store = STORES[link.dataset.store];
 if (store.url) link.href = store.url;
}
const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const browser = /Edg\//.test(navigator.userAgent) ? 'edge' : /Firefox\//.test(navigator.userAgent) ? 'firefox' : /Chrome\//.test(navigator.userAgent) && !/OPR\//.test(navigator.userAgent) ? 'chrome' : null;
if (!mobile && browser && STORES[browser].url) {
 for (const link of document.querySelectorAll('.primary-browser')) {
  link.href = STORES[browser].url;
  link.textContent = 'View in ' + STORES[browser].name;
 }
}
if (mobile) document.querySelector('.mobile-note').style.display = 'block';
const themeButton = document.querySelector('#theme');
function syncTheme() {
 const dark = document.documentElement.dataset.theme === 'dark';
 themeButton.setAttribute('aria-pressed', String(dark));
 themeButton.setAttribute('aria-label', dark ? 'Use light theme' : 'Use dark theme');
}
syncTheme();
themeButton.addEventListener('click', () => {
 const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
 document.documentElement.dataset.theme = theme;
 try { localStorage.setItem('tabtools-site-theme', theme); } catch {}
 syncTheme();
});
const INITIAL_TABS = [
 {id:1,site:'shop.example',title:'Desk lamps',symbol:'S'},
 {id:2,site:'notes.example',title:'Notes',symbol:'N'},
 {id:3,site:'shop.example',title:'Compare',symbol:'S'},
 {id:4,site:'read.example',title:'Reading',symbol:'R'},
 {id:5,site:'shop.example',title:'Reviews',symbol:'S'},
 {id:6,site:'travel.example',title:'Trip plans',symbol:'T'}
];
let tabs = [...INITIAL_TABS];
let selectedSite = 'shop.example';
const strip = document.querySelector('#tab-strip');
const menu = document.querySelector('#context-menu');
const closeButton = document.querySelector('#close-site');
const resetButton = document.querySelector('#reset');
function openMenu(site) {
 selectedSite = site;
 menu.hidden = false;
 menu.querySelector(':scope > span').textContent = 'Close all tabs from ' + site;
 closeButton.focus();
}
function renderTabs() {
 strip.replaceChildren();
 tabs.forEach(tab => {
  const button = document.createElement('button');
  button.className = 'demo-tab' + (tab.site === 'shop.example' ? ' shop' : '');
  button.setAttribute('aria-label', 'Open TabTools action for ' + tab.title + ', ' + tab.site);
  const icon = document.createElement('b'); icon.textContent = tab.symbol;
  const title = document.createElement('span'); title.textContent = tab.title;
  button.append(icon, title);
  button.addEventListener('click', () => openMenu(tab.site));
  strip.append(button);
 });
 document.querySelector('#tab-count').textContent = tabs.length + ' tabs open';
}
closeButton.addEventListener('click', () => {
 const before = tabs.length;
 tabs = tabs.filter(tab => tab.site !== selectedSite);
 const removed = before - tabs.length;
 renderTabs();
 menu.hidden = true;
 document.querySelector('#demo-status').textContent = removed + (removed === 1 ? ' tab closed. ' : ' tabs closed. ') + tabs.length + ' left to browse.';
 document.querySelector('#demo-heading').textContent = tabs.length ? 'Room for what’s next.' : 'All clear.';
 document.querySelector('#demo-description').textContent = tabs.length ? 'The other websites stay open. Pick another example tab to try its menu.' : 'Reset the demo to start again.';
 document.querySelector('#address').textContent = tabs[0]?.site || 'New tab';
 document.querySelector('.browser').classList.add('settled');
 resetButton.focus();
});
resetButton.addEventListener('click', () => {
 tabs = [...INITIAL_TABS]; selectedSite = 'shop.example'; renderTabs(); menu.hidden = false;
 menu.querySelector(':scope > span').textContent = 'Close all tabs from shop.example';
 document.querySelector('#demo-heading').innerHTML = 'A few too many<br>open possibilities.';
 document.querySelector('#demo-description').innerHTML = 'Three shopping tabs. One decision made.<br>Time to put the rest away.';
 document.querySelector('#address').textContent = 'shop.example / desk-lamps';
 document.querySelector('#demo-status').textContent = 'Choose “Close site tabs” to try it.';
 document.querySelector('.browser').classList.remove('settled');
});
menu.addEventListener('keydown', e => {
 if (e.key === 'Escape') { menu.hidden = true; (strip.querySelector('button') || resetButton).focus(); }
});
document.querySelector('#try-demo').addEventListener('click', () => {
 if (tabs.length) { openMenu(tabs.some(t => t.site === 'shop.example') ? 'shop.example' : tabs[0].site); }
 else resetButton.focus();
});
renderTabs();
