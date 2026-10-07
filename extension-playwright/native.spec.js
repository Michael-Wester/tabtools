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
  // The popup document may still be loading when the session attaches.
  await expect.poll(() => evaluate('Boolean(document.querySelector("#pc-open-count")?.textContent)')).toBe(true);
  const message = (type, payload = {}) => evaluate(`new Promise(resolve => chrome.runtime.sendMessage(${JSON.stringify({ type, ...payload })}, resolve))`);
  const close = async () => {
    await cdp.send('Target.closeTarget', { targetId: target.targetId });
    await expect.poll(async () => Boolean(await popupTarget()), { message: 'the popup must close' }).toBe(false);
  };
  return { evaluate, message, diagnostics, send, close };
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
    const labels = [...document.querySelectorAll('.chip[data-domain] .label')].filter(element => element.getClientRects().length).map(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const style = getComputedStyle(element);
      const chip = element.closest('.chip');
      return { text: element.textContent, width: element.getBoundingClientRect().width, textWidth: range.getBoundingClientRect().width, overflow: style.overflow, ellipsis: style.textOverflow, whiteSpace: style.whiteSpace, title: chip.title, accessibleName: chip.getAttribute('aria-label') };
    });
    return { width: body.width, viewport: innerWidth, horizontalOverflow: document.documentElement.scrollWidth - innerWidth, outside, labels };
  })()`);
}

function expectAccessibleLabels(labels) {
  for (const label of labels) {
    expect(label.width, label.text).toBeGreaterThan(0);
    expect(label.title).toContain(label.text);
    expect(label.accessibleName).toContain(label.text);
    if (label.textWidth > label.width) {
      expect(label.overflow).toBe('hidden');
      expect(label.ellipsis).toBe('ellipsis');
      expect(label.whiteSpace).toBe('nowrap');
    }
  }
}

for (const entry of registry) {
  test(`native popup ${entry.locale}: catalogue, accessible sites, counters and settings`, async ({}, testInfo) => {
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
      expectAccessibleLabels(actions.labels);
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

test('native Spanish: long hostnames truncate accessibly in two columns at 500px', async ({}, testInfo) => {
  const browser = await launchExtension(testInfo, 'es');
  try {
    const domain = ['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'test'].join('.');
    await createTabs(browser, [{ url: `https://${domain}/one` }, { url: 'https://developer.mozilla.org/two' }]);
    const popup = await nativePopup(browser);
    await expect.poll(() => popup.evaluate('document.querySelectorAll(".chip[data-domain]").length')).toBe(2);
    // Translated headers can grow the real popup to this supported width. A
    // two-column grid must retain both labels and their accessible full names.
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
    expectAccessibleLabels(metrics.labels);
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
        expectAccessibleLabels(metrics.labels);
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

for (const locale of ['en', 'de', 'he']) {
  test(`native ${locale}: ranked suggestions use two equal columns with accessible ellipsis`, async ({}, testInfo) => {
    const browser = await launchExtension(testInfo, locale);
    try {
      const ranked = [['github.com', 4], ['chatgpt.com', 3], ['chromewebstore.google.test', 2], ['fe6b245e.tabtools-website.pages.dev', 1], ['supabase.com', 1], ['fly.io', 1]];
      const tabs = await createTabs(browser, ranked.flatMap(([domain, count]) => Array.from({ length: count }, (_, i) => ({ url: `https://${domain}/fixture-${i}` }))));
      // Age controlled tabs without waiting two hours; the active blank tab is
      // still excluded. No live sites or user browsing state are involved.
      await browser.worker.evaluate(() => {
        const current = Date.now();
        Date.now = () => current + 3 * 60 * 60 * 1000;
        return chrome.storage.local.set({ 'pc.stats': { totalTabsEaten: 2549, startedAt: current } });
      });
      const popup = await nativePopup(browser);
      await expect.poll(() => popup.evaluate('document.querySelectorAll(".chip").length')).toBe(7);
      const naturalWidth = await popup.evaluate('document.body.getBoundingClientRect().width');
      for (const width of [naturalWidth, 500]) {
        await popup.evaluate(`document.documentElement.style.setProperty('--popup-width', '${width}px')`);
        await click(popup, '#pc-settings-toggle');
        await click(popup, '#pc-settings-toggle');
        const rows = await popup.evaluate(`(() => {
          const wrap = document.querySelector('#pc-suggest-chips').getBoundingClientRect();
          return { left: wrap.left, right: wrap.right, width: wrap.width, gap: parseFloat(getComputedStyle(document.querySelector('#pc-suggest-chips')).columnGap), chips: [...document.querySelectorAll('.chip')].map(chip => {
            const r = chip.getBoundingClientRect();
            return { domain: chip.dataset.domain || 'inactive', top: r.top, left: r.left, right: r.right };
          }) };
        })()`);
        expect(rows.chips.map(chip => chip.domain)).toEqual(['inactive', ...ranked.map(([domain]) => domain)]);
        // Exactly two equal columns in DOM order, including an unfilled final
        // cell for odd counts. Long labels never promote a chip to a full row.
        const columnWidth = (rows.width - rows.gap) / 2;
        for (let i = 0; i < rows.chips.length; i++) {
          const chip = rows.chips[i];
          expect(chip.right - chip.left).toBeCloseTo(columnWidth, 0);
          if (i % 2) expect(chip.top).toBeCloseTo(rows.chips[i - 1].top, 0);
          else if (i) expect(chip.top).toBeGreaterThan(rows.chips[i - 1].top);
        }
        const metrics = await layout(popup);
        expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
        expect(metrics.outside).toEqual([]);
        expectAccessibleLabels(metrics.labels);
        expect(metrics.labels.some(label => label.textWidth > label.width)).toBe(true);
        const screenshot = await popup.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        const file = testInfo.outputPath(`${locale}-ranked-${width}.png`);
        fs.writeFileSync(file, Buffer.from(screenshot.data, 'base64'));
        await testInfo.attach(`${locale}-ranked-${width}`, { path: file, contentType: 'image/png' });
      }
      // Keyboard traversal must retain the same ranking as the visual list.
      await popup.evaluate("document.querySelector('.chip').focus()");
      for (const domain of ranked.map(([domain]) => domain)) {
        await popup.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await popup.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        expect(await popup.evaluate('document.activeElement.dataset.domain')).toBe(domain);
      }
      const before = await popup.message('pc:getSuggestions');
      expect(before.suggestions[0].inactiveCount).toBe(12);
      const openBefore = (await queryTabs(browser.worker)).length;
      // Eligibility can change while open-tab and lifetime-close totals stay
      // constant: pinned tabs are not eligible for inactive cleanup.
      await browser.worker.evaluate(ids => Promise.all(ids.map(id => chrome.tabs.update(id, { pinned: true }))), tabs.slice(0, 6).map(tab => tab.id));
      const after = await popup.message('pc:getSuggestions');
      expect(after.suggestions[0].inactiveCount).toBe(6);
      expect((await queryTabs(browser.worker)).length).toBe(openBefore);
      expect((await popup.message('pc:getStats')).stats.totalTabsEaten).toBe(2549);
      await popup.close();
      const reopened = await nativePopup(browser);
      await expect.poll(() => reopened.evaluate(`document.querySelector('.chip[data-kind="inactive"] .count')?.textContent`)).toBe('6');
      const screenshot = await reopened.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      const file = testInfo.outputPath(`${locale}-ranked-inactive-6.png`);
      fs.writeFileSync(file, Buffer.from(screenshot.data, 'base64'));
      await testInfo.attach(`${locale}-ranked-inactive-6`, { path: file, contentType: 'image/png' });
      await click(reopened, '#pc-settings-toggle');
      await click(reopened, '[data-theme-value="dark"]');
      await expect.poll(() => reopened.evaluate('document.documentElement.dataset.theme')).toBe('dark');
      await click(reopened, '#pc-settings-toggle');
      const dark = await layout(reopened);
      expect(dark.horizontalOverflow).toBeLessThanOrEqual(1);
      expect(dark.outside).toEqual([]);
      expectAccessibleLabels(dark.labels);
      const darkShot = await reopened.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      const darkFile = testInfo.outputPath(`${locale}-ranked-dark.png`);
      fs.writeFileSync(darkFile, Buffer.from(darkShot.data, 'base64'));
      await testInfo.attach(`${locale}-ranked-dark`, { path: darkFile, contentType: 'image/png' });
      expect(reopened.diagnostics).toEqual([]);
      expect(popup.diagnostics).toEqual([]);
    } finally { await browser.close(); }
  });
}

for (const locale of ['en', 'de', 'he']) {
  test(`native ${locale}: suggestions stop at seven rows with or without Inactive`, async ({}, testInfo) => {
    const browser = await launchExtension(testInfo, locale);
    try {
      const domains = Array.from({ length: 16 }, (_, i) => `group${String(i).padStart(2, '0')}-long-hostname.example.test`);
      await createTabs(browser, domains.map(domain => ({ url: `https://${domain}/fixture` })));
      await browser.worker.evaluate(() => {
        const current = Date.now();
        Date.now = () => current + 3 * 60 * 60 * 1000;
      });
      for (const theme of ['light', 'dark']) {
        for (const inactive of [true, false]) {
          await browser.worker.evaluate(({ enableInactiveSuggestion, theme }) => chrome.storage.local.set({ 'pc.settings': { enableInactiveSuggestion, theme } }), { enableInactiveSuggestion: inactive, theme });
          const popup = await nativePopup(browser);
          await expect.poll(() => popup.evaluate('document.querySelectorAll(".chip").length')).toBe(14);
          const chips = await popup.evaluate(`Array.from(document.querySelectorAll('.chip'), chip => {
            const r = chip.getBoundingClientRect();
            const count = chip.querySelector('.count');
            const range = document.createRange(); range.selectNodeContents(count);
            return { domain: chip.dataset.domain || 'inactive', top: r.top, width: r.width, count: count.textContent, countWidth: count.getBoundingClientRect().width, textWidth: range.getBoundingClientRect().width };
          })`);
          expect(chips.map(chip => chip.domain)).toEqual(inactive ? ['inactive', ...domains.slice(0, 13)] : domains.slice(0, 14));
          expect(new Set(chips.map(chip => chip.top)).size).toBe(7);
          for (let i = 0; i < chips.length; i += 2) {
            expect(chips[i].top).toBeCloseTo(chips[i + 1].top, 0);
            expect(chips[i].width).toBeCloseTo(chips[i + 1].width, 0);
          }
          for (const chip of chips) {
            expect(chip.count).toBe(chip.domain === 'inactive' ? '16' : '1');
            expect(chip.textWidth).toBeLessThanOrEqual(chip.countWidth + 0.01);
          }
          expect(await popup.evaluate('document.querySelector("#pc-suggest-more").textContent')).toBe(catalogue(locale).moreCount.replace('{count}', inactive ? '3' : '2'));
          const metrics = await layout(popup);
          expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
          expect(metrics.outside).toEqual([]);
          expectAccessibleLabels(metrics.labels);
          expect(metrics.labels.every(label => label.textWidth > label.width)).toBe(true);
          const screenshot = await popup.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
          const file = testInfo.outputPath(`${locale}-seven-rows-${inactive ? 'with' : 'without'}-inactive-${theme}.png`);
          fs.writeFileSync(file, Buffer.from(screenshot.data, 'base64'));
          await testInfo.attach(`${locale}-seven-rows-${inactive}-${theme}`, { path: file, contentType: 'image/png' });
          expect(popup.diagnostics).toEqual([]);
          await popup.close();
        }
      }
    } finally { await browser.close(); }
  });
}
