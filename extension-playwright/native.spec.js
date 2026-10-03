// SPDX-License-Identifier: MPL-2.0
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect, chromium } = require('@playwright/test');
const { registry, catalogue } = require('../scripts/localisation');

const root = path.resolve(__dirname, '..');
const extension = path.join(root, 'dist', process.env.TABTOOLS_EXTENSION_TARGET || 'chrome');

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
        `--lang=${locale}`, `--accept-lang=${locale}`, '--no-sandbox'
      ]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    return { context, worker, id: new URL(worker.url()).hostname };
  };
  let browser = await launch();
  if (privateAccess) {
    const id = browser.id;
    await browser.context.close();
    const saved = JSON.parse(fs.readFileSync(preferenceFile, 'utf8'));
    saved.extensions.settings[id].incognito = true;
    fs.writeFileSync(preferenceFile, JSON.stringify(saved));
    browser = await launch();
    expect(await browser.worker.evaluate(() => new Promise(resolve => chrome.extension.isAllowedIncognitoAccess(resolve)))).toBe(true);
  }
  // Fulfill controlled regular-tab pages locally; separate windows use
  // reserved .test hostnames and no external accounts or content.
  await browser.context.route(/^https?:\/\//, route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><html><head><title>TabTools disposable native test tab</title></head><body>Local native extension test page</body></html>'
  }));
  return { ...browser, close: async () => {
    try { await browser.context.close(); }
    finally { fs.rmSync(profile, { recursive: true, force: true }); }
  } };
}

async function createTabs(browser, descriptors) {
  const { worker, context } = browser;
  const activeTabs = (await queryTabs(worker)).filter(tab => tab.active);
  const created = [];
  for (const item of descriptors) {
    // Attaching before navigation lets Playwright fulfill the initial request,
    // including HSTS sites used to exercise long real-world hostnames.
    const page = await context.newPage();
    await page.goto(item.url);
    const tab = (await queryTabs(worker)).find(tab => tab.url === item.url && !created.some(previous => previous.id === tab.id));
    expect(tab, 'the created browser page must have a native tab').toBeTruthy();
    if (item.windowId !== undefined) await worker.evaluate(({ tabId, windowId }) => chrome.tabs.move(tabId, { windowId, index: -1 }), { tabId: tab.id, windowId: item.windowId });
    if (item.pinned) await worker.evaluate(tabId => chrome.tabs.update(tabId, { pinned: true }), tab.id);
    created.push({ ...tab, ...item });
  }
  for (const tab of activeTabs) await worker.evaluate(tabId => chrome.tabs.update(tabId, { active: true }), tab.id);
  return created;
}

async function queryTabs(worker) {
  return worker.evaluate(() => chrome.tabs.query({}));
}

async function nativePopup({ context, worker, id }) {
  await worker.evaluate(() => chrome.action.openPopup());
  const cdp = await context.browser().newBrowserCDPSession();
  const { targetInfos } = await cdp.send('Target.getTargets');
  const target = targetInfos.find(item => item.url === `chrome-extension://${id}/popup/popup.html`);
  expect(target, 'the real browser action popup must be present').toBeTruthy();
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
  await evaluate('document.fonts.ready.then(() => true)');
  await expect.poll(() => evaluate('Boolean(document.querySelector("#pc-open-count").textContent)')).toBe(true);
  const message = (type, payload = {}) => evaluate(`new Promise(resolve => chrome.runtime.sendMessage(${JSON.stringify({ type, ...payload })}, resolve))`);
  return { evaluate, message, diagnostics, send, close: () => cdp.send('Target.closeTarget', { targetId: target.targetId }) };
}

async function click(popup, selector) {
  await popup.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}

async function layout(popup) {
  return popup.evaluate(`(() => {
    const body = document.body.getBoundingClientRect();
    const controls = [...document.querySelectorAll('button, input, .pill, .setting-row, .card, .chip .label, .chip .count')].filter(element => element.getClientRects().length);
    const outside = controls.filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.left < body.left - 1 || rect.right > body.right + 1;
    }).map(element => element.id || element.className);
    const labels = [...document.querySelectorAll('.chip[data-domain] .label')].map(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return { text: element.textContent, width: element.getBoundingClientRect().width, textWidth: range.getBoundingClientRect().width };
    });
    return { width: body.width, viewport: innerWidth, horizontalOverflow: document.documentElement.scrollWidth - innerWidth, outside, labels };
  })()`);
}

for (const entry of registry) {
  test(`native popup ${entry.locale}: catalogue, readable sites, counters and settings`, async ({}, testInfo) => {
    const browser = await launchExtension(testInfo, entry.extension.replaceAll('_', '-'));
    try {
      await createTabs(browser, [
        { url: 'https://developer.mozilla.org/one' },
        { url: 'https://developer.mozilla.org/two' },
        { url: 'https://wikipedia.org/three' },
        { url: 'https://wikipedia.org/four' }
      ]);
      await browser.worker.evaluate(() => chrome.storage.local.set({ 'pc.stats': { totalTabsEaten: 999999, startedAt: Date.now() } }));
      const popup = await nativePopup(browser);
      expect(await popup.evaluate('chrome.i18n.getMessage("translationLocale")')).toBe(entry.locale);
      expect(await popup.evaluate('document.documentElement.lang')).toBe(entry.locale);
      expect(await popup.evaluate('document.documentElement.dir')).toBe(entry.direction);
      expect(await popup.evaluate('document.querySelector("#pc-settings-toggle").textContent')).toBe(catalogue(entry.locale).settings);
      const expectedCount = (key, count) => catalogue(entry.locale)[key][new Intl.PluralRules(entry.locale).select(count)].replace('{count}', String(count));
      await expect.poll(() => popup.evaluate('document.querySelector("#pc-count-pill").textContent')).toBe(expectedCount('closedCountShort', 999999));
      const openCount = (await queryTabs(browser.worker)).filter(tab => !tab.incognito).length;
      expect(await popup.evaluate('document.querySelector("#pc-open-count").textContent')).toBe(expectedCount('openCountShort', openCount));
      await expect.poll(() => popup.evaluate('document.querySelectorAll(".chip[data-domain]").length')).toBe(2);
      const actions = await layout(popup);
      expect(actions.width).toBeLessThanOrEqual(800);
      expect(actions.width).toBeLessThanOrEqual(actions.viewport);
      expect(actions.horizontalOverflow).toBeLessThanOrEqual(1);
      expect(actions.outside).toEqual([]);
      for (const label of actions.labels) expect(label.textWidth, `${entry.locale}: ${label.text} must stay readable`).toBeLessThanOrEqual(label.width + 0.01);
      await click(popup, '#pc-settings-toggle');
      expect(await popup.evaluate('document.querySelector("#pc-tab-settings").getAttribute("aria-hidden")')).toBe('false');
      const settings = await layout(popup);
      expect(settings.width).toBe(actions.width);
      expect(settings.horizontalOverflow).toBeLessThanOrEqual(1);
      expect(settings.outside).toEqual([]);
      await click(popup, '[data-theme-value="dark"]');
      await expect.poll(() => popup.evaluate('document.documentElement.dataset.theme')).toBe('dark');
      await click(popup, '#pc-settings-toggle');
      expect((await layout(popup)).width).toBe(actions.width);
      expect(popup.diagnostics).toEqual([]);
      const screenshot = await popup.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      const screenshotPath = testInfo.outputPath(`${entry.locale}-native-popup.png`);
      fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
      await testInfo.attach(`${entry.locale}-native-popup`, { path: screenshotPath, contentType: 'image/png' });
    } finally { await browser.close(); }
  });
}

test('native actions: close, undo, pinned duplicate retention, sorting, inactive and offline settings', async ({}, testInfo) => {
  const browser = await launchExtension(testInfo, 'es', true);
  try {
    const primary = (await queryTabs(browser.worker))[0].windowId;
    const second = await browser.worker.evaluate(() => chrome.windows.create({ url: 'http://second-window.test/keep', focused: false }));
    const privateWindow = await browser.worker.evaluate(() => chrome.windows.create({ url: 'http://private.test/private', incognito: true, focused: false }));
    const created = await createTabs(browser, [
      { url: 'http://close-target.test/one', windowId: primary },
      { url: 'http://close-target.test/two', windowId: second.id },
      { url: 'http://private.test/public', windowId: primary },
      { url: 'http://duplicate.test/item#one', windowId: primary },
      { url: 'http://duplicate.test/item#two', windowId: second.id, pinned: true },
      { url: 'http://inactive.test/item', windowId: primary },
      { url: 'http://pinned.test/item', windowId: primary, pinned: true }
    ]);
    await browser.worker.evaluate(windowId => chrome.windows.update(windowId, { focused: true }), primary);
    await browser.context.setOffline(true);
    let popup = await nativePopup(browser);
    const allDiagnostics = popup.diagnostics;
    expect((await popup.message('pc:getSuggestions')).suggestions.find(item => item.domain === 'private.test')).toMatchObject({ openCount: 1 });
    const closeTargets = created.filter(tab => tab.url.includes('close-target.test'));
    await popup.evaluate('document.querySelector("#pc-query").value = "close-target.test"');
    await click(popup, '#pc-close');
    await expect.poll(async () => (await queryTabs(browser.worker)).filter(tab => closeTargets.some(target => target.id === tab.id)).length).toBe(0);
    await expect.poll(() => popup.evaluate('document.querySelector("#pc-undo-close").disabled')).toBe(false);
    await click(popup, '#pc-undo-close');
    await expect.poll(async () => (await queryTabs(browser.worker)).filter(tab => tab.url.includes('close-target.test')).length).toBe(2);
    const restored = (await queryTabs(browser.worker)).filter(tab => tab.url.includes('close-target.test'));
    expect(restored.map(tab => tab.windowId).sort()).toEqual([primary, second.id].sort());
    await click(popup, '#pc-close-duplicates');
    const pinnedDuplicate = created.find(tab => tab.pinned && tab.url.includes('duplicate.test'));
    const unpinnedDuplicate = created.find(tab => !tab.pinned && tab.url.includes('duplicate.test'));
    await expect.poll(async () => (await queryTabs(browser.worker)).some(tab => tab.id === unpinnedDuplicate.id)).toBe(false);
    expect((await queryTabs(browser.worker)).some(tab => tab.id === pinnedDuplicate.id && tab.pinned)).toBe(true);
    const privateClose = await popup.message('pc:closeByDomain', { query: 'private.test' });
    expect(privateClose.closedCount).toBe(1);
    expect((await queryTabs(browser.worker)).some(tab => tab.windowId === privateWindow.id && tab.incognito)).toBe(true);
    const settingsResponses = await popup.evaluate(`Promise.all([
      { theme: 'dark' }, { suggestMinOpenTabsPerDomain: 3 }, { inactiveThresholdMinutes: 1 }
    ].map(payload => new Promise(resolve => chrome.runtime.sendMessage({ type: 'pc:updateSettings', payload }, resolve))))`);
    expect(settingsResponses.every(result => result.ok)).toBe(true);
    expect((await popup.message('pc:getSettings')).settings).toMatchObject({ theme: 'dark', suggestMinOpenTabsPerDomain: 3, inactiveThresholdMinutes: 1 });
    const pinned = created.find(tab => tab.url.includes('pinned.test'));
    const active = (await queryTabs(browser.worker)).find(tab => tab.windowId === primary && tab.active);
    const originalClock = await browser.worker.evaluate(() => { globalThis.nativeTestOriginalNow = Date.now; Date.now = () => globalThis.nativeTestOriginalNow() + 120000; return true; });
    expect(originalClock).toBe(true);
    const inactiveResult = await popup.message('pc:closeInactive');
    await browser.worker.evaluate(() => { Date.now = globalThis.nativeTestOriginalNow; delete globalThis.nativeTestOriginalNow; });
    expect(inactiveResult.ok).toBe(true);
    expect(inactiveResult.closedCount).toBeGreaterThan(0);
    const remaining = await queryTabs(browser.worker);
    expect(remaining.some(tab => tab.id === pinned.id)).toBe(true);
    expect(remaining.some(tab => tab.id === active.id)).toBe(true);
    expect(remaining.some(tab => tab.incognito && tab.windowId === privateWindow.id)).toBe(true);
    const sortTabs = await createTabs(browser, [
      { url: 'http://zeta.test/one', windowId: primary },
      { url: 'http://alpha.test/one', windowId: primary },
      { url: 'http://zeta.test/two', windowId: primary }
    ]);
    await browser.worker.evaluate(windowId => chrome.windows.update(windowId, { focused: true }), primary);
    popup = await nativePopup(browser);
    const otherBefore = (await queryTabs(browser.worker)).filter(tab => tab.windowId === second.id).map(tab => tab.id);
    await click(popup, '#pc-sort-tabs-quick');
    await expect.poll(async () => {
      const ordered = (await queryTabs(browser.worker)).filter(tab => sortTabs.some(item => item.id === tab.id)).sort((a, b) => a.index - b.index);
      return ordered.map(tab => new URL(tab.url).hostname);
    }).toEqual(['zeta.test', 'zeta.test', 'alpha.test']);
    expect((await queryTabs(browser.worker)).filter(tab => tab.windowId === second.id).map(tab => tab.id)).toEqual(otherBefore);
    expect((await queryTabs(browser.worker)).find(tab => tab.id === pinned.id).index).toBe(0);
    expect(await browser.worker.evaluate(() => chrome.contextMenus.onClicked.hasListeners())).toBe(true);
    // Chrome cannot synthesize an OS context-menu selection over CDP. Dispatch
    // its installed handler while keeping all tab query/remove APIs native.
    await browser.worker.evaluate(async () => handleContextMenuClick({ pageUrl: 'http://zeta.test/one' }, null));
    expect((await queryTabs(browser.worker)).filter(tab => tab.url.includes('zeta.test')).length).toBe(0);
    expect([...allDiagnostics, ...popup.diagnostics]).toEqual([]);
  } finally { await browser.close(); }
});

test('native Spanish: a long hostname keeps neighboring sites readable at 500px', async ({}, testInfo) => {
  const browser = await launchExtension(testInfo, 'es');
  try {
    const domain = ['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'test'].join('.');
    await createTabs(browser, [{ url: `https://${domain}/one` }, { url: 'https://developer.mozilla.org/two' }]);
    const popup = await nativePopup(browser);
    await expect.poll(() => popup.evaluate('document.querySelectorAll(".chip[data-domain]").length')).toBe(2);
    // Translated headers can grow the real popup to this supported width. A
    // long site spanning the grid must leave its neighboring site readable.
    await popup.evaluate('document.documentElement.style.setProperty("--popup-width", "500px")');
    await expect.poll(() => popup.evaluate('innerWidth')).toBe(500);
    await click(popup, '#pc-settings-toggle');
    await click(popup, '#pc-settings-toggle');
    const metrics = await layout(popup);
    expect(metrics.width).toBe(500);
    expect(metrics.viewport).toBe(500);
    expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(metrics.outside).toEqual([]);
    expect(metrics.labels.map(label => label.text).sort()).toEqual([domain, 'developer.mozilla.org'].sort());
    for (const label of metrics.labels) expect(label.textWidth, label.text).toBeLessThanOrEqual(label.width + 0.01);
    expect(popup.diagnostics).toEqual([]);
  } finally { await browser.close(); }
});

for (const locale of ['es', 'he', 'ja']) {
  test(`native ${locale}: very long hostname and lifetime count survive settings transitions`, async ({}, testInfo) => {
    const browser = await launchExtension(testInfo, locale);
    try {
      const domain = ['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'test'].join('.');
      await createTabs(browser, [{ url: `https://${domain}/one` }, { url: 'https://developer.mozilla.org/two' }]);
      await browser.worker.evaluate(() => chrome.storage.local.set({ 'pc.stats': { totalTabsEaten: Number.MAX_SAFE_INTEGER, startedAt: Date.now() } }));
      const popup = await nativePopup(browser);
      await expect.poll(() => popup.evaluate('document.querySelectorAll(".chip[data-domain]").length')).toBe(2);
      const assertFits = async () => {
        const metrics = await layout(popup);
        expect(metrics.width).toBeLessThanOrEqual(800);
        expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
        expect(metrics.outside).toEqual([]);
        for (const label of metrics.labels) expect(label.textWidth, `${locale}: ${label.text}`).toBeLessThanOrEqual(label.width + 0.01);
        return metrics.width;
      };
      const originalWidth = await assertFits();
      await click(popup, '#pc-settings-toggle');
      expect(await assertFits()).toBe(originalWidth);
      await click(popup, '#pc-settings-toggle');
      expect(await assertFits()).toBe(originalWidth);
      expect(await popup.evaluate(`document.querySelector('.chip[data-domain="${domain}"]').title`)).toContain(domain);
      expect(popup.diagnostics).toEqual([]);
    } finally { await browser.close(); }
  });
}

for (const locale of ['en', 'he']) {
  test(`native ${locale}: built-in Chrome icons render in light and dark themes`, async ({}, testInfo) => {
    const browser = await launchExtension(testInfo, locale);
    try {
      const names = ['settings', 'extensions', 'downloads', 'history', 'bookmarks'];
      // Real browser-owned pages, including a Settings subpage. Do not emulate
      // their favicon URLs: the shipped fallback must win over those URLs.
      for (const name of names) {
        await browser.worker.evaluate(url => chrome.tabs.create({ url, active: false }), `chrome://${name}/`);
      }
      await browser.worker.evaluate(() => chrome.tabs.create({ url: 'chrome://settings/privacy', active: false }));
      const popup = await nativePopup(browser);
      await expect.poll(() => popup.evaluate('document.querySelectorAll(".internal-icon").length')).toBe(5);
      for (const theme of ['light', 'dark']) {
        await click(popup, '#pc-settings-toggle');
        await click(popup, `[data-theme-value="${theme}"]`);
        await expect.poll(() => popup.evaluate('document.documentElement.dataset.theme')).toBe(theme);
        await click(popup, '#pc-settings-toggle');
        const icons = await popup.evaluate(`Array.from(document.querySelectorAll('.internal-icon'), icon => {
          const style = getComputedStyle(icon), chip = icon.closest('.chip');
          return { name: icon.dataset.internalIcon, mask: style.maskImage, color: style.backgroundColor,
            textColor: getComputedStyle(chip).color, width: icon.getBoundingClientRect().width,
            height: icon.getBoundingClientRect().height, hidden: icon.getAttribute('aria-hidden'),
            label: chip.getAttribute('aria-label'), title: chip.title, count: chip.querySelector('.count').textContent };
        })`);
        expect(icons.map(icon => icon.name).sort()).toEqual([...names].sort());
        for (const icon of icons) {
          expect(icon.mask).toContain(`/icons/internal/${icon.name}.svg`);
          expect(icon.color).toBe(icon.textColor);
          expect(icon.width).toBe(16);
          expect(icon.height).toBe(16);
          expect(icon.hidden).toBe('true');
          expect(icon.label).toContain(icon.name);
          expect(icon.title).toContain(icon.name);
          expect(icon.count).toBe(icon.name === 'settings' ? '2' : '1');
        }
        const loaded = await popup.evaluate(`Promise.all(${JSON.stringify(names)}.map(name => new Promise(resolve => {
          const image = new Image(); image.onload = () => resolve(true); image.onerror = () => resolve(false);
          image.src = '../icons/internal/' + name + '.svg';
        })))`);
        expect(loaded).toEqual(names.map(() => true));
        const metrics = await layout(popup);
        expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
        expect(metrics.outside).toEqual([]);
        const screenshot = await popup.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        const file = testInfo.outputPath(`${locale}-chrome-internal-${theme}.png`);
        fs.writeFileSync(file, Buffer.from(screenshot.data, 'base64'));
        await testInfo.attach(`${locale}-chrome-internal-${theme}`, { path: file, contentType: 'image/png' });
      }
      expect(popup.diagnostics).toEqual([]);
    } finally { await browser.close(); }
  });
}
