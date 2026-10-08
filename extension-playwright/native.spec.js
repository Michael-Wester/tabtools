// SPDX-License-Identifier: MPL-2.0
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect, chromium } = require('@playwright/test');
const { registry, catalogue, escape } = require('../scripts/localisation');

const root = path.resolve(__dirname, '..');
const extension = path.join(root, 'dist', process.env.TABTOOLS_EXTENSION_TARGET || 'chrome');

const POPUP_WIDTH = 380;
const MENU_ITEM = 'tabTools-close-site-tabs-page';
const HOUR = 60;
// A site icon the test pages can carry without a request leaving the browser.
const ICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="#2f9e7a"/></svg>');

// These tests install the built package. They use native extension API calls
// and a real browser action popup, rather than serving popup.html as a tab.
async function launchExtension(testInfo, locale = 'en', privateAccess = false) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tabtools-native-'));
  fs.mkdirSync(path.join(profile, 'Default'), { recursive: true });
  const preferences = {
    intl: { accept_languages: locale, selected_languages: locale }
  };
  const preferenceFile = path.join(profile, 'Default', 'Preferences');
  fs.writeFileSync(preferenceFile, JSON.stringify(preferences));
  const launch = async () => {
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      executablePath: process.env.TABTOOLS_CHROMIUM_PATH || undefined,
      headless: true,
      locale,
      viewport: { width: 1440, height: 1000 },
      env: { ...process.env, LANG: locale.replace('-', '_') + '.UTF-8', LANGUAGE: locale, LC_ALL: locale.replace('-', '_') + '.UTF-8' },
      args: [
        `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
        `--lang=${locale}`, `--accept-lang=${locale}`, '--no-sandbox',
        // Headless Chromium's own screen is 800x600, which cuts a popup off at
        // about 510px. On a screen of ordinary size it reaches its full height.
        '--screen-info={1920x1200}'
      ]
    });
    // The worker occasionally fails to attach; a bounded wait lets the caller relaunch
    // instead of spending the whole test timeout here.
    const worker = context.serviceWorkers()[0] ||
      await context.waitForEvent('serviceworker', { timeout: 10_000 }).catch(() => null);
    if (!worker) {
      await context.close();
      return null;
    }
    // Playwright can hand over the worker before Chromium has attached the extension APIs.
    await expect.poll(() => worker.evaluate(() => typeof chrome === 'object' && Boolean(chrome.tabs?.query && chrome.action?.openPopup))).toBe(true);
    return { context, worker, id: new URL(worker.url()).hostname };
  };
  const launchReliably = async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const launched = await launch();
      if (launched) return launched;
    }
    throw new Error('The extension service worker did not start in three launches');
  };
  let browser = await launchReliably();
  if (privateAccess) {
    const id = browser.id;
    await browser.context.close();
    const saved = JSON.parse(fs.readFileSync(preferenceFile, 'utf8'));
    saved.extensions.settings[id].incognito = true;
    fs.writeFileSync(preferenceFile, JSON.stringify(saved));
    browser = await launchReliably();
    expect(await browser.worker.evaluate(() => new Promise(resolve => chrome.extension.isAllowedIncognitoAccess(resolve)))).toBe(true);
  }
  // Fulfill controlled regular-tab pages locally; separate windows use
  // reserved .test hostnames and no external accounts or content. A tab can be
  // given a title and an icon through createTabs.
  const pages = new Map();
  await browser.context.route(/^https?:\/\//, route => {
    const page = pages.get(route.request().url()) || {};
    const icon = `<link rel="icon" href="${ICON}">`;
    // A late icon is added half a second after the page has loaded, as a slow
    // site's icon arrives after its page.
    const late = `<script>setTimeout(() => document.head.insertAdjacentHTML('beforeend', ${JSON.stringify(icon)}), 500)</script>`;
    return route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><head><title>${escape(page.title || 'TabTools disposable native test tab')}</title>${page.icon === true ? icon : ''}</head><body>Local native extension test page${page.icon === 'late' ? late : ''}</body></html>`
    });
  });
  return { ...browser, pages, close: async () => {
    try { await browser.context.close(); }
    finally { fs.rmSync(profile, { recursive: true, force: true }); }
  } };
}

const addressOf = tab => tab.url || tab.pendingUrl || '';

async function queryTabs(worker) {
  return worker.evaluate(() => chrome.tabs.query({}));
}

// Opens one tab per descriptor ({ url, title, icon, windowId, pinned }) and puts
// the tabs that were in view back in view, so every created tab has been left.
// Each result is the browser's tab with the descriptor and its Playwright page.
async function createTabs(browser, descriptors) {
  const { worker, context, pages } = browser;
  const activeTabs = (await queryTabs(worker)).filter(tab => tab.active);
  const created = [];
  for (const item of descriptors) {
    pages.set(item.url.split('#')[0], item);
    const known = new Set((await queryTabs(worker)).map(tab => tab.id));
    // Attaching before navigation lets Playwright fulfill the initial request,
    // including HSTS sites used to exercise long real-world hostnames.
    const page = await context.newPage();
    await page.goto(item.url);
    const tab = (await queryTabs(worker)).find(tab => tab.url === item.url && !known.has(tab.id));
    expect(tab, 'the created browser page must have a native tab').toBeTruthy();
    if (item.windowId !== undefined) await worker.evaluate(({ tabId, windowId }) => chrome.tabs.move(tabId, { windowId, index: -1 }), { tabId: tab.id, windowId: item.windowId });
    if (item.pinned) await worker.evaluate(tabId => chrome.tabs.update(tabId, { pinned: true }), tab.id);
    if (item.icon) await expect.poll(() => worker.evaluate(tabId => chrome.tabs.get(tabId).then(found => Boolean(found.favIconUrl)), tab.id), { message: 'the tab must have its icon' }).toBe(true);
    created.push({ ...tab, ...item, page });
  }
  for (const tab of activeTabs) await activate(worker, tab);
  return created;
}

// Brings a tab into view and waits until the background has noted the switch.
async function activate(worker, tab) {
  const alreadyInView = await worker.evaluate(async tabId => {
    const { active } = await chrome.tabs.get(tabId);
    await chrome.tabs.update(tabId, { active: true });
    return active;
  }, tab.id);
  if (alreadyInView) return;
  await expect.poll(() => worker.evaluate(async ({ id, windowId }) => {
    const record = (await chrome.storage.session.get('pc.left'))['pc.left'];
    return record?.active?.[windowId] === id;
  }, { id: tab.id, windowId: tab.windowId }), { message: 'the background must note the tab that came into view' }).toBe(true);
}

// Moves the background's clock forward. Chromium's own tab times stay real,
// which is what a long session looks like to the extension.
async function advanceClock(worker, minutes) {
  await worker.evaluate(milliseconds => {
    globalThis.nativeTestClock ??= { real: Date.now.bind(Date), ahead: 0 };
    globalThis.nativeTestClock.ahead += milliseconds;
    Date.now = () => globalThis.nativeTestClock.real() + globalThis.nativeTestClock.ahead;
  }, minutes * 60_000);
}

async function nativePopup({ context, worker, id }) {
  const cdp = await context.browser().newBrowserCDPSession();
  const popupTarget = async () => (await cdp.send('Target.getTargets')).targetInfos
    .find(item => item.url === `chrome-extension://${id}/popup/popup.html`);
  // openPopup rejects while a previous popup is still closing, so wait for that and retry.
  await expect.poll(async () => Boolean(await popupTarget()), { message: 'the previous popup must have closed' }).toBe(false);
  await expect.poll(() => worker.evaluate(() => chrome.action.openPopup()).then(() => 'opened', error => error.message)).toBe('opened');
  await expect.poll(async () => Boolean(await popupTarget()), { message: 'the real browser action popup must be present' }).toBe(true);
  const target = await popupTarget();
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  const pending = new Map();
  const diagnostics = [];
  let nextId = 0;
  cdp.on('Target.receivedMessageFromTarget', event => {
    if (event.sessionId !== sessionId) return;
    const result = JSON.parse(event.message);
    if (result.method === 'Runtime.exceptionThrown') diagnostics.push(result.params.exceptionDetails.text);
    if (result.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(result.params.type)) {
      diagnostics.push(result.params.args.map(arg => arg.value || arg.description).join(' '));
    }
    // What the browser itself reports about the page, such as a blocked script.
    // A test page's icon that cannot be fetched is not the popup's doing.
    if (result.method === 'Log.entryAdded' && ['error', 'warning'].includes(result.params.entry.level) && result.params.entry.source !== 'network') {
      diagnostics.push(`${result.params.entry.source}: ${result.params.entry.text}`);
    }
    const handler = pending.get(result.id);
    if (!handler) return;
    pending.delete(result.id);
    clearTimeout(handler.timer);
    result.error ? handler.reject(new Error(result.error.message)) : handler.resolve(result.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const commandId = ++nextId;
    const timer = setTimeout(() => { pending.delete(commandId); reject(new Error(`Native popup CDP timed out: ${method}`)); }, 10_000);
    pending.set(commandId, { resolve, reject, timer });
    cdp.send('Target.sendMessageToTarget', {
      sessionId, message: JSON.stringify({ id: commandId, method, params })
    }).catch(error => { clearTimeout(timer); pending.delete(commandId); reject(error); });
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  };
  await send('Runtime.enable');
  await send('Log.enable');
  await evaluate('document.fonts.ready.then(() => true)');
  // The popup document may still be loading when the session attaches. It is
  // ready once the open-tab summary and the lifetime count have both arrived.
  await expect.poll(() => evaluate('["#pc-open-count", "#pc-closed-count"].every(selector => Boolean(document.querySelector(selector)?.textContent))')).toBe(true);
  const message = (type, payload = {}) => evaluate(`new Promise(resolve => chrome.runtime.sendMessage(${JSON.stringify({ type, ...payload })}, resolve))`);
  const close = async () => {
    await cdp.send('Target.closeTarget', { targetId: target.targetId });
    await expect.poll(async () => Boolean(await popupTarget()), { message: 'the popup must close' }).toBe(false);
  };
  return { evaluate, message, diagnostics, send, close };
}

// Clicks a control the way a person can: only once it is shown and enabled, and
// with focus moving to it as it does under a real pointer in Chromium.
async function click(popup, selector, { timeout } = {}) {
  await expect.poll(() => popup.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return 'missing';
    if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') return 'hidden';
    if (element.disabled) return 'disabled';
    element.focus();
    element.click();
    return 'clicked';
  })()`), { message: `${selector} must be there to click`, timeout }).toBe('clicked');
}

// Replaces the text in the keyword field with real key presses, one character
// at a time, or all at once as a paste does.
async function type(popup, value, { paste = false } = {}) {
  await popup.evaluate('(() => { const field = document.querySelector("#pc-query"); field.focus(); field.select(); })()');
  if (paste) return popup.send('Input.insertText', { text: value });
  for (const character of value) {
    await popup.send('Input.dispatchKeyEvent', { type: 'keyDown', key: character, text: character, unmodifiedText: character });
    await popup.send('Input.dispatchKeyEvent', { type: 'keyUp', key: character });
  }
}

async function press(popup, key, keyCode) {
  for (const type of ['keyDown', 'keyUp']) await popup.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: keyCode });
}

const text = (popup, selector) => popup.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
const attribute = (popup, selector, name) => popup.evaluate(`document.querySelector(${JSON.stringify(selector)})?.getAttribute(${JSON.stringify(name)}) ?? null`);
const focused = popup => popup.evaluate('document.activeElement?.id || document.activeElement?.dataset.domain || null');

// Which of the popup's views is showing, by the blocks that are not hidden.
const VIEWS = {
  main: ['pc-header', 'pc-suggest-list', 'pc-foot-main'],
  search: ['pc-header', 'pc-match-list', 'pc-foot-main'],
  inactive: ['pc-bar-inactive', 'pc-inactive-list', 'pc-foot-inactive'],
  settings: ['pc-bar-settings', 'pc-tab-settings', 'pc-foot-settings']
};
const BLOCKS = [...new Set(Object.values(VIEWS).flat())];
const shownBlocks = popup => popup.evaluate(`${JSON.stringify(BLOCKS)}.filter(id => document.getElementById(id)?.hidden === false)`);
const expectView = (popup, name) => expect.poll(() => shownBlocks(popup), { message: `the ${name} view must be showing` })
  .toEqual(BLOCKS.filter(id => VIEWS[name].includes(id)));

const siteRows = popup => popup.evaluate(`[...document.querySelectorAll('#pc-sites .row.site')].map(row => ({
  domain: row.dataset.domain, count: row.querySelector('.count')?.textContent ?? null
}))`);

const tabRows = (popup, list) => popup.evaluate(`[...document.querySelectorAll(${JSON.stringify(list + ' .tab')})].map(row => ({
  id: Number(row.dataset.tabId),
  title: row.querySelector('.tab-title')?.textContent ?? null,
  place: row.querySelector('.tab-host')?.textContent ?? null,
  marked: [...row.querySelectorAll('mark')].map(mark => mark.textContent),
  age: row.querySelector('.tab-meta')?.textContent ?? null
}))`);

// A string the catalogue has for this language, or the English one the browser
// shows until a language has its translation.
const plain = (locale, key) => catalogue(locale)[key] ?? catalogue('en')[key];

// The browser's own formatting for the popup's language, so expectations hold
// whichever version of the language data a browser ships.
const formatted = (popup, locale, value, options = {}) => popup.evaluate(`new Intl.NumberFormat(${JSON.stringify(locale)}, ${JSON.stringify(options)}).format(${value})`);
const unit = (popup, locale, value, name, unitDisplay) => formatted(popup, locale, value, { style: 'unit', unit: name, unitDisplay });

// A counted string in the form the language uses for this number.
async function counted(popup, locale, key, count) {
  const entry = plain(locale, key);
  const category = await popup.evaluate(`new Intl.PluralRules(${JSON.stringify(locale)}).select(${count})`);
  const form = typeof entry === 'string' ? entry : entry[category] || entry.other;
  return form.replace('{count}', await formatted(popup, locale, count));
}

// Every fixed word the document takes from the catalogue, with what is shown.
const boundWords = popup => popup.evaluate(`[...document.querySelectorAll('[data-i18n], [data-i18n-aria], [data-i18n-title], [data-i18n-placeholder]')].flatMap(element => [
  element.dataset.i18n && { key: element.dataset.i18n, shown: element.textContent },
  element.dataset.i18nAria && { key: element.dataset.i18nAria, shown: element.getAttribute('aria-label') },
  element.dataset.i18nTitle && { key: element.dataset.i18nTitle, shown: element.title },
  element.dataset.i18nPlaceholder && { key: element.dataset.i18nPlaceholder, shown: element.placeholder }
].filter(Boolean))`);

// Parts that must lie inside the popup, and text that must be shown whole.
// Hostnames, tab titles and the keyword in the list heading are cut on purpose.
const PARTS = 'button, input, a, output, .field, .row, .tab, .list-head, .setting, .segmented, .stepper, .swatches, .note, .toast, .foot, .foot-action, .foot-links, .sub-bar';
const WHOLE_TEXT = '.brand, .stats, .label, .hint, .count, .list-meta, .sub-title, .sub-meta, .setting-label, .seg, .step-value, .btn, .inline-close, .primary, .note, .toast-btn, .foot-count, .links, .none, .empty, .tab-meta';

async function layout(popup) {
  return popup.evaluate(`(() => {
    const body = document.body.getBoundingClientRect();
    const shown = selector => [...document.querySelectorAll(selector)].filter(element => element.getClientRects().length);
    const name = element => element.id || element.dataset.domain || element.className;
    const outside = shown(${JSON.stringify(PARTS)}).filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.left < body.left - 1 || rect.right > body.right + 1;
    }).map(name);
    const clipped = shown(${JSON.stringify(WHOLE_TEXT)}).filter(element =>
      element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1).map(name);
    const hosts = shown('.row.site .host').map(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const style = getComputedStyle(element);
      const row = element.closest('.row');
      return { text: element.textContent, width: element.getBoundingClientRect().width, textWidth: range.getBoundingClientRect().width, direction: element.dir, overflow: style.overflow, ellipsis: style.textOverflow, whiteSpace: style.whiteSpace, title: row.title, accessibleName: row.getAttribute('aria-label') };
    });
    return {
      width: body.width, viewport: innerWidth, heightGap: innerHeight - body.height,
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth, outside, clipped, hosts
    };
  })()`);
}

function expectAccessibleHosts(hosts) {
  for (const host of hosts) {
    expect(host.width, host.text).toBeGreaterThan(0);
    // A hostname reads left to right in every language.
    expect(host.direction, host.text).toBe('ltr');
    expect(host.title).toContain(host.text);
    expect(host.accessibleName).toContain(host.text);
    if (host.textWidth > host.width) {
      expect(host.overflow).toBe('hidden');
      expect(host.ellipsis).toBe('ellipsis');
      expect(host.whiteSpace).toBe('nowrap');
    }
  }
}

// The popup is 380px wide in every view and language, as tall as its content,
// and nothing in it is pushed out or cut off.
async function expectFits(popup, view) {
  // Chromium resizes the popup a moment after its content changes.
  await expect.poll(async () => Math.abs((await layout(popup)).heightGap), { message: `${view}: the popup must be as tall as its content` }).toBeLessThanOrEqual(1);
  const metrics = await layout(popup);
  expect(metrics.width, `${view}: content width`).toBe(POPUP_WIDTH);
  expect(metrics.viewport, `${view}: popup width`).toBe(POPUP_WIDTH);
  expect(metrics.horizontalOverflow, `${view}: sideways scrolling`).toBeLessThanOrEqual(0);
  expect(metrics.outside, `${view}: parts outside the popup`).toEqual([]);
  expect(metrics.clipped, `${view}: text that is cut off`).toEqual([]);
  expectAccessibleHosts(metrics.hosts);
  return metrics;
}

// Keeps a picture of the popup in the test's results folder, for people to look
// at. CI uploads that folder.
async function picture(popup, testInfo, name) {
  const screenshot = await popup.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(testInfo.outputPath(`${name}.png`), Buffer.from(screenshot.data, 'base64'));
}

// Where a site's tabs are, in an order that does not depend on tab ids.
async function placesOf(worker, site) {
  return (await queryTabs(worker))
    .filter(tab => addressOf(tab).includes(site))
    .map(tab => ({ url: addressOf(tab), windowId: tab.windowId, index: tab.index, pinned: tab.pinned }))
    .sort((a, b) => a.windowId - b.windowId || a.index - b.index);
}

for (const entry of registry) {
  test(`native popup ${entry.locale}: words, counts and layout in every view`, async ({}, testInfo) => {
    const browser = await launchExtension(testInfo, entry.extension.replaceAll('_', '-'));
    try {
      const { worker } = browser;
      const locale = entry.locale;
      await createTabs(browser, [
        { url: 'https://developer.mozilla.org/one' },
        { url: 'https://developer.mozilla.org/two' },
        { url: 'https://wikipedia.org/three' },
        { url: 'https://wikipedia.org/four' }
      ]);
      await worker.evaluate(() => chrome.storage.local.set({ 'pc.stats': { totalTabsEaten: 999999, startedAt: Date.now() } }));
      // Three hours on, the four tabs count as inactive. The tab in view never does.
      await advanceClock(worker, 3 * HOUR);
      const popup = await nativePopup(browser);
      const say = (key, count) => counted(popup, locale, key, count);
      const number = value => formatted(popup, locale, value);

      expect(await popup.evaluate('chrome.i18n.getMessage("translationLocale")')).toBe(locale);
      expect(await popup.evaluate('document.documentElement.lang')).toBe(locale);
      expect(await popup.evaluate('document.documentElement.dir')).toBe(entry.direction);
      const words = await boundWords(popup);
      expect(words.length).toBeGreaterThan(30);
      for (const { key, shown } of words) expect(shown, key).toBe(plain(locale, key));

      // Main view: the summary, the two actions and one row per site.
      const openTabs = (await queryTabs(worker)).filter(tab => !tab.incognito).length;
      expect(await text(popup, '#pc-open-count')).toBe(await say('openCount', openTabs));
      expect(await text(popup, '#pc-site-count')).toBe(await say('siteCount', 2));
      expect(await text(popup, '#pc-closed-count')).toBe(await say('closedCountShort', 999999));
      expect(await text(popup, '#pc-inactive-count')).toBe(await number(4));
      expect(await text(popup, '#pc-inactive-hint')).toBe(await unit(popup, locale, 2, 'hour', 'short') + '+');
      expect(await attribute(popup, '#pc-inactive-row', 'aria-label')).toBe(`${plain(locale, 'inactive')} · ${await say('openCount', 4)}`);
      expect(await text(popup, '#pc-duplicates-count')).toBe(await number(0));
      expect(await attribute(popup, '#pc-close-duplicates', 'aria-label')).toBe(`${plain(locale, 'closeDuplicates')} · ${await say('openCount', 0)}`);
      expect(await siteRows(popup)).toEqual([
        { domain: 'developer.mozilla.org', count: await number(2) },
        { domain: 'wikipedia.org', count: await number(2) }
      ]);
      expect(await attribute(popup, '.row.site[data-domain="wikipedia.org"]', 'aria-label'))
        .toBe(`${plain(locale, 'closeSiteLabel').replace('{site}', 'wikipedia.org')} · ${await say('openCount', 2)}`);
      await expectFits(popup, 'main');
      await picture(popup, testInfo, `${locale}-main`);

      // Inactive review: the same four tabs, each with how long it has been unused.
      await click(popup, '#pc-inactive-row');
      await expectView(popup, 'inactive');
      expect(await focused(popup)).toBe('pc-inactive-back');
      await expect.poll(() => text(popup, '#pc-inactive-meta')).toBe(await say('openCount', 4));
      expect((await tabRows(popup, '#pc-inactive-rows')).map(row => row.age)).toEqual(Array(4).fill(await unit(popup, locale, 3, 'hour', 'short')));
      expect(await text(popup, '#pc-inactive-control [data-threshold-value]')).toBe(await unit(popup, locale, 2, 'hour', 'long'));
      expect(await attribute(popup, '#pc-inactive-control [data-threshold-step="-1"]', 'aria-label')).toBe(await unit(popup, locale, 1, 'hour', 'long'));
      expect(await attribute(popup, '#pc-inactive-control [data-threshold-step="1"]', 'aria-label')).toBe(await unit(popup, locale, 4, 'hour', 'long'));
      expect(await text(popup, '#pc-inactive-close-count')).toBe(await number(4));
      await expectFits(popup, 'inactive');
      await picture(popup, testInfo, `${locale}-inactive`);
      await click(popup, '#pc-inactive-back');
      await expectView(popup, 'main');
      expect(await focused(popup)).toBe('pc-inactive-row');

      // Settings, in the dark theme.
      await click(popup, '#pc-settings-toggle');
      await expectView(popup, 'settings');
      expect(await focused(popup)).toBe('pc-settings-back');
      expect(await text(popup, '#pc-settings-closed')).toBe(await say('closedCountShort', 999999));
      expect(await text(popup, '#pc-version')).toBe(`TabTools ${JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8')).version}`);
      await expectFits(popup, 'settings');
      await click(popup, '[data-theme-value="dark"]');
      await expect.poll(() => popup.evaluate('document.documentElement.dataset.theme')).toBe('dark');
      expect(await attribute(popup, '[data-theme-value="dark"]', 'aria-pressed')).toBe('true');
      expect((await popup.message('pc:getSettings')).settings.theme).toBe('dark');
      await expectFits(popup, 'settings in the dark theme');
      await picture(popup, testInfo, `${locale}-settings`);
      await click(popup, '#pc-settings-back');
      await expectView(popup, 'main');
      expect(await focused(popup)).toBe('pc-settings-toggle');
      await expectFits(popup, 'main again');
      expect(popup.diagnostics).toEqual([]);
    } finally { await browser.close(); }
  });
}

test('native actions: typed site, Undo, duplicates, right-click, private windows and settings while offline', async ({}, testInfo) => {
  const browser = await launchExtension(testInfo, 'es', true);
  try {
    const { worker } = browser;
    const primary = (await queryTabs(worker))[0].windowId;
    const second = await worker.evaluate(() => chrome.windows.create({ url: 'http://second-window.test/keep', focused: false }));
    const privateWindow = await worker.evaluate(() => chrome.windows.create({ url: 'http://private.test/private', incognito: true, focused: false }));
    const created = await createTabs(browser, [
      { url: 'http://close-target.test/one', windowId: primary },
      { url: 'http://close-target.test/two', windowId: second.id },
      { url: 'http://sub.close-target.test/three', windowId: primary },
      { url: 'http://not-close-target.test/four', windowId: primary },
      { url: 'http://close-target.test/pinned', windowId: primary, pinned: true },
      { url: 'http://private.test/public', windowId: primary },
      { url: 'http://duplicate.test/item', windowId: primary },
      { url: 'http://duplicate.test/item', windowId: second.id, pinned: true },
      { url: 'http://copies.test/page', windowId: primary },
      { url: 'http://copies.test/page', windowId: primary },
      { url: 'http://copies.test/page', windowId: second.id },
      { url: 'http://second-window.test/keep', windowId: primary },
      { url: 'http://mail.test/#inbox/one', windowId: primary },
      { url: 'http://mail.test/#inbox/two', windowId: primary }
    ]);
    const tabFor = (address, windowId) => created.find(tab => tab.url === address && (windowId === undefined || tab.windowId === windowId));
    const open = async tab => (await queryTabs(worker)).some(found => found.id === tab.id);
    await worker.evaluate(windowId => chrome.windows.update(windowId, { focused: true }), primary);
    // The background listens for one tab event, the one that says a tab was left.
    expect(await worker.evaluate(() => ({
      activated: chrome.tabs.onActivated.hasListeners(), updated: chrome.tabs.onUpdated.hasListeners(),
      created: chrome.tabs.onCreated.hasListeners(), removed: chrome.tabs.onRemoved.hasListeners(),
      menu: chrome.contextMenus.onClicked.hasListeners()
    }))).toEqual({ activated: true, updated: false, created: false, removed: false, menu: true });
    // Nothing below may need the network.
    await browser.context.setOffline(true);
    const popup = await nativePopup(browser);
    const say = (key, count) => counted(popup, 'es', key, count);
    let closedSoFar = 0;

    // The summary and every count leave the private window out.
    const regular = (await queryTabs(worker)).filter(tab => !tab.incognito);
    expect((await queryTabs(worker)).filter(tab => tab.incognito).length).toBe(1);
    expect(await text(popup, '#pc-open-count')).toBe(await say('openCount', regular.length));
    expect((await siteRows(popup)).find(row => row.domain === 'private.test')).toEqual({ domain: 'private.test', count: '1' });

    // A typed site covers its subdomains in every window, but not a pinned tab
    // and not a site whose name merely ends the same way.
    await type(popup, 'close-target.test');
    await expectView(popup, 'search');
    await expect.poll(async () => (await tabRows(popup, '#pc-match-rows')).map(row => row.id))
      .toEqual([tabFor('http://close-target.test/one').id, tabFor('http://sub.close-target.test/three').id, tabFor('http://close-target.test/two').id]);
    expect(await text(popup, '#pc-match-count')).toBe(await say('openCount', 3));
    expect(await text(popup, '#pc-close-count')).toBe('3');
    const before = await placesOf(worker, 'close-target.test');
    expect(before.length).toBe(5);
    await click(popup, '#pc-close');
    await expect.poll(async () => (await placesOf(worker, 'close-target.test')).map(tab => tab.url))
      .toEqual(['http://close-target.test/pinned', 'http://not-close-target.test/four']);
    closedSoFar += 3;
    await expect.poll(() => text(popup, '#pc-status')).toBe(await say('closedCount', 3));
    expect(await popup.evaluate('document.querySelector("#pc-toast").classList.contains("is-open")')).toBe(true);
    // The field empties and the suggestions come back.
    await expectView(popup, 'main');
    expect(await popup.evaluate('document.querySelector("#pc-query").value')).toBe('');
    // Undo puts every tab back in its window, at its place.
    await click(popup, '#pc-undo-close');
    await expect.poll(() => placesOf(worker, 'close-target.test')).toEqual(before);
    await expect.poll(() => text(popup, '#pc-status')).toBe(await say('restoredCount', 3));
    expect(await popup.evaluate('document.querySelector("#pc-undo-close").hidden')).toBe(true);

    // Close duplicates: a pinned copy stays and its plain copy goes; the copy in
    // view in the other window stays though it comes later; of three plain copies
    // the first stays; pages that differ after "#" are not copies.
    await expect.poll(() => text(popup, '#pc-duplicates-count')).toBe('4');
    await click(popup, '#pc-close-duplicates');
    await expect.poll(() => text(popup, '#pc-status')).toBe(await say('closedDuplicates', 4));
    closedSoFar += 4;
    const afterDuplicates = await queryTabs(worker);
    expect(afterDuplicates.filter(tab => tab.url === 'http://duplicate.test/item').map(tab => ({ id: tab.id, pinned: tab.pinned })))
      .toEqual([{ id: tabFor('http://duplicate.test/item', second.id).id, pinned: true }]);
    expect(afterDuplicates.filter(tab => tab.url === 'http://second-window.test/keep').map(tab => ({ id: tab.id, active: tab.active })))
      .toEqual([{ id: second.tabs[0].id, active: true }]);
    expect(afterDuplicates.filter(tab => tab.url === 'http://copies.test/page').map(tab => tab.id)).toEqual([tabFor('http://copies.test/page', primary).id]);
    expect(afterDuplicates.filter(tab => tab.url.startsWith('http://mail.test/')).length).toBe(2);
    await expect.poll(() => text(popup, '#pc-duplicates-count')).toBe('0');
    expect(await popup.evaluate('document.querySelector("#pc-close-duplicates").disabled')).toBe(true);

    // Right-click. Chrome cannot synthesize an OS context-menu selection over
    // CDP, so call the installed handler with the tab Chrome reports; every tab
    // query and removal stays native. The menu item itself must exist: updating
    // one that does not is an error.
    expect(await worker.evaluate(id => chrome.contextMenus.update(id, {}).then(() => 'present', error => error.message), MENU_ITEM)).toBe('present');
    const privateTab = (await queryTabs(worker)).find(tab => tab.incognito);
    await worker.evaluate(({ id, tab }) => handleContextMenuClick({ menuItemId: id, pageUrl: tab.url }, tab), { id: MENU_ITEM, tab: { ...privateTab, url: 'http://private.test/private' } });
    // In a private tab it does nothing: the site's tab in the normal window stays.
    expect(await open(tabFor('http://private.test/public'))).toBe(true);
    expect(await open(privateTab)).toBe(true);
    // In a normal tab it closes that exact site in every window and keeps pinned tabs.
    const clicked = (await queryTabs(worker)).find(tab => tab.url === 'http://close-target.test/one');
    await worker.evaluate(({ id, tab }) => handleContextMenuClick({ menuItemId: id, pageUrl: tab.url }, tab), { id: MENU_ITEM, tab: clicked });
    closedSoFar += 2;
    expect((await placesOf(worker, 'close-target.test')).map(tab => tab.url))
      .toEqual(['http://close-target.test/pinned', 'http://sub.close-target.test/three', 'http://not-close-target.test/four']);

    // A site row closes the normal tab; the private one is never touched.
    await click(popup, '.row.site[data-domain="private.test"]');
    await expect.poll(() => text(popup, '#pc-status')).toBe(await say('closedCount', 1));
    closedSoFar += 1;
    expect(await open(tabFor('http://private.test/public'))).toBe(false);
    expect((await queryTabs(worker)).filter(tab => tab.incognito && tab.windowId === privateWindow.id).length).toBe(1);
    await expect.poll(() => text(popup, '#pc-closed-count')).toBe(await say('closedCountShort', closedSoFar));

    // Settings are saved one control at a time and none overwrites another.
    await click(popup, '#pc-settings-toggle');
    await expectView(popup, 'settings');
    await click(popup, '[data-theme-value="dark"]');
    await expect.poll(() => attribute(popup, '[data-theme-value="dark"]', 'aria-pressed')).toBe('true');
    await click(popup, '[data-accent-value="green"]');
    await expect.poll(() => attribute(popup, '[data-accent-value="green"]', 'aria-pressed')).toBe('true');
    await click(popup, '#pc-tab-settings [data-threshold-step="1"]');
    await expect.poll(() => text(popup, '#pc-tab-settings [data-threshold-value]')).toBe(await unit(popup, 'es', 4, 'hour', 'long'));
    await click(popup, '#pc-keep-pinned');
    await expect.poll(() => attribute(popup, '#pc-keep-pinned', 'aria-checked')).toBe('false');
    expect((await popup.message('pc:getSettings')).settings).toEqual({
      enableInactiveSuggestion: true, inactiveThresholdMinutes: 240, keepPinnedTabs: false, theme: 'dark', accent: 'green'
    });
    await click(popup, '#pc-reset-stats');
    await expect.poll(() => text(popup, '#pc-settings-closed')).toBe(await say('closedCountShort', 0));

    // With "Keep pinned tabs open" off, a site's pinned tab is counted and closed.
    await click(popup, '#pc-settings-back');
    await expectView(popup, 'main');
    await expect.poll(async () => (await siteRows(popup)).find(row => row.domain === 'close-target.test')).toEqual({ domain: 'close-target.test', count: '1' });
    const pinnedPlace = await placesOf(worker, 'close-target.test/pinned');
    expect(pinnedPlace).toEqual([{ url: 'http://close-target.test/pinned', windowId: primary, index: 0, pinned: true }]);
    await click(popup, '.row.site[data-domain="close-target.test"]');
    await expect.poll(() => open(tabFor('http://close-target.test/pinned'))).toBe(false);
    // The row names one exact site: its subdomain's tab is still open.
    await expect.poll(() => text(popup, '#pc-closed-count')).toBe(await say('closedCountShort', 1));
    expect((await placesOf(worker, 'sub.close-target.test')).length).toBe(1);
    // Undo brings the tab back pinned, where it was.
    await click(popup, '#pc-undo-close');
    await expect.poll(() => placesOf(worker, 'close-target.test/pinned')).toEqual(pinnedPlace);
    expect(await open(privateTab)).toBe(true);
    expect(popup.diagnostics).toEqual([]);
  } finally { await browser.close(); }
});

test('native empty: a new profile has nothing to suggest and nothing to do', async ({}, testInfo) => {
  const browser = await launchExtension(testInfo, 'en');
  try {
    const popup = await nativePopup(browser);
    expect(await text(popup, '#pc-open-count')).toBe('1 open tab');
    expect(await text(popup, '#pc-site-count')).toBe('0 sites');
    expect(await text(popup, '#pc-closed-count')).toBe('0 closed');
    expect(await siteRows(popup)).toEqual([]);
    expect(await popup.evaluate('document.querySelector("#pc-suggest-empty").hidden')).toBe(false);
    expect(await text(popup, '#pc-suggest-empty')).toBe('No suggestions right now');
    expect(await popup.evaluate('["#pc-inactive-row", "#pc-close-duplicates"].map(selector => document.querySelector(selector).disabled)')).toEqual([true, true]);
    await expectFits(popup, 'empty');
    await picture(popup, testInfo, 'empty');
    await click(popup, '#pc-sort-tabs-quick');
    await expect.poll(() => text(popup, '#pc-status')).toBe('Nothing to sort');
    expect(popup.diagnostics).toEqual([]);
  } finally { await browser.close(); }
});

test('native live: an open popup follows tabs that open, load and close behind it', async ({}, testInfo) => {
  const browser = await launchExtension(testInfo, 'en');
  try {
    const { worker } = browser;
    const [spare] = await createTabs(browser, [{ url: 'https://spare.test/one' }]);
    const popup = await nativePopup(browser);
    expect(await siteRows(popup)).toEqual([{ domain: 'spare.test', count: '1' }]);

    // Tabs opened in the background, as a link or another extension would open
    // them, appear without reopening the popup. So does a second copy of a page.
    for (const url of ['https://first.test/one', 'https://first.test/two', 'https://second.test/one', 'https://second.test/one']) {
      await worker.evaluate(address => chrome.tabs.create({ url: address, active: false }), url);
    }
    await expect.poll(() => siteRows(popup)).toEqual([
      { domain: 'first.test', count: '2' }, { domain: 'second.test', count: '2' }, { domain: 'spare.test', count: '1' }
    ]);
    await expect.poll(() => text(popup, '#pc-open-count')).toBe('6 open tabs');
    expect(await text(popup, '#pc-site-count')).toBe('3 sites');
    await expect.poll(() => text(popup, '#pc-duplicates-count')).toBe('1');

    // A tab that moves to another site moves to that site's row. Its letter
    // gives way to the site's icon when the icon arrives, which is usually
    // after the page has loaded.
    browser.pages.set('https://icon.test/one', { icon: 'late' });
    await spare.page.goto('https://icon.test/one');
    const iconOf = domain => popup.evaluate(`(() => {
      const icon = document.querySelector('.row.site[data-domain="${domain}"] .fav');
      return !icon ? null : icon.tagName === 'IMG' ? (icon.complete && icon.naturalWidth > 0 ? 'icon' : 'loading') : icon.textContent;
    })()`);
    await expect.poll(() => iconOf('icon.test')).toBe('icon');
    expect(await iconOf('spare.test')).toBe(null);
    expect(await iconOf('second.test')).toBe('S');

    // And tabs closed behind it disappear.
    const first = (await queryTabs(worker)).filter(tab => addressOf(tab).includes('first.test')).map(tab => tab.id);
    await worker.evaluate(ids => chrome.tabs.remove(ids), first);
    await expect.poll(() => siteRows(popup)).toEqual([{ domain: 'second.test', count: '2' }, { domain: 'icon.test', count: '1' }]);
    await expect.poll(() => text(popup, '#pc-open-count')).toBe('4 open tabs');
    await expectFits(popup, 'after the changes');
    expect(popup.diagnostics).toEqual([]);
  } finally { await browser.close(); }
});

test('native inactive review: recent use counts, longest unused first, and nothing closes until asked', async ({}, testInfo) => {
  const browser = await launchExtension(testInfo, 'en');
  try {
    const { worker } = browser;
    const neutral = (await queryTabs(worker)).find(tab => tab.active);
    const [oldest, older, reading, pinned] = await createTabs(browser, [
      { url: 'http://old.test/first', title: 'Oldest tab' },
      { url: 'http://old.test/second', title: 'Older tab' },
      { url: 'http://reading.test/article', title: 'Long article' },
      { url: 'http://pinned.test/keep', title: 'Pinned tab', pinned: true }
    ]);
    // Five hours in, one tab is looked at for a moment.
    await advanceClock(worker, 5 * HOUR);
    await activate(worker, older);
    await activate(worker, neutral);
    // Then the article is read for three hours and left only now. Chromium
    // itself records when a tab came into view, not when it was left.
    await activate(worker, reading);
    await advanceClock(worker, 3 * HOUR);
    await activate(worker, neutral);
    await expect.poll(() => worker.evaluate(async id => Date.now() - ((await chrome.storage.session.get('pc.left'))['pc.left']?.at?.[id] || 0) < 60_000, reading.id),
      { message: 'the background must note when the article was left' }).toBe(true);
    const openBefore = (await queryTabs(worker)).length;

    const popup = await nativePopup(browser);
    expect(await text(popup, '#pc-inactive-count')).toBe('2');
    expect(await text(popup, '#pc-inactive-hint')).toBe('2 hr+');
    await click(popup, '#pc-inactive-row');
    await expectView(popup, 'inactive');
    const listed = () => tabRows(popup, '#pc-inactive-rows').then(rows => rows.map(row => `${row.title} | ${row.place} | ${row.age}`));
    // The article was in use until a moment ago, so it is not listed.
    await expect.poll(listed).toEqual(['Oldest tab | old.test | 8 hr', 'Older tab | old.test | 3 hr']);
    expect(await text(popup, '#pc-inactive-meta')).toBe('2 open tabs');
    expect(await text(popup, '#pc-inactive-close-count')).toBe('2');
    expect(await text(popup, '#pc-inactive-control .note')).toBe('Pinned, playing and current tabs stay open.');
    // Opening the review closes nothing.
    expect((await queryTabs(worker)).length).toBe(openBefore);

    // The stepper changes what counts as inactive, here and in Settings.
    const step = direction => click(popup, `#pc-inactive-control [data-threshold-step="${direction}"]`);
    const threshold = () => text(popup, '#pc-inactive-control [data-threshold-value]');
    await step(1);
    await expect.poll(threshold).toBe('4 hours');
    await expect.poll(listed).toEqual(['Oldest tab | old.test | 8 hr']);
    await step(1);
    await expect.poll(threshold).toBe('8 hours');
    // Unused for eight hours and a little: still listed at exactly eight.
    expect((await popup.message('pc:previewInactive')).tabs.map(tab => tab.title)).toEqual(['Oldest tab']);
    await expect.poll(listed).toEqual(['Oldest tab | old.test | 8 hr']);
    await step(1);
    await expect.poll(threshold).toBe('1 day');
    await expect.poll(listed).toEqual([]);
    expect(await popup.evaluate('document.querySelector("#pc-inactive-empty").hidden')).toBe(false);
    expect(await text(popup, '#pc-inactive-empty')).toBe('No inactive tabs');
    expect(await popup.evaluate('document.querySelector("#pc-inactive-close").disabled')).toBe(true);
    expect((await popup.message('pc:getSettings')).settings.inactiveThresholdMinutes).toBe(1440);
    for (const expected of ['8 hours', '4 hours', '2 hours']) {
      await step(-1);
      await expect.poll(threshold).toBe(expected);
    }
    await expect.poll(listed).toEqual(['Oldest tab | old.test | 8 hr', 'Older tab | old.test | 3 hr']);
    expect((await queryTabs(worker)).length).toBe(openBefore);

    // A row's own button closes that one tab and the review stays open.
    await click(popup, `.tab[data-tab-id="${older.id}"] .tab-close`);
    await expect.poll(listed).toEqual(['Oldest tab | old.test | 8 hr']);
    await expect.poll(() => text(popup, '#pc-status')).toBe('Closed: 1');
    await expectView(popup, 'inactive');
    expect((await queryTabs(worker)).map(tab => tab.id)).not.toContain(older.id);

    // The result of that close took the footer's place, so Close comes back when
    // it goes, seven seconds later. Close removes what is listed, returns to the
    // suggestions and offers Undo.
    await click(popup, '#pc-inactive-close', { timeout: 12_000 });
    await expect.poll(() => text(popup, '#pc-status')).toBe('Inactive tabs closed: 1');
    await expectView(popup, 'main');
    expect((await queryTabs(worker)).map(tab => tab.id).sort()).toEqual([neutral.id, reading.id, pinned.id].sort());
    await click(popup, '#pc-undo-close');
    await expect.poll(() => text(popup, '#pc-status')).toBe('Restored: 1');
    await expect.poll(async () => (await queryTabs(worker)).map(addressOf)).toContain(oldest.url);
    expect(popup.diagnostics).toEqual([]);
  } finally { await browser.close(); }
});

test('native sort: loose tabs are ranked by site while pinned tabs and tab groups stay put', async ({}, testInfo) => {
  const browser = await launchExtension(testInfo, 'en');
  try {
    const { worker } = browser;
    const primary = (await queryTabs(worker))[0].windowId;
    const second = await worker.evaluate(() => chrome.windows.create({ url: 'http://zeta.test/elsewhere', focused: false }));
    const created = await createTabs(browser, [
      { url: 'http://zeta.test/1', windowId: primary },
      { url: 'http://alpha.test/1', windowId: primary },
      { url: 'http://group-a.test/1', windowId: primary },
      { url: 'http://zeta.test/2', windowId: primary },
      { url: 'http://zeta.test/3', windowId: primary },
      { url: 'http://beta.test/1', windowId: primary },
      { url: 'http://beta.test/2', windowId: primary },
      { url: 'http://beta.test/3', windowId: primary },
      { url: 'http://alpha.test/2', windowId: primary },
      { url: 'http://pinned.test/keep', windowId: primary, pinned: true },
      { url: 'http://alpha.test/elsewhere', windowId: second.id }
    ]);
    const idOf = address => created.find(tab => tab.url === address).id;
    // Two real tab groups: one of two tabs between loose tabs, one of a single tab.
    const groups = await worker.evaluate(async ({ first, other }) => ({
      first: await chrome.tabs.group({ tabIds: first }), other: await chrome.tabs.group({ tabIds: other })
    }), { first: [idOf('http://group-a.test/1'), idOf('http://zeta.test/2')], other: [idOf('http://beta.test/2')] });
    await worker.evaluate(windowId => chrome.windows.update(windowId, { focused: true }), primary);
    const windowOrder = async windowId => (await queryTabs(worker))
      .filter(tab => tab.windowId === windowId).sort((a, b) => a.index - b.index)
      .map(tab => `${tab.url.replace('http://', '')}${tab.pinned ? ' pinned' : ''}${tab.groupId === groups.first ? ' first group' : tab.groupId === groups.other ? ' other group' : ''}`);
    expect(await windowOrder(primary)).toEqual([
      'pinned.test/keep pinned', 'about:blank', 'zeta.test/1', 'alpha.test/1',
      'group-a.test/1 first group', 'zeta.test/2 first group',
      'zeta.test/3', 'beta.test/1', 'beta.test/2 other group', 'beta.test/3', 'alpha.test/2'
    ]);
    const otherWindow = await windowOrder(second.id);

    const popup = await nativePopup(browser);
    await click(popup, '#pc-sort-tabs-quick');
    // Sites with the most tabs in this window first (beta and zeta have three,
    // counting their grouped tabs), then by name. Every pinned or grouped tab is
    // where it was and in the group it was in.
    const sorted = [
      'pinned.test/keep pinned', 'beta.test/1', 'beta.test/3', 'zeta.test/1',
      'group-a.test/1 first group', 'zeta.test/2 first group',
      'zeta.test/3', 'alpha.test/1', 'beta.test/2 other group', 'alpha.test/2', 'about:blank'
    ];
    await expect.poll(() => windowOrder(primary)).toEqual(sorted);
    // The count is the tabs that are now somewhere else, not all tabs.
    await expect.poll(() => text(popup, '#pc-status')).toBe('Tabs reordered: 6');
    expect(await windowOrder(second.id)).toEqual(otherWindow);
    // That result, with nothing to undo, gives the footer back after four seconds.
    await click(popup, '#pc-sort-tabs-quick', { timeout: 10_000 });
    await expect.poll(() => text(popup, '#pc-status')).toBe('Nothing to sort');
    expect(await windowOrder(primary)).toEqual(sorted);
    expect(popup.diagnostics).toEqual([]);
  } finally { await browser.close(); }
});

test('native typing: matches are listed with the keyword marked, and Enter closes what is listed', async ({}, testInfo) => {
  const browser = await launchExtension(testInfo, 'en');
  try {
    const { worker } = browser;
    const [wikipedia, guide, search, home, unrelated, pinned] = await createTabs(browser, [
      { url: 'https://en.wikipedia.test/wiki/Favicon', title: 'Favicon - Wikipedia', icon: true },
      { url: 'https://docs.example.test/guide', title: 'Wiki migration guide' },
      { url: 'https://example.test/search?q=wiki-export', title: 'Search results' },
      { url: 'https://www.example.test/home', title: 'Example home' },
      { url: 'https://unrelated.test/page', title: 'Something else' },
      { url: 'https://example.test/pinned', title: 'Pinned wiki', pinned: true }
    ]);
    const popup = await nativePopup(browser);
    const rows = () => tabRows(popup, '#pc-match-rows');
    const listed = () => rows().then(found => found.map(row => `${row.title} | ${row.place} | ${row.marked.join(',')}`));

    // A word is looked for in titles and addresses. Where it was found only
    // further along the address, the row shows that part of it.
    await type(popup, 'wiki');
    await expectView(popup, 'search');
    await expect.poll(listed).toEqual([
      'Favicon - Wikipedia | en.wikipedia.test | Wiki,wiki',
      'Wiki migration guide | docs.example.test | Wiki',
      'Search results | example.test/search?q=wiki-export | wiki'
    ]);
    expect(await text(popup, '#pc-match-query')).toBe('wiki');
    expect(await text(popup, '#pc-match-count')).toBe('3 open tabs');
    expect(await text(popup, '#pc-close-count')).toBe('3');
    expect(await popup.evaluate('document.querySelector("#pc-close").hidden')).toBe(false);
    // The tab's own icon where it has one, a letter where it has none.
    expect(await popup.evaluate(`[...document.querySelectorAll('#pc-match-rows .tab')].map(row => {
      const icon = row.querySelector('.fav');
      return icon.tagName === 'IMG' ? (icon.complete && icon.naturalWidth > 0 ? 'icon' : 'broken icon') : icon.textContent;
    })`)).toEqual(['icon', 'D', 'E']);
    await expectFits(popup, 'matches');
    await picture(popup, testInfo, 'typing-matches');

    // A site name lists the site and its subdomains, with the name marked. The
    // pinned tab stays out while pinned tabs are kept.
    const site = [
      'Wiki migration guide | docs.example.test | example.test',
      'Search results | example.test | example.test',
      'Example home | example.test | example.test'
    ];
    await type(popup, 'example.test');
    await expect.poll(listed).toEqual(site);

    // Nothing matches: the list says so and there is nothing to close.
    await type(popup, 'no-such-tab');
    await expect.poll(() => popup.evaluate('document.querySelector("#pc-match-empty")?.hidden')).toBe(false);
    expect(await listed()).toEqual([]);
    expect(await text(popup, '#pc-match-empty')).toBe('No tabs match');
    expect(await text(popup, '#pc-match-count')).toBe('0 open tabs');
    expect(await popup.evaluate('document.querySelector("#pc-close").hidden')).toBe(true);
    await press(popup, 'Enter', 13);
    expect((await queryTabs(worker)).length).toBe(7);

    // Capitals and a leading "www." make no difference to what is listed or marked.
    await type(popup, 'WWW.Example.TEST');
    await expect.poll(listed).toEqual(site);

    // The clear button empties the field and brings the suggestions back.
    await click(popup, '#pc-query-clear');
    await expectView(popup, 'main');
    expect(await popup.evaluate('document.querySelector("#pc-query").value')).toBe('');
    expect(await popup.evaluate('document.querySelector("#pc-query-clear").hidden')).toBe(true);
    expect(await focused(popup)).toBe('pc-query');

    // A row's own button closes that tab and the list stays.
    await type(popup, 'wiki');
    await expect.poll(async () => (await rows()).length).toBe(3);
    await click(popup, `.tab[data-tab-id="${guide.id}"] .tab-close`);
    await expect.poll(async () => (await rows()).map(row => row.id)).toEqual([wikipedia.id, search.id]);
    await expect.poll(() => text(popup, '#pc-status')).toBe('Closed: 1');
    await expectView(popup, 'search');
    expect(await popup.evaluate('document.querySelector("#pc-query").value')).toBe('wiki');

    // Enter closes the listed tabs and nothing else.
    await popup.evaluate('document.querySelector("#pc-query").focus()');
    await press(popup, 'Enter', 13);
    await expect.poll(() => text(popup, '#pc-status')).toBe('Closed: 2');
    await expectView(popup, 'main');
    expect((await queryTabs(worker)).map(tab => tab.id).filter(id => [wikipedia, guide, search, home, unrelated, pinned].some(tab => tab.id === id)).sort())
      .toEqual([home.id, unrelated.id, pinned.id].sort());
    await click(popup, '#pc-undo-close');
    await expect.poll(() => text(popup, '#pc-status')).toBe('Restored: 2');
    await expect.poll(async () => (await queryTabs(worker)).map(addressOf).filter(address => address.includes('wiki')).sort())
      .toEqual([wikipedia.url, search.url].sort());
    expect(popup.diagnostics).toEqual([]);
  } finally { await browser.close(); }
});

test('native theme and accent: System follows the browser and each preset recolours both themes', async ({}, testInfo) => {
  const browser = await launchExtension(testInfo, 'en');
  try {
    await createTabs(browser, [{ url: 'https://example.test/one' }, { url: 'https://example.test/two' }]);
    let popup = await nativePopup(browser);
    const scheme = value => popup.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });
    const colours = () => popup.evaluate(`(() => {
      const style = getComputedStyle(document.documentElement);
      return [style.getPropertyValue('--accent').trim(), getComputedStyle(document.body).backgroundColor, style.colorScheme].join(' ');
    })()`);
    const light = 'rgb(246, 246, 244) light';
    const dark = 'rgb(26, 27, 33) dark';
    // Switches the browser's setting and lets the popup react before the next check.
    const switched = async value => {
      await scheme(value);
      await expect.poll(() => popup.evaluate('matchMedia("(prefers-color-scheme: dark)").matches')).toBe(value === 'dark');
      await popup.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
    };

    // A new install follows the browser's light or dark setting, live.
    expect(await popup.evaluate('document.documentElement.dataset.theme')).toBe('system');
    await scheme('light');
    await expect.poll(colours).toBe(`#7054d8 ${light}`);
    await scheme('dark');
    await expect.poll(colours).toBe(`#957dff ${dark}`);

    await click(popup, '#pc-settings-toggle');
    await expectView(popup, 'settings');
    expect(await attribute(popup, '[data-theme-value="system"]', 'aria-pressed')).toBe('true');
    expect(await attribute(popup, '[data-accent-value="purple"]', 'aria-pressed')).toBe('true');
    // A preset has one colour for each theme and switches with the browser.
    await click(popup, '[data-accent-value="green"]');
    await expect.poll(colours).toBe(`#00b366 ${dark}`);
    await scheme('light');
    await expect.poll(colours).toBe(`#008249 ${light}`);
    expect(await popup.evaluate('[...document.querySelectorAll("[data-accent-value]")].filter(swatch => swatch.getAttribute("aria-pressed") === "true").map(swatch => swatch.dataset.accentValue)')).toEqual(['green']);
    // Every swatch shows its own colour for the theme in use.
    expect(await popup.evaluate('[...document.querySelectorAll("[data-accent-value]")].map(swatch => getComputedStyle(swatch).backgroundColor)')).toEqual([
      'rgb(112, 84, 216)', 'rgb(16, 107, 222)', 'rgb(0, 130, 73)', 'rgb(189, 77, 0)', 'rgb(194, 42, 108)', 'rgb(73, 77, 85)'
    ]);
    // Dark and Light hold whatever the browser says.
    await click(popup, '[data-theme-value="dark"]');
    await expect.poll(colours).toBe(`#00b366 ${dark}`);
    await click(popup, '[data-theme-value="light"]');
    await expect.poll(colours).toBe(`#008249 ${light}`);
    await switched('dark');
    expect(await colours()).toBe(`#008249 ${light}`);
    await picture(popup, testInfo, 'accent-green-light');
    // Purple is the stylesheet's own colour: nothing is left set on the document.
    await click(popup, '[data-accent-value="purple"]');
    await expect.poll(colours).toBe(`#7054d8 ${light}`);
    expect(await popup.evaluate('document.documentElement.getAttribute("style") || ""')).toBe('');
    expect((await popup.message('pc:getSettings')).settings).toMatchObject({ theme: 'light', accent: 'purple' });

    // The choice is still there when the popup is opened again.
    await click(popup, '[data-accent-value="orange"]');
    await expect.poll(colours).toBe(`#bd4d00 ${light}`);
    const first = popup;
    await popup.close();
    popup = await nativePopup(browser);
    await switched('dark');
    expect(await popup.evaluate('document.documentElement.dataset.theme')).toBe('light');
    expect(await colours()).toBe(`#bd4d00 ${light}`);
    expect([...first.diagnostics, ...popup.diagnostics]).toEqual([]);
  } finally { await browser.close(); }
});

test('native upgrade: settings saved by 4.0.4 still apply and a shorter inactivity time becomes 30 minutes', async ({}, testInfo) => {
  const browser = await launchExtension(testInfo, 'en');
  try {
    const { worker } = browser;
    await createTabs(browser, [{ url: 'https://single.test/one' }, { url: 'https://pair.test/one' }, { url: 'https://pair.test/two' }]);
    // What 4.0.4 wrote for someone who chose the dark theme, a minimum of three
    // tabs per suggested site and the shortest inactivity time its field took.
    await worker.evaluate(() => chrome.storage.local.set({ 'pc.settings': {
      enableInactiveSuggestion: true, inactiveThresholdMinutes: 1, suggestMinOpenTabsPerDomain: 3,
      decayDays: 14, maxHistory: 200, showQuickActions: true, theme: 'dark'
    } }));
    await advanceClock(worker, 10);
    const popup = await nativePopup(browser);
    expect(await popup.evaluate('document.documentElement.dataset.theme')).toBe('dark');
    // Every site is listed now, whatever the old minimum was.
    expect(await siteRows(popup)).toEqual([{ domain: 'pair.test', count: '2' }, { domain: 'single.test', count: '1' }]);
    expect(await text(popup, '#pc-inactive-hint')).toBe('30 min+');
    expect((await popup.message('pc:getSettings')).settings).toMatchObject({
      inactiveThresholdMinutes: 30, theme: 'dark', accent: 'purple', keepPinnedTabs: true, enableInactiveSuggestion: true
    });
    // Ten minutes after the tabs were left, one minute would list all three.
    expect(await text(popup, '#pc-inactive-count')).toBe('0');
    expect(await popup.evaluate('document.querySelector("#pc-inactive-row").disabled')).toBe(true);
    await click(popup, '#pc-settings-toggle');
    await expectView(popup, 'settings');
    const threshold = () => text(popup, '#pc-tab-settings [data-threshold-value]');
    expect(await threshold()).toBe('30 minutes');
    expect(await popup.evaluate('document.querySelector("#pc-tab-settings [data-threshold-step=\\"-1\\"]").disabled')).toBe(true);
    await click(popup, '#pc-tab-settings [data-threshold-step="1"]');
    await expect.poll(threshold).toBe('1 hour');
    expect((await popup.message('pc:getSettings')).settings).toMatchObject({ inactiveThresholdMinutes: 60, theme: 'dark' });
    await expectFits(popup, 'settings');
    expect(popup.diagnostics).toEqual([]);
  } finally { await browser.close(); }
});

for (const locale of ['es', 'he', 'ja']) {
  test(`native ${locale}: a very long hostname and lifetime count fit in every view`, async ({}, testInfo) => {
    const browser = await launchExtension(testInfo, locale);
    try {
      const { worker } = browser;
      const domain = ['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'test'].join('.');
      await createTabs(browser, [{ url: `https://${domain}/one`, title: 'x'.repeat(300) }, { url: 'https://developer.mozilla.org/two' }]);
      await worker.evaluate(() => chrome.storage.local.set({ 'pc.stats': { totalTabsEaten: Number.MAX_SAFE_INTEGER, startedAt: Date.now() } }));
      await advanceClock(worker, 3 * HOUR);
      const popup = await nativePopup(browser);
      const total = await counted(popup, locale, 'closedCountShort', Number.MAX_SAFE_INTEGER);
      expect(await text(popup, '#pc-closed-count')).toBe(total);
      expect((await siteRows(popup)).map(row => row.domain)).toEqual([domain, 'developer.mozilla.org']);

      const main = await expectFits(popup, 'main');
      const long = main.hosts.find(host => host.text === domain);
      expect(long.textWidth).toBeGreaterThan(long.width);
      expect(long.title).toContain(domain);
      await picture(popup, testInfo, `${locale}-long-main`);

      // The same hostname as a keyword, and as a row in the inactive review.
      await type(popup, domain, { paste: true });
      await expect.poll(async () => (await tabRows(popup, '#pc-match-rows')).map(row => row.place)).toEqual([domain]);
      await expectFits(popup, 'matches');
      await click(popup, '#pc-query-clear');
      await click(popup, '#pc-inactive-row');
      await expect.poll(async () => (await tabRows(popup, '#pc-inactive-rows')).map(row => row.place)).toEqual([domain, 'developer.mozilla.org']);
      await expectFits(popup, 'inactive');
      await click(popup, '#pc-inactive-back');

      await click(popup, '#pc-settings-toggle');
      await expectView(popup, 'settings');
      expect(await text(popup, '#pc-settings-closed')).toBe(total);
      await expectFits(popup, 'settings');
      await picture(popup, testInfo, `${locale}-long-settings`);
      await click(popup, '#pc-settings-back');
      await expectFits(popup, 'main again');
      expect(popup.diagnostics).toEqual([]);
    } finally { await browser.close(); }
  });
}

for (const locale of ['en', 'de', 'he']) {
  test(`native ${locale}: sites are one ranked column that the keyboard follows`, async ({}, testInfo) => {
    const browser = await launchExtension(testInfo, locale);
    try {
      const { worker } = browser;
      const ranked = [['github.com', 4], ['chatgpt.com', 3], ['chromewebstore.google.test', 2], ['fe6b245e.tabtools-website.pages.dev', 1], ['supabase.com', 1], ['fly.io', 1]];
      const tabs = await createTabs(browser, ranked.flatMap(([domain, count]) => Array.from({ length: count }, (_, i) => ({ url: `https://${domain}/fixture-${i}`, icon: domain === 'github.com' }))));
      // Age controlled tabs without waiting two hours; the active blank tab is
      // still excluded. No live sites or user browsing state are involved.
      await worker.evaluate(() => chrome.storage.local.set({ 'pc.stats': { totalTabsEaten: 2549, startedAt: Date.now() } }));
      await advanceClock(worker, 3 * HOUR);
      let popup = await nativePopup(browser);
      const number = value => formatted(popup, locale, value);
      expect(await siteRows(popup)).toEqual(await Promise.all(ranked.map(async ([domain, count]) => ({ domain, count: await number(count) }))));
      expect(await text(popup, '#pc-open-count')).toBe(await counted(popup, locale, 'openCount', 13));
      expect(await text(popup, '#pc-site-count')).toBe(await counted(popup, locale, 'siteCount', 6));
      expect(await text(popup, '#pc-inactive-count')).toBe(await number(12));

      // One row per site, one under the other at the same width, each with one
      // tick mark per open tab and its icon or first letter.
      const rows = await popup.evaluate(`[...document.querySelectorAll('#pc-sites .row.site')].map(row => {
        const rect = row.getBoundingClientRect();
        const icon = row.querySelector('.fav');
        return {
          top: rect.top, left: rect.left, width: rect.width,
          ticks: row.querySelector('.bar').getBoundingClientRect().width,
          icon: icon.tagName === 'IMG' ? (icon.complete && icon.naturalWidth > 0 ? 'icon' : 'broken icon') : icon.textContent
        };
      })`);
      // The rows fill the list between its side margins.
      const listWidth = await popup.evaluate(`(() => {
        const list = document.querySelector('#pc-suggest-list');
        const style = getComputedStyle(list);
        return list.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      })()`);
      for (const [index, row] of rows.entries()) {
        expect(row.left).toBe(rows[0].left);
        expect(row.width).toBe(listWidth);
        if (index) expect(row.top).toBe(rows[index - 1].top + 32);
        // Four pixels a tab, less the gap after the last mark.
        expect(row.ticks).toBe(ranked[index][1] * 4 - 1);
      }
      expect(rows.map(row => row.icon)).toEqual(['icon', 'C', 'C', 'F', 'S', 'F']);
      const metrics = await expectFits(popup, 'main');
      expect(metrics.hosts.some(host => host.textWidth > host.width)).toBe(true);
      await picture(popup, testInfo, `${locale}-ranked`);

      // Tab moves down the list in the order it is shown. "Close duplicates"
      // has nothing to close here, so it is skipped.
      await popup.evaluate('document.querySelector("#pc-inactive-row").focus()');
      for (const stop of [...ranked.map(([domain]) => domain), 'pc-sort-tabs-quick']) {
        await press(popup, 'Tab', 9);
        expect(await focused(popup)).toBe(stop);
      }

      // Pinning changes what a click would close, not what is open: pinned
      // tabs are never inactive and, while they are kept, not counted on a row.
      expect((await popup.message('pc:getSuggestions')).overview).toMatchObject({ openTabs: 13, sites: 6, inactive: 12 });
      await worker.evaluate(ids => Promise.all(ids.map(id => chrome.tabs.update(id, { pinned: true }))), tabs.slice(0, 6).map(tab => tab.id));
      expect((await popup.message('pc:getSuggestions')).overview).toMatchObject({ openTabs: 13, sites: 6, inactive: 6 });
      expect((await popup.message('pc:getStats')).stats.totalTabsEaten).toBe(2549);
      await popup.close();
      const reopened = await nativePopup(browser);
      expect(await text(reopened, '#pc-inactive-count')).toBe(await formatted(reopened, locale, 6));
      expect((await siteRows(reopened)).map(row => `${row.domain} ${row.count}`)).toEqual([
        'chromewebstore.google.test 2', 'chatgpt.com 1', 'fe6b245e.tabtools-website.pages.dev 1', 'supabase.com 1', 'fly.io 1'
      ]);
      expect(await text(reopened, '#pc-open-count')).toBe(await counted(reopened, locale, 'openCount', 13));
      expect(await text(reopened, '#pc-site-count')).toBe(await counted(reopened, locale, 'siteCount', 6));
      await click(reopened, '#pc-settings-toggle');
      await click(reopened, '[data-theme-value="dark"]');
      await expect.poll(() => reopened.evaluate('document.documentElement.dataset.theme')).toBe('dark');
      await click(reopened, '#pc-settings-back');
      await expectFits(reopened, 'main in the dark theme');
      await picture(reopened, testInfo, `${locale}-ranked-dark`);
      expect([...popup.diagnostics, ...reopened.diagnostics]).toEqual([]);
    } finally { await browser.close(); }
  });
}

for (const locale of ['en', 'de', 'he']) {
  test(`native ${locale}: sixteen sites scroll inside the popup with or without Inactive`, async ({}, testInfo) => {
    const browser = await launchExtension(testInfo, locale);
    try {
      const { worker } = browser;
      const domains = Array.from({ length: 16 }, (_, i) => `group${String(i).padStart(2, '0')}-long-hostname.example.test`);
      await createTabs(browser, domains.map(domain => ({ url: `https://${domain}/fixture` })));
      await advanceClock(worker, 3 * HOUR);
      for (const theme of ['light', 'dark']) {
        for (const inactive of [true, false]) {
          await worker.evaluate(({ enableInactiveSuggestion, theme }) => chrome.storage.local.set({ 'pc.settings': { enableInactiveSuggestion, theme } }), { enableInactiveSuggestion: inactive, theme });
          const popup = await nativePopup(browser);
          expect(await popup.evaluate('document.documentElement.dataset.theme')).toBe(theme);
          // Every site is listed: there is no cut-off and nothing to expand.
          expect((await siteRows(popup)).map(row => row.domain)).toEqual(domains);
          expect(await popup.evaluate('document.querySelector("#pc-inactive-row").hidden')).toBe(!inactive);
          if (inactive) expect(await text(popup, '#pc-inactive-count')).toBe(await formatted(popup, locale, 16));
          // The list scrolls within its own fixed height, fading at the end, so
          // the popup stays one size and the footer stays in view.
          const metrics = await expectFits(popup, 'main');
          expect(metrics.hosts.length).toBe(16);
          expect(metrics.hosts.every(host => host.textWidth > host.width)).toBe(true);
          const list = await popup.evaluate(`(() => {
            const list = document.querySelector('#pc-suggest-list');
            const foot = document.querySelector('#pc-foot-main').getBoundingClientRect();
            list.scrollTop = list.scrollHeight;
            const last = list.querySelector('.row.site:last-child').getBoundingClientRect();
            const box = list.getBoundingClientRect();
            const style = getComputedStyle(list);
            const result = {
              height: list.clientHeight, content: list.scrollHeight, fade: list.classList.contains('fade'),
              mask: style.maskImage || style.webkitMaskImage,
              footBottom: foot.bottom, popupHeight: innerHeight, lastRowInView: last.top >= box.top && last.bottom <= box.bottom
            };
            list.scrollTop = 0;
            return result;
          })()`);
          expect(list.height).toBe(353);
          expect(list.content).toBeGreaterThan(list.height);
          expect(list.fade).toBe(true);
          expect(list.mask).toContain('linear-gradient');
          expect(list.lastRowInView).toBe(true);
          // Heights are not whole pixels (12px text is 16.2px tall), so allow one.
          expect(list.footBottom).toBeLessThanOrEqual(list.popupHeight + 1);
          await picture(popup, testInfo, `${locale}-sixteen-sites-${inactive ? 'with' : 'without'}-inactive-${theme}`);
          expect(popup.diagnostics).toEqual([]);
          await popup.close();
        }
      }
    } finally { await browser.close(); }
  });
}
