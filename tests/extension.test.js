// SPDX-License-Identifier: MPL-2.0
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../scripts/localisation');

// Run the shipped scripts with callback-based browser API fixtures. These tests
// exercise the message boundary and stored results, not an installed browser.
function extension({ tabs = [], locale = 'en', firefox = false } = {}) {
  const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); } });
  const state = {
    tabs: tabs.map((tab, index) => ({ windowId: 1, index, active: false, pinned: false, incognito: false, ...tab })),
    store: {}, menus: [], removed: [], created: [], moves: [], errors: [],
    failRemove: new Set(), failCreate: new Set(), missingWindows: new Set(),
    failQuery: false, failMessage: false, failStorageGet: false, failStorageSet: false,
    delayCreatedNavigation: false, queryCount: 0,
  };
  let nextId = Math.max(0, ...tabs.map(tab => tab.id)) + 1;
  const api = { runtime: { onMessage: event(), onInstalled: event(), onStartup: event() } };
  function callback(fn, value, error) {
    queueMicrotask(() => {
      if (error) api.runtime.lastError = { message: error };
      try { fn?.(value); } finally { delete api.runtime.lastError; }
    });
  }
  api.tabs = {
    query(query, cb) {
      state.queryCount += 1;
      const selected = state.tabs.filter(tab => (!query.currentWindow || tab.windowId === 1) && (!query.active || tab.active));
      callback(cb, state.failQuery ? undefined : structuredClone(selected), state.failQuery ? 'Query failed' : null);
    },
    remove(ids, cb) {
      const list = Array.isArray(ids) ? Array.from(ids) : [ids];
      const failure = list.some(id => state.failRemove.has(id));
      if (!failure) {
        state.removed.push(...list);
        state.tabs = state.tabs.filter(tab => !list.includes(tab.id));
      }
      callback(cb, undefined, failure ? 'Tabs cannot be edited right now' : null);
    },
    create(options, cb) {
      if (state.failCreate.has(options.url) || state.missingWindows.has(options.windowId)) {
        callback(cb, undefined, 'Cannot create this tab');
        return;
      }
      const tab = { id: nextId++, windowId: 1, index: state.tabs.length, pinned: false, ...options };
      if (state.delayCreatedNavigation) tab.url = 'about:blank';
      state.created.push(structuredClone(options));
      state.tabs.push(tab);
      callback(cb, structuredClone(tab));
    },
    move(id, { index }, cb) {
      const tab = state.tabs.find(item => item.id === id);
      state.moves.push({ id, index });
      callback(cb, tab);
    },
    onCreated: event(), onRemoved: event(), onActivated: event(), onUpdated: event(), onReplaced: event(),
  };
  api.storage = { local: {
    get(keys, cb) {
      const names = typeof keys === 'string' ? [keys] : keys;
      const value = structuredClone(Object.fromEntries(names.filter(key => key in state.store).map(key => [key, state.store[key]])));
      callback(cb, state.failStorageGet ? undefined : value, state.failStorageGet ? 'Storage unavailable' : null);
    },
    set(values, cb) {
      if (!state.failStorageSet) Object.assign(state.store, structuredClone(values));
      callback(cb, undefined, state.failStorageSet ? 'Storage write failed' : null);
    },
  }, onChanged: event() };
  api.contextMenus = {
    onClicked: event(),
    create(properties, cb) { state.menus.push(structuredClone(properties)); callback(cb); return properties.id; },
    removeAll(cb) { state.menus = []; callback(cb); },
  };
  api[firefox ? 'browserAction' : 'action'] = { setIcon() {} };
  const messages = L.toWebExtensionMessages(locale);
  api.i18n = { getMessage(key, args = []) {
    const entry = messages[key];
    return entry ? entry.message.replace(/\$(\w+)\$/g, (_, name) => args[Number(entry.placeholders[name].content.slice(1)) - 1]) : '';
  } };
  function send(message) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('No response to ' + message.type)), 1000);
      let responded = false;
      const reply = value => {
        if (responded) return;
        responded = true;
        clearTimeout(timeout);
        resolve(structuredClone(value));
      };
      let pending = false;
      for (const listener of api.runtime.onMessage.listeners) pending = listener(message, {}, reply) === true || pending;
      if (!pending && !responded) reply(undefined);
    });
  }
  api.runtime.sendMessage = (message, cb) => {
    if (state.failMessage) callback(cb, undefined, 'Receiving end does not exist');
    else send(message).then(value => callback(cb, value));
  };
  const context = vm.createContext({ chrome: api, URL, Intl, Date, setTimeout: () => 1,
    console: { error: (...args) => state.errors.push(args), warn: (...args) => state.errors.push(args) } });
  if (firefox) context.browser = api;
  const run = file => vm.runInContext(fs.readFileSync(path.join(L.root, 'src/shared', file), 'utf8'), context, { filename: file });
  const manifest = JSON.parse(fs.readFileSync(path.join(L.root, 'src/overrides', firefox ? 'firefox' : 'chrome', 'manifest.json')));
  if (firefox) manifest.background.scripts.forEach(run);
  else { context.importScripts = (...files) => files.forEach(run); run(manifest.background.service_worker); }
  return { state, api, context, send };
}

async function popup(runtime, sizing = {}) {
  class Element {
    constructor() {
      this.dataset = {}; this.attributes = {}; this.listeners = {}; this.children = [];
      this.value = ''; this.disabled = false; this.hidden = false; this.textContent = '';
      this.style = { setProperty(key, value) { this[key] = value; } };
      const classes = new Set();
      this.classList = { contains: key => classes.has(key), remove: key => classes.delete(key), toggle: (key, enabled) => enabled ? classes.add(key) : classes.delete(key) };
    }
    get textContent() { return this.text; }
    set textContent(value) { this.text = value; this.children = []; }
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key] ?? null; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); }
    async dispatch(name) { for (const fn of this.listeners[name] || []) await fn({}); }
    async click() { await this.dispatch('click'); }
  }
  const ids = ['pc-header', 'pc-status', 'pc-settings-status', 'pc-undo-close', 'min-open', 'inactive-threshold', 'pc-suggest-caption', 'pc-count-pill', 'pc-open-count', 'pc-close', 'pc-close-duplicates', 'pc-suggest-card', 'pc-suggest-chips', 'pc-suggest-empty', 'pc-suggest-more', 'pc-sort-tabs-quick', 'pc-tab-actions', 'pc-tab-settings', 'pc-settings-toggle', 'pc-query'];
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  const themes = ['light', 'dark'].map(theme => { const el = new Element(); el.dataset.themeValue = theme; return el; });
  elements.themes = themes;
  let ready;
  const document = { documentElement: new Element(), body: new Element(), querySelector: selector => elements[selector.slice(1)] || null,
    getElementById: id => elements[id] || null,
    querySelectorAll: selector => selector === '[data-theme-value]' ? themes : [], createElement: () => new Element(),
    addEventListener(name, fn) { if (name === 'DOMContentLoaded') ready = fn; } };
  document.body.getBoundingClientRect = () => ({ width: parseFloat(document.documentElement.style['--popup-width']) || 380 });
  elements['pc-header'].getBoundingClientRect = () => ({ width: document.body.getBoundingClientRect().width - 46 });
  elements['pc-header'].children = [
    { getBoundingClientRect: () => ({ width: 80 }) },
    { getBoundingClientRect: () => ({ width: sizing.controlsWidth ?? 230 }) },
  ];
  elements.root = document.documentElement;
  const context = vm.createContext({ chrome: runtime.api, document, Intl,
    setTimeout: sizing.timers?.setTimeout || (() => 1), clearTimeout: sizing.timers?.clearTimeout || (() => {}), console: runtime.context.console,
    getComputedStyle: () => ({ columnGap: '12px' }), screen: { availWidth: sizing.screenWidth || 1920 } });
  for (const file of ['i18n-fallback.js', 'i18n.js', 'popup/popup.js']) vm.runInContext(fs.readFileSync(path.join(L.root, 'src/shared', file), 'utf8'), context, { filename: file });
  await ready();
  return elements;
}

function popupTimers() {
  const pending = new Map();
  let nextId = 0;
  return {
    setTimeout(callback, delay) { const id = ++nextId; pending.set(id, { callback, delay }); return id; },
    clearTimeout(id) { pending.delete(id); },
    async flushRefreshes() {
      // Run event debounces without expiring user-visible status messages.
      for (const [id, timer] of pending) if (timer.delay < 1000) {
        pending.delete(id);
        timer.callback();
      }
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

test('Chrome worker and Firefox background register translated, stable context-menu actions', async () => {
  for (const firefox of [false, true]) for (const locale of L.registry) {
    const runtime = extension({ locale: locale.locale, firefox });
    await Promise.resolve();
    const entry = runtime.state.menus.find(menu => menu.id === 'tabTools-close-site-tabs-page');
    assert.equal(entry.title, L.catalogue(locale.locale).contextClose, locale.locale);
    assert.equal(runtime.api.contextMenus.onClicked.listeners.length, 1);
    assert.equal(typeof runtime.context.pcStatsEat, 'function');
  }
});

test('exact-domain and keyword cleanup preserve unrelated and private tabs', async () => {
  const runtime = extension({ tabs: [
    { id: 1, url: 'https://www.example.com/a', windowId: 1 },
    { id: 2, url: 'https://example.com/b', windowId: 2 },
    { id: 3, url: 'https://other.test/', title: 'example.com in a title' },
    { id: 4, url: 'https://example.com/private', incognito: true },
  ] });
  const result = await runtime.send({ type: 'pc:closeByKeyword', query: 'example.com' });
  assert.deepEqual(runtime.state.removed, [1, 2]);
  assert.equal(result.closedCount, 2);
  assert.equal(runtime.state.store['pc.stats'].totalTabsEaten, 2);
  assert.deepEqual(result.closedTabs.map(tab => tab.windowId), [1, 2]);
  const next = await runtime.send({ type: 'pc:closeByKeyword', query: 'title' });
  assert.equal(next.closedCount, 1);
  assert.deepEqual(runtime.state.tabs.map(tab => tab.id), [4]);
});

test('site actions match single-label hosts exactly instead of treating them as keywords', async () => {
  const runtime = extension({ tabs: [
    { id: 1, url: 'http://localhost:3000/app' },
    { id: 2, url: 'https://docs.example/help', title: 'localhost instructions' },
  ] });
  await runtime.context.handleContextMenuClick({}, runtime.state.tabs[0]);
  assert.deepEqual(runtime.state.removed, [1]);
});

test('blank cleanup queries cannot match every tab', async () => {
  const runtime = extension({ tabs: [{ id: 1, url: 'https://example.com/' }] });
  const result = await runtime.send({ type: 'pc:closeByKeyword', query: '  ' });
  assert.equal(result.closedCount, 0);
  assert.deepEqual(runtime.state.removed, []);
});

test('failed removals are excluded from the close count, stats and undo snapshots', async () => {
  const runtime = extension({ tabs: [1, 2].map(id => ({ id, url: 'https://example.com/' + id })) });
  runtime.state.failRemove.add(2);
  const result = await runtime.send({ type: 'pc:closeByKeyword', query: 'example.com' });
  assert.deepEqual(runtime.state.removed, [1]);
  assert.equal(result.closedCount, 1);
  assert.equal(result.failedCount, 1);
  assert.equal(result.closedTabs.length, 1);
  assert.equal(runtime.state.store['pc.stats'].totalTabsEaten, 1);
  const retry = await runtime.send({ type: 'pc:closeByKeyword', query: 'example.com' });
  assert.equal(retry.ok, false);
  assert.equal(retry.closedCount, 0);
  assert.deepEqual(retry.closedTabs, []);
  assert.equal(runtime.state.store['pc.stats'].totalTabsEaten, 1);
});

test('concurrent cleanups do not overwrite each other’s stored statistics', async () => {
  const runtime = extension({ tabs: [
    { id: 1, url: 'https://a.test/one' }, { id: 2, url: 'https://a.test/two' },
    { id: 3, url: 'https://b.test/one' },
  ] });
  await Promise.all(['a.test', 'b.test'].map(query => runtime.send({ type: 'pc:closeByKeyword', query })));
  assert.equal(runtime.state.store['pc.stats'].totalTabsEaten, 3);
});

test('concurrent settings patches preserve each control and recover after a failed write', async () => {
  const runtime = extension();
  const patches = [{ suggestMinOpenTabsPerDomain: 3 }, { inactiveThresholdMinutes: 45 }, { theme: 'dark' }];
  const replies = await Promise.all(patches.map(payload => runtime.send({ type: 'pc:updateSettings', payload })));
  assert.ok(replies.every(reply => reply.ok));
  const saved = runtime.state.store['pc.settings'];
  for (const patch of patches) for (const [key, value] of Object.entries(patch)) assert.equal(saved[key], value);
  assert.deepEqual(replies.at(-1).settings, saved);

  runtime.state.failStorageSet = true;
  assert.equal((await runtime.send({ type: 'pc:updateSettings', payload: { theme: 'light' } })).ok, false);
  runtime.state.failStorageSet = false;
  assert.equal((await runtime.send({ type: 'pc:updateSettings', payload: { inactiveThresholdMinutes: 90 } })).ok, true);
  assert.equal(runtime.state.store['pc.settings'].theme, 'dark');
  assert.equal(runtime.state.store['pc.settings'].inactiveThresholdMinutes, 90);
});

test('inactive cleanup never uses defaults after its settings read fails', async () => {
  const runtime = extension({ tabs: [{ id: 1, url: 'https://example.com/', discarded: true }] });
  runtime.state.failStorageGet = true;
  for (const type of ['pc:closeInactive', 'pc:getSuggestions', 'pc:getSettings', 'pc:getStats']) {
    assert.equal((await runtime.send({ type })).ok, false, type);
  }
  assert.deepEqual(runtime.state.removed, []);
});

test('site suggestions include pending navigation and match the tabs they close', async () => {
  const runtime = extension({ tabs: [
    { id: 1, pendingUrl: 'https://www.example.com/loading' },
    { id: 2, pendingUrl: 'https://example.com/private', incognito: true },
  ] });
  const result = await runtime.send({ type: 'pc:getSuggestions' });
  assert.equal(result.suggestions.find(item => item.domain === 'example.com').openCount, 1);
  const closed = await runtime.send({ type: 'pc:closeByDomain', query: 'example.com' });
  assert.equal(closed.closedCount, 1);
  assert.equal(closed.closedTabs[0].url, 'https://www.example.com/loading');
  assert.deepEqual(runtime.state.removed, [1]);
});

test('tab-query failures return errors to close and suggestion requests', async () => {
  const runtime = extension();
  runtime.state.failQuery = true;
  for (const message of [
    { type: 'pc:closeByKeyword', query: 'example.com' },
    { type: 'pc:closeInactive' }, { type: 'pc:getSuggestions' },
  ]) assert.equal((await runtime.send(message)).ok, false);
  assert.deepEqual(runtime.state.removed, []);
});

test('duplicate cleanup keeps pinned copies and removes their unpinned duplicates in other windows', async () => {
  const runtime = extension({ tabs: [
    { id: 1, url: 'https://example.com/page#first', windowId: 1 },
    { id: 2, url: 'https://example.com/page#second', pinned: true, windowId: 2 },
    { id: 3, url: 'https://example.com/page#private', incognito: true },
    { id: 4, url: 'https://different.example/' },
  ] });
  const result = await runtime.send({ type: 'pc:closeDuplicates' });
  assert.equal(result.closedCount, 1);
  assert.deepEqual(runtime.state.removed, [1]);
  assert.deepEqual(runtime.state.tabs.map(tab => tab.id), [2, 3, 4]);
});

test('inactive suggestions agree with cleanup and preserve active, pinned, audible and private tabs', async () => {
  const old = Date.now() - 3 * 60 * 60 * 1000;
  const runtime = extension({ tabs: [
    { id: 1, lastAccessed: old }, { id: 2, lastAccessed: old, active: true },
    { id: 3, lastAccessed: old, pinned: true }, { id: 4, lastAccessed: old, audible: true },
    { id: 5, lastAccessed: old, incognito: true }, { id: 6, discarded: true },
    { id: 7, lastAccessed: Date.now() },
  ].map(tab => ({ url: 'https://example.com/' + tab.id, ...tab })) });
  const suggestions = await runtime.send({ type: 'pc:getSuggestions' });
  assert.equal(suggestions.suggestions.find(item => item.kind === 'inactive').inactiveCount, 2);
  const result = await runtime.send({ type: 'pc:closeInactive' });
  assert.equal(result.closedCount, 2);
  assert.deepEqual(runtime.state.removed, [1, 6]);
});

test('sorting stays in the current window and leaves pinned tabs in place', async () => {
  const runtime = extension({ tabs: [
    { id: 1, url: 'https://pinned.test', pinned: true },
    { id: 2, url: 'https://a.test' }, { id: 3, url: 'https://b.test/one' },
    { id: 4, url: 'https://b.test/two' }, { id: 5, url: 'https://a.test/other', windowId: 2 },
  ] });
  assert.equal((await runtime.send({ type: 'pc:sortTabsByOpenCount' })).ok, true);
  assert.deepEqual(runtime.state.moves, [{ id: 3, index: 1 }, { id: 4, index: 2 }, { id: 2, index: 3 }]);
});

test('popup retains failed undo entries for retry without recreating successful entries', async () => {
  const runtime = extension({ tabs: [1, 2].map(id => ({ id, url: 'https://example.com/' + id })) });
  const elements = await popup(runtime);
  elements['pc-query'].value = 'example.com';
  await elements['pc-close'].click();
  runtime.state.failCreate.add('https://example.com/2');
  await elements['pc-undo-close'].click();
  assert.equal(runtime.state.created.length, 1);
  assert.equal(elements['pc-undo-close'].disabled, false);
  runtime.state.failCreate.clear();
  await elements['pc-undo-close'].click();
  assert.deepEqual(runtime.state.created.map(tab => tab.url), ['https://example.com/1', 'https://example.com/2']);
  assert.equal(elements['pc-undo-close'].disabled, true);
});

test('popup blocks another cleanup while Undo is restoring its snapshot', async () => {
  const runtime = extension({ tabs: [
    { id: 1, url: 'https://first.example/one' },
    { id: 2, url: 'https://second.example/two' },
  ] });
  const elements = await popup(runtime);
  elements['pc-query'].value = 'first.example';
  await elements['pc-close'].click();
  const nextChip = elements['pc-suggest-chips'].children.find(child => child.dataset.domain === 'second.example');
  await Promise.all([elements['pc-undo-close'].click(), nextChip.click()]);
  assert.deepEqual(runtime.state.removed, [1]);
  assert.deepEqual(runtime.state.created.map(tab => tab.url), ['https://first.example/one']);
  assert.ok(runtime.state.tabs.some(tab => tab.id === 2));
  assert.equal(elements['pc-undo-close'].disabled, true);
  assert.equal(elements['pc-close'].disabled, false);
});

test('popup refreshes a restored site when its initially blank tab finishes navigation', async () => {
  for (const firefox of [false, true]) {
    const runtime = extension({ firefox, tabs: [{ id: 1, url: 'https://example.com/restored' }] });
    const timers = popupTimers();
    const elements = await popup(runtime, { timers });
    elements['pc-query'].value = 'example.com';
    await elements['pc-close'].click();
    runtime.state.delayCreatedNavigation = true;
    await elements['pc-undo-close'].click();
    const restored = runtime.state.tabs[0];
    assert.equal(restored.url, 'about:blank');
    assert.equal(elements['pc-suggest-chips'].children.length, 0);

    restored.url = 'https://example.com/restored';
    for (const listener of runtime.api.tabs.onUpdated.listeners) await listener(restored.id, { url: restored.url, status: 'complete' }, restored);
    await timers.flushRefreshes();
    assert.equal(elements['pc-suggest-chips'].children[0].dataset.domain, 'example.com');

    const queries = runtime.state.queryCount;
    for (const listener of runtime.api.tabs.onUpdated.listeners) {
      await listener(restored.id, { title: 'Updated title' }, restored);
      await listener(99, { url: 'https://private.test/', status: 'complete' }, { id: 99, incognito: true });
    }
    await timers.flushRefreshes();
    assert.equal(runtime.state.queryCount, queries);
  }
});

test('popup keeps site suggestions current when regular tabs are created and removed', async () => {
  const runtime = extension();
  const timers = popupTimers();
  const elements = await popup(runtime, { timers });
  const created = { id: 1, url: 'https://new.example/', windowId: 1, incognito: false };
  runtime.state.tabs.push(created);
  for (const listener of runtime.api.tabs.onCreated.listeners) await listener(created);
  await timers.flushRefreshes();
  assert.equal(elements['pc-suggest-chips'].children[0].dataset.domain, 'new.example');

  runtime.state.tabs = [];
  for (const listener of runtime.api.tabs.onRemoved.listeners) await listener(created.id, { windowId: 1, isWindowClosing: false });
  await timers.flushRefreshes();
  assert.equal(elements['pc-suggest-chips'].children.length, 0);
});

test('popup handles an unavailable background with its translated error state', async () => {
  const runtime = extension({ locale: 'de' });
  runtime.state.failMessage = true;
  const elements = await popup(runtime);
  assert.equal(elements['pc-suggest-empty'].textContent, L.catalogue('de').suggestionsFailed);
  elements['pc-query'].value = 'example.com';
  await elements['pc-close'].click();
  assert.equal(elements['pc-status'].textContent, L.catalogue('de').closeFailed);
  assert.equal(elements['pc-close'].disabled, false);
});

test('popup settings persist as numeric values when a translated popup is reopened', async () => {
  const runtime = extension({ locale: 'de' });
  const elements = await popup(runtime);
  elements['min-open'].value = '3';
  await elements['min-open'].dispatch('change');
  elements['inactive-threshold'].value = '45';
  await elements['inactive-threshold'].dispatch('change');
  await elements.themes[1].click();
  const reopened = await popup(runtime);
  assert.equal(reopened['min-open'].value, 3);
  assert.equal(reopened['inactive-threshold'].value, 45);
  assert.equal(reopened.themes[1].getAttribute('aria-pressed'), 'true');
  assert.equal(runtime.state.store['pc.settings'].suggestMinOpenTabsPerDomain, 3);
  assert.equal(runtime.state.store['pc.settings'].inactiveThresholdMinutes, 45);
});

test('popup settings changes arriving together retain every saved value', async () => {
  const runtime = extension();
  const elements = await popup(runtime);
  elements['min-open'].value = '3';
  elements['inactive-threshold'].value = '45';
  await Promise.all([
    elements['min-open'].dispatch('change'),
    elements['inactive-threshold'].dispatch('change'),
    elements.themes[1].click(),
  ]);
  const reopened = await popup(runtime);
  assert.equal(reopened['min-open'].value, 3);
  assert.equal(reopened['inactive-threshold'].value, 45);
  assert.equal(reopened.themes[1].getAttribute('aria-pressed'), 'true');
});

test('popup does not apply or keep settings changes that failed to save', async () => {
  const runtime = extension({ locale: 'es' });
  runtime.state.store['pc.settings'] = { theme: 'light', suggestMinOpenTabsPerDomain: 3 };
  const elements = await popup(runtime);
  await elements['pc-settings-toggle'].click();
  runtime.state.failStorageSet = true;
  elements['min-open'].value = '6';
  await elements['min-open'].dispatch('change');
  await elements.themes[1].click();
  assert.equal(runtime.state.store['pc.settings'].suggestMinOpenTabsPerDomain, 3);
  assert.equal(runtime.state.store['pc.settings'].theme, 'light');
  assert.equal(elements['min-open'].value, 3);
  assert.equal(elements.root.getAttribute('data-theme'), 'light');
  assert.equal(elements.themes[0].getAttribute('aria-pressed'), 'true');
  assert.equal(elements['pc-status'].textContent, L.catalogue('es').closeFailed);
  assert.equal(elements['pc-settings-status'].textContent, L.catalogue('es').closeFailed);
});

test('popup site chips use exact host matching and report partial close failures', async () => {
  const runtime = extension({ tabs: [
    { id: 1, url: 'http://localhost:3000/one' }, { id: 2, url: 'http://localhost:3000/two' },
    { id: 3, url: 'https://docs.example/', title: 'localhost instructions' },
  ] });
  runtime.state.failRemove.add(2);
  const elements = await popup(runtime);
  const chip = elements['pc-suggest-chips'].children.find(child => child.dataset.domain === 'localhost');
  await chip.click();
  assert.deepEqual(runtime.state.removed, [1]);
  assert.equal(elements['pc-status'].textContent, 'Closed: 1 · Failed');
  assert.equal(elements['pc-undo-close'].disabled, false);
});

test('popup header restores compact counters without digit grouping', async () => {
  const runtime = extension({ tabs: Array.from({ length: 14 }, (_, index) => ({ id: index + 1, url: 'https://example.com/' + index })) });
  runtime.state.store['pc.stats'] = { totalTabsEaten: 2479 };
  const elements = await popup(runtime);
  assert.equal(elements['pc-open-count'].textContent, '14 open');
  assert.equal(elements['pc-count-pill'].textContent, '2479 closed');
});

test('popup grows for longer measured labels and retains the width across Settings', async () => {
  const runtime = extension({ locale: 'de' });
  const sizing = { controlsWidth: 420 };
  const elements = await popup(runtime, sizing);
  const width = elements.root.style['--popup-width'];
  assert.ok(parseFloat(width) > 380);
  assert.equal(elements.root.classList.contains('popup-width-limited'), false);
  await elements['pc-settings-toggle'].click();
  assert.equal(elements['pc-tab-settings'].classList.contains('active'), true);
  assert.equal(elements.root.style['--popup-width'], width);
  await elements['pc-settings-toggle'].click();
  assert.equal(elements.root.style['--popup-width'], width);

  sizing.controlsWidth = 500;
  runtime.state.tabs.push({ id: 1, url: 'https://example.com/' });
  for (const listener of runtime.api.tabs.onCreated.listeners) await listener({});
  assert.ok(parseFloat(elements.root.style['--popup-width']) > parseFloat(width));
  const expanded = elements.root.style['--popup-width'];
  sizing.controlsWidth = 200;
  runtime.state.tabs = [];
  for (const listener of runtime.api.tabs.onRemoved.listeners) await listener(1);
  assert.equal(elements.root.style['--popup-width'], expanded);
});

test('popup caps excessive width and enables wrapping without resizing Settings', async () => {
  for (const screenWidth of [1920, 640]) {
    const elements = await popup(extension(), { controlsWidth: 1000, screenWidth });
    const width = Math.min(800, screenWidth) + 'px';
    assert.equal(elements.root.style['--popup-width'], width);
    assert.equal(elements.root.classList.contains('popup-width-limited'), true);
    await elements['pc-settings-toggle'].click();
    assert.equal(elements.root.style['--popup-width'], width);
  }
});
