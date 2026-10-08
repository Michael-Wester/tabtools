// SPDX-License-Identifier: MPL-2.0
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../scripts/localisation');

// Run the shipped scripts with callback-based browser API fixtures. These tests
// exercise the message boundary and stored results, not an installed browser.
// `session` is the browser-session storage: pass a previous runtime's
// state.session to stand for a service worker that woke again, or false for a
// browser without it.
function extension({ tabs = [], locale = 'en', firefox = false, session = {} } = {}) {
  const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); } });
  const state = {
    tabs: tabs.map((tab, index) => ({ windowId: 1, index, active: false, pinned: false, incognito: false, ...tab })),
    store: {}, session, menus: [], menuInstalls: 0, removed: [], created: [], moves: [], errors: [],
    failRemove: new Set(), failCreate: new Set(), failMove: new Set(), missingWindows: new Set(),
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
        // The tabs behind a closed one move up, as in a browser.
        for (const windowId of new Set(state.tabs.map(tab => tab.windowId))) {
          state.tabs.filter(tab => tab.windowId === windowId).sort((a, b) => a.index - b.index).forEach((tab, position) => { tab.index = position; });
        }
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
      state.moves.push({ id, index });
      if (state.failMove.has(id)) {
        callback(cb, undefined, 'Tabs cannot be edited right now');
        return;
      }
      // Reorder the tab's window as a browser does. A moved tab joins a tab
      // group only when it lands between two tabs of that group; anywhere
      // else it ends up outside every group.
      const tab = state.tabs.find(item => item.id === id);
      const row = state.tabs.filter(item => item.windowId === tab.windowId && item !== tab).sort((a, b) => a.index - b.index);
      row.splice(index, 0, tab);
      row.forEach((item, position) => { item.index = position; });
      const groupOf = item => (item && typeof item.groupId === 'number' ? item.groupId : -1);
      const [left, right] = [groupOf(row[index - 1]), groupOf(row[index + 1])];
      if ('groupId' in tab || left !== -1 || right !== -1) tab.groupId = left !== -1 && left === right ? left : -1;
      callback(cb, structuredClone(tab));
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
  if (session) api.storage.session = {
    get(keys, cb) {
      const names = typeof keys === 'string' ? [keys] : keys;
      callback(cb, structuredClone(Object.fromEntries(names.filter(key => key in state.session).map(key => [key, state.session[key]]))));
    },
    set(values, cb) { Object.assign(state.session, structuredClone(values)); callback(cb); },
  };
  api.contextMenus = {
    onClicked: event(),
    create(properties, cb) { state.menus.push(structuredClone(properties)); state.menuInstalls += 1; callback(cb); return properties.id; },
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
  // A clock the tests can move: runtime.context.Date.advance(minutes).
  let clockOffset = 0;
  class TestDate extends Date { static now() { return Date.now() + clockOffset; } static advance(minutes) { clockOffset += minutes * 60000; } }
  const context = vm.createContext({ chrome: api, URL, Intl, Date: TestDate, setTimeout: () => 1,
    console: { error: (...args) => state.errors.push(args), warn: (...args) => state.errors.push(args) } });
  if (firefox) context.browser = api;
  const run = file => vm.runInContext(fs.readFileSync(path.join(L.root, 'src/shared', file), 'utf8'), context, { filename: file });
  const manifest = JSON.parse(fs.readFileSync(path.join(L.root, 'src/overrides', firefox ? 'firefox' : 'chrome', 'manifest.json')));
  if (firefox) manifest.background.scripts.forEach(run);
  else { context.importScripts = (...files) => files.forEach(run); run(manifest.background.service_worker); }
  // Lets the start-of-session work (menu item, active tabs) finish.
  const settle = () => new Promise(resolve => setImmediate(resolve));
  // The user switches to a tab: the browser updates `active` and tells the background.
  async function activate(tabId, { withPrevious = firefox } = {}) {
    const tab = state.tabs.find(item => item.id === tabId);
    const previous = state.tabs.find(item => item.windowId === tab.windowId && item.active);
    if (previous) previous.active = false;
    tab.active = true;
    tab.lastAccessed = context.Date.now();
    const info = { tabId, windowId: tab.windowId, ...(withPrevious && previous ? { previousTabId: previous.id } : {}) };
    await Promise.all(api.tabs.onActivated.listeners.map(listener => listener(info)));
  }
  return { state, api, context, send, settle, activate };
}

// A small stand-in for the popup document, built from the real popup.html so
// ids and data attributes cannot drift from the markup.
async function popup(runtime, options = {}) {
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.children = [];
      this.value = ''; this.disabled = false; this.hidden = false; this.text = '';
      this.scrollHeight = 0; this.clientHeight = 0;
      const classes = new Set();
      this.classList = { contains: key => classes.has(key), add: key => classes.add(key), remove: key => classes.delete(key), toggle: (key, enabled) => enabled ? classes.add(key) : classes.delete(key) };
      const props = {};
      this.style = { setProperty(key, value) { props[key] = value; }, removeProperty(key) { delete props[key]; }, getPropertyValue: key => props[key] ?? '' };
    }
    get textContent() { return this.text + this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); }
    set textContent(value) { this.text = String(value ?? ''); this.children = []; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    replaceWith() {}
    focus() { document.activeElement = this; }
    async dispatch(name, event = {}) { for (const fn of this.listeners[name] || []) await fn(event); }
    async click() { if (!this.disabled) await this.dispatch('click'); }
    async type(text) { this.value = text; await this.dispatch('input'); }
    async enter() { await this.dispatch('keydown', { key: 'Enter', preventDefault() {} }); }
  }
  const html = fs.readFileSync(path.join(L.root, 'src/shared/popup/popup.html'), 'utf8')
    .replace(/<!--[\s\S]*?-->|<style>[\s\S]*?<\/style>/g, '');
  const elements = {};
  const marked = [];
  for (const [, tag, attributes] of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/g)) {
    const element = new Element(tag);
    for (const [, name, value = ''] of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
      if (name === 'hidden') element.hidden = true;
      else if (name === 'id') elements[value] = element;
      else if (name.startsWith('data-')) element.dataset[name.slice(5).replace(/-(\w)/g, (_, letter) => letter.toUpperCase())] = value;
      else element.attributes[name] = value;
    }
    marked.push(element);
  }
  let ready;
  const document = { documentElement: new Element('html'), body: new Element('body'), activeElement: null,
    getElementById: id => elements[id] || null,
    // popup.js only asks for elements carrying one data attribute, e.g. [data-theme-value].
    querySelectorAll: selector => { const key = selector.slice(6, -1).replace(/-(\w)/g, (_, letter) => letter.toUpperCase()); return marked.filter(element => key in element.dataset); },
    createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag),
    addEventListener(name, fn) { if (name === 'DOMContentLoaded') ready = fn; } };
  elements.root = document.documentElement;
  elements.document = document;
  elements.themes = Object.fromEntries(document.querySelectorAll('[data-theme-value]').map(el => [el.dataset.themeValue, el]));
  elements.accents = Object.fromEntries(document.querySelectorAll('[data-accent-value]').map(el => [el.dataset.accentValue, el]));
  const steps = document.querySelectorAll('[data-threshold-step]');
  elements.less = steps.find(el => el.dataset.thresholdStep === '-1');
  elements.more = steps.find(el => el.dataset.thresholdStep === '1');
  elements.threshold = document.querySelectorAll('[data-threshold-value]')[0];
  const context = vm.createContext({ chrome: runtime.api, document, Intl, URL,
    setTimeout: options.timers?.setTimeout || (() => 1), clearTimeout: options.timers?.clearTimeout || (() => {}), console: runtime.context.console,
    ...(options.dark === undefined ? {} : { matchMedia: () => ({ matches: options.dark, addEventListener() {} }) }) });
  for (const file of ['i18n-fallback.js', 'i18n.js', 'popup/popup.js']) vm.runInContext(fs.readFileSync(path.join(L.root, 'src/shared', file), 'utf8'), context, { filename: file });
  await ready();
  return elements;
}

const sitesIn = elements => elements['pc-sites'].children.map(row => row.dataset.domain);
const siteRow = (elements, domain) => elements['pc-sites'].children.find(row => row.dataset.domain === domain);
const lastOf = row => row.children[row.children.length - 1];

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
    await runtime.settle();
    const entry = runtime.state.menus.find(menu => menu.id === 'tabTools-close-site-tabs-page');
    assert.equal(entry.title, L.catalogue(locale.locale).contextClose, locale.locale);
    assert.equal(entry.contexts.includes('tab'), firefox, 'the tab-strip menu is offered where the browser has it');
    assert.equal(runtime.api.contextMenus.onClicked.listeners.length, 1);
    assert.equal(typeof runtime.context.pcStatsEat, 'function');
  }
});

test('a Chrome worker creates the menu item once per browser session, not on every wake', async () => {
  const first = extension();
  await first.settle();
  assert.equal(first.state.menuInstalls, 1);
  // The worker stops and a later event wakes it: same session storage, fresh script.
  const woken = extension({ session: first.state.session });
  await woken.settle();
  assert.equal(woken.state.menuInstalls, 0);
  assert.equal(woken.api.contextMenus.onClicked.listeners.length, 1, 'a click must still reach the new worker');
  // Install and browser-start events arriving during a wake do not repeat the work.
  for (const listener of [...woken.api.runtime.onInstalled.listeners, ...woken.api.runtime.onStartup.listeners]) await listener();
  await woken.settle();
  assert.equal(woken.state.menuInstalls, 0);
  // A new browser session starts with empty session storage.
  const restarted = extension();
  await restarted.settle();
  assert.equal(restarted.state.menuInstalls, 1);
  // Without session storage nothing can remember, so the item is created on each wake as before.
  const old = extension({ session: false });
  await old.settle();
  assert.equal(old.state.menuInstalls, 1);
});

test('the background listens for tab switches only, and never for other tab events', async () => {
  for (const firefox of [false, true]) {
    const runtime = extension({ firefox });
    await runtime.settle();
    assert.equal(runtime.api.tabs.onActivated.listeners.length, 1);
    for (const name of ['onCreated', 'onRemoved', 'onUpdated', 'onReplaced']) {
      assert.equal(runtime.api.tabs[name].listeners.length, 0, name);
    }
    assert.equal(runtime.api.storage.onChanged.listeners.length, 0);
  }
});

test('the right-click action in a private tab closes nothing', async () => {
  const runtime = extension({ tabs: [
    { id: 1, url: 'https://example.com/normal' },
    { id: 2, url: 'https://example.com/private', incognito: true },
  ] });
  const [click] = runtime.api.contextMenus.onClicked.listeners;
  await click({ menuItemId: 'tabTools-close-site-tabs-page', pageUrl: 'https://example.com/private' }, runtime.state.tabs[1]);
  await runtime.context.handleContextMenuClick({ pageUrl: 'https://example.com/private' }, runtime.state.tabs[1]);
  assert.deepEqual(runtime.state.removed, []);
  await runtime.context.handleContextMenuClick({ pageUrl: 'https://example.com/normal' }, runtime.state.tabs[0]);
  assert.deepEqual(runtime.state.removed, [1]);
});

test('the right-click handler acts only on its own menu item and on the tab that was clicked', async () => {
  const runtime = extension({ tabs: [
    { id: 1, url: 'https://page.test/article' }, { id: 2, url: 'https://link.test/target' },
  ] });
  const [click] = runtime.api.contextMenus.onClicked.listeners;
  await click({ menuItemId: 'some-other-item', pageUrl: 'https://page.test/article' }, runtime.state.tabs[0]);
  await runtime.settle();
  assert.deepEqual(runtime.state.removed, []);
  // Right-clicking a link acts on the page the link is on, not on the link's site.
  await click({ menuItemId: 'tabTools-close-site-tabs-page', pageUrl: 'https://page.test/article', linkUrl: 'https://link.test/target' }, runtime.state.tabs[0]);
  await runtime.settle();
  assert.deepEqual(runtime.state.removed, [1]);
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
  const patches = [{ keepPinnedTabs: false }, { inactiveThresholdMinutes: 45 }, { theme: 'dark' }];
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
    { id: 1, url: 'https://example.com/page', windowId: 1 },
    { id: 2, url: 'https://example.com/page', pinned: true, windowId: 2 },
    { id: 3, url: 'https://example.com/page', incognito: true },
    { id: 4, url: 'https://different.example/' },
  ] });
  const result = await runtime.send({ type: 'pc:closeDuplicates' });
  assert.equal(result.closedCount, 1);
  assert.deepEqual(runtime.state.removed, [1]);
  assert.deepEqual(runtime.state.tabs.map(tab => tab.id), [2, 3, 4]);
});

test('duplicate cleanup never closes a pinned copy, however many there are', async () => {
  for (const pinnedCount of [1, 2]) {
    const pinned = Array.from({ length: pinnedCount }, (_, i) => ({ id: i + 3, url: 'https://example.com/page', pinned: true, windowId: 2 }));
    const runtime = extension({ tabs: [
      { id: 1, url: 'https://example.com/page', windowId: 1 },
      { id: 2, url: 'https://example.com/page', windowId: 1 },
      ...pinned
    ] });
    const result = await runtime.send({ type: 'pc:closeDuplicates' });
    assert.equal(result.closedCount, 2);
    assert.deepEqual(runtime.state.removed, [1, 2]);
    assert.deepEqual(runtime.state.tabs.map(tab => tab.id), pinned.map(tab => tab.id));
  }
});

test('pages that differ only after # are not duplicates', async () => {
  const runtime = extension({ tabs: [
    { id: 1, url: 'https://mail.google.com/mail/u/0/#inbox' },
    { id: 2, url: 'https://mail.google.com/mail/u/0/#inbox/FMfcgzQXKabc', title: 'Conversation A' },
    { id: 3, url: 'https://mail.google.com/mail/u/0/#sent/FMfcgzQXKdef', title: 'Conversation B', active: true },
    { id: 4, url: 'https://app.example/#/projects/1' },
    { id: 5, url: 'https://app.example/#/projects/2/settings' },
    { id: 6, url: 'https://docs.example/guide#intro' },
    { id: 7, url: 'https://docs.example/guide#steps' },
  ] });
  assert.equal((await runtime.send({ type: 'pc:getSuggestions' })).overview.duplicates, 0);
  const result = await runtime.send({ type: 'pc:closeDuplicates' });
  assert.equal(result.closedCount, 0);
  assert.deepEqual(runtime.state.removed, []);
});

test('duplicate matching ignores letter case in scheme and host, an empty #, and text-highlight links only', async () => {
  const runtime = extension({ tabs: [
    { id: 1, url: 'HTTPS://EXAMPLE.COM/Guide?a=1&b=2' },
    { id: 2, url: 'https://example.com/Guide?a=1&b=2' },                       // same page: closed
    { id: 3, url: 'https://example.com/Guide?a=1&b=2#' },                      // same page: closed
    { id: 4, url: 'https://example.com/Guide?a=1&b=2#:~:text=second%20step' }, // same page: closed
    { id: 5, url: 'https://example.com/guide?a=1&b=2' },                       // path case differs
    { id: 6, url: 'https://example.com/Guide?A=1&b=2' },                       // query case differs
    { id: 7, url: 'https://example.com/Guide?b=2&a=1' },                       // query order differs
    { id: 8, url: 'https://example.com/Guide?a=1&b=2#steps' },                 // a different place
    { id: 9, url: 'https://example.com/Guide?a=1&b=2#steps:~:text=second' },   // the same place as 8: closed
  ] });
  const result = await runtime.send({ type: 'pc:closeDuplicates' });
  assert.deepEqual(runtime.state.removed, [2, 3, 4, 9]);
  assert.equal(result.closedCount, 4);
  assert.deepEqual(runtime.state.tabs.map(tab => tab.id), [1, 5, 6, 7, 8]);
});

test('duplicate cleanup keeps the copy in view and a copy playing sound, and otherwise the first', async () => {
  const page = 'https://video.example/watch?v=1';
  const cases = [
    // [tabs, ids closed]
    [[{ id: 1 }, { id: 2 }, { id: 3 }], [2, 3]],                                   // nothing special: first stays
    [[{ id: 1 }, { id: 2, active: true }, { id: 3 }], [1, 3]],                     // the tab in view stays
    [[{ id: 1 }, { id: 2, audible: true }, { id: 3 }], [1, 3]],                    // the tab playing sound stays
    [[{ id: 1, windowId: 2, discarded: true }, { id: 2, active: true, audible: true }], [1]],
    [[{ id: 1, active: true }, { id: 2, active: true, windowId: 2 }, { id: 3 }], [3]],   // in view in two windows: both stay
    [[{ id: 1, pinned: true }, { id: 2, active: true }, { id: 3 }], [3]],          // pinned and in view both stay
    [[{ id: 1, incognito: true }, { id: 2 }], []],                                 // a private copy is not a copy
  ];
  for (const [tabs, closed] of cases) {
    const runtime = extension({ tabs: [...tabs.map(tab => ({ url: page, ...tab })), { id: 9, url: 'https://other.example/' }] });
    assert.equal((await runtime.send({ type: 'pc:getSuggestions' })).overview.duplicates, closed.length, JSON.stringify(tabs));
    await runtime.send({ type: 'pc:closeDuplicates' });
    assert.deepEqual(runtime.state.removed, closed, JSON.stringify(tabs));
  }
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

const windowOrder = (runtime, windowId = 1) => runtime.state.tabs.filter(tab => tab.windowId === windowId)
  .sort((a, b) => a.index - b.index).map(tab => tab.id);

test('sorting stays in the current window, leaves pinned tabs in place and moves only what is out of place', async () => {
  const runtime = extension({ tabs: [
    { id: 1, url: 'https://pinned.test', pinned: true },
    { id: 2, url: 'https://a.test' }, { id: 3, url: 'https://b.test/one' },
    { id: 4, url: 'https://b.test/two' }, { id: 5, url: 'https://a.test/other', windowId: 2 },
  ] });
  const first = await runtime.send({ type: 'pc:sortTabsByOpenCount' });
  assert.equal(first.ok, true);
  assert.equal(first.sortedCount, 3);
  assert.deepEqual(runtime.state.moves, [{ id: 3, index: 1 }, { id: 4, index: 2 }]);
  assert.deepEqual(windowOrder(runtime), [1, 3, 4, 2]);
  assert.deepEqual(windowOrder(runtime, 2), [5]);
  // Sorting a sorted window moves nothing and says so.
  const again = await runtime.send({ type: 'pc:sortTabsByOpenCount' });
  assert.equal(again.sortedCount, 0);
  assert.equal(runtime.state.moves.length, 2);
});

test('sorting orders sites by tab count, then by name, with pinned tabs counting towards their site', async () => {
  const runtime = extension({ tabs: [
    { id: 1, url: 'https://zeta.test/pinned', pinned: true },
    { id: 2, url: 'about:blank' },
    { id: 3, url: 'https://beta.test/1' },
    { id: 4, url: 'https://zeta.test/1' },
    { id: 5, url: 'https://alpha.test/1' },
    { id: 6, url: 'https://beta.test/2' },
    { id: 7, url: 'https://alpha.test/2' },
  ] });
  const result = await runtime.send({ type: 'pc:sortTabsByOpenCount' });
  // alpha and beta have two tabs each and zeta has two with its pinned tab, so the
  // three tie on count and sort by name; the tab without a site goes last.
  assert.deepEqual(windowOrder(runtime), [1, 5, 7, 3, 6, 4, 2]);
  assert.equal(result.sortedCount, 6);
});

test('sorting leaves every tab group where it is and with the same tabs', async () => {
  const layouts = [
    // one group in the middle
    [['a', -1], ['x', 7], ['y', 7], ['b', -1], ['a', -1], ['b', -1], ['b', -1]],
    // groups at both ends and two side by side
    [['x', 1], ['y', 1], ['c', -1], ['a', -1], ['x', 2], ['z', 2], ['y', 3], ['a', -1], ['c', -1], ['a', -1], ['q', 4], ['r', 4]],
    // loose tabs alternating with single-tab groups
    [['b', -1], ['x', 1], ['a', -1], ['y', 2], ['a', -1], ['z', 3], ['b', -1], ['a', -1]],
    // a pinned tab, then a group right behind it
    [['p', -1, true], ['x', 5], ['y', 5], ['b', -1], ['a', -1], ['a', -1]],
  ];
  for (const layout of layouts) {
    const tabs = layout.map(([site, groupId, pinned], i) => ({ id: i + 1, url: `https://${site}.test/${i}`, groupId, pinned: !!pinned }));
    const runtime = extension({ tabs });
    const before = runtime.state.tabs.map(tab => ({ id: tab.id, index: tab.index, groupId: tab.groupId }));
    const result = await runtime.send({ type: 'pc:sortTabsByOpenCount' });
    assert.equal(result.ok, true);
    const after = new Map(runtime.state.tabs.map(tab => [tab.id, tab]));
    const loose = [];
    for (const tab of before) {
      const now = after.get(tab.id);
      assert.equal(now.groupId, tab.groupId, `tab ${tab.id} changed group in ${JSON.stringify(layout)}`);
      if (tab.groupId !== -1 || tabs[tab.id - 1].pinned) assert.equal(now.index, tab.index, `grouped or pinned tab ${tab.id} moved`);
      else loose.push(now);
    }
    // The loose tabs hold the same positions as before, now in site order.
    assert.deepEqual(loose.map(tab => tab.index).sort((a, b) => a - b), before.filter(tab => tab.groupId === -1 && !tabs[tab.id - 1].pinned).map(tab => tab.index));
    const sites = loose.sort((a, b) => a.index - b.index).map(tab => new URL(tab.url).hostname);
    const counts = Object.fromEntries([...new Set(tabs.map(tab => new URL(tab.url).hostname))].map(host => [host, tabs.filter(tab => new URL(tab.url).hostname === host).length]));
    const expected = [...sites].sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
    assert.deepEqual(sites, expected, JSON.stringify(layout));
    assert.equal(result.sortedCount, before.filter(tab => after.get(tab.id).index !== tab.index).length);
    // A second click finds nothing to do.
    const moves = runtime.state.moves.length;
    assert.equal((await runtime.send({ type: 'pc:sortTabsByOpenCount' })).sortedCount, 0);
    assert.equal(runtime.state.moves.length, moves);
  }
});

test('sorting stops at the first tab the browser will not move and reports the failure', async () => {
  const runtime = extension({ tabs: [
    { id: 1, url: 'https://c.test/' }, { id: 2, url: 'https://b.test/1' }, { id: 3, url: 'https://b.test/2' },
    { id: 4, url: 'https://a.test/1' }, { id: 5, url: 'https://a.test/2' }, { id: 6, url: 'https://a.test/3' },
  ] });
  runtime.state.failMove.add(5);
  const result = await runtime.send({ type: 'pc:sortTabsByOpenCount' });
  assert.equal(result.ok, false);
  assert.deepEqual(runtime.state.moves.map(move => move.id), [4, 5], 'no move is attempted after the failed one');
});

test('a typed domain also closes its subdomains; site rows and the context menu stay exact', async () => {
  const tabs = [
    { id: 1, url: 'https://google.com/' }, { id: 2, url: 'https://docs.google.com/a' },
    { id: 3, url: 'https://www.google.com/b' }, { id: 4, url: 'https://notgoogle.com/' },
    { id: 5, url: 'https://example.org/?next=google.com', title: 'google.com in a title' },
  ];
  let runtime = extension({ tabs });
  assert.deepEqual((await runtime.send({ type: 'pc:previewKeyword', query: 'google.com' })).tabs.map(tab => tab.id), [1, 2, 3]);
  await runtime.send({ type: 'pc:closeByKeyword', query: 'Google.com' });
  assert.deepEqual(runtime.state.removed, [1, 2, 3]);
  runtime = extension({ tabs });
  await runtime.send({ type: 'pc:closeByDomain', query: 'google.com' });
  assert.deepEqual(runtime.state.removed, [1, 3]);
  runtime = extension({ tabs });
  await runtime.context.handleContextMenuClick({}, runtime.state.tabs[0]);
  assert.deepEqual(runtime.state.removed, [1, 3]);
  assert.deepEqual((await runtime.send({ type: 'pc:previewKeyword', query: '.' })).tabs, []);
});

test('pinned tabs stay open for keyword, site and context-menu closes unless the setting is off', async () => {
  const tabs = [{ id: 1, url: 'https://example.com/a', pinned: true }, { id: 2, url: 'https://example.com/b' }, { id: 3, url: 'https://example.com/c' }];
  for (const close of [
    runtime => runtime.send({ type: 'pc:closeByKeyword', query: 'example' }),
    runtime => runtime.send({ type: 'pc:closeByDomain', query: 'example.com' }),
    runtime => runtime.context.handleContextMenuClick({}, runtime.state.tabs[1]),
  ]) {
    let runtime = extension({ tabs });
    await close(runtime);
    assert.deepEqual(runtime.state.removed, [2, 3]);
    runtime = extension({ tabs });
    await runtime.send({ type: 'pc:updateSettings', payload: { keepPinnedTabs: false } });
    await close(runtime);
    assert.deepEqual(runtime.state.removed, [1, 2, 3]);
  }
  const runtime = extension({ tabs });
  runtime.state.failStorageGet = true;
  assert.equal((await runtime.send({ type: 'pc:closeByKeyword', query: 'example' })).ok, false);
  assert.equal((await runtime.send({ type: 'pc:previewKeyword', query: 'example' })).ok, false);
  assert.deepEqual(runtime.state.removed, []);
});

test('a close given tab ids removes only tabs that were listed and still match', async () => {
  const old = Date.now() - 3 * 60 * 60 * 1000;
  const runtime = extension({ tabs: [
    { id: 1, url: 'https://example.com/a', lastAccessed: old }, { id: 2, url: 'https://example.com/b', lastAccessed: old },
    { id: 3, url: 'https://other.test/', lastAccessed: old }, { id: 4, url: 'https://example.com/busy', lastAccessed: old, audible: true },
  ] });
  const listed = (await runtime.send({ type: 'pc:previewKeyword', query: 'example.com' })).tabs.map(tab => tab.id);
  assert.deepEqual(listed, [1, 2, 4]);
  // Tab 2 leaves the site and tab 9 arrives after the popup listed its matches.
  runtime.state.tabs.find(tab => tab.id === 2).url = 'https://elsewhere.test/';
  runtime.state.tabs.push({ id: 9, url: 'https://example.com/new', windowId: 1, index: 9, incognito: false, pinned: false });
  const closed = await runtime.send({ type: 'pc:closeByKeyword', query: 'example.com', tabIds: [...listed, 3] });
  assert.deepEqual(runtime.state.removed, [1, 4]);
  assert.equal(closed.closedCount, 2);
  // The same rule for the inactive review: listed, and still inactive.
  runtime.state.tabs.find(tab => tab.id === 3).active = true;
  const inactive = await runtime.send({ type: 'pc:closeInactive', tabIds: [2, 3, 9] });
  assert.deepEqual(runtime.state.removed, [1, 4, 2]);
  assert.equal(inactive.closedCount, 1);
});

test('inactive preview lists the longest-unused tabs first and matches cleanup', async () => {
  const hours = count => Date.now() - count * 60 * 60 * 1000;
  const runtime = extension({ tabs: [
    { id: 1, lastAccessed: hours(3), title: 'Three' }, { id: 2, lastAccessed: hours(30), title: 'Thirty' },
    { id: 3, discarded: true, title: 'Discarded' }, { id: 4, lastAccessed: hours(1), title: 'Recent' },
    { id: 5, lastAccessed: hours(9), pinned: true }, { id: 6, lastAccessed: hours(9), active: true },
  ].map(tab => ({ url: 'https://example.com/' + tab.id, ...tab })) });
  const preview = await runtime.send({ type: 'pc:previewInactive' });
  assert.deepEqual(preview.tabs.map(tab => [tab.id, tab.title, tab.idleMinutes, tab.domain]),
    [[2, 'Thirty', 1800, 'example.com'], [1, 'Three', 180, 'example.com'], [3, 'Discarded', null, 'example.com']]);
  const result = await runtime.send({ type: 'pc:closeInactive' });
  assert.deepEqual(runtime.state.removed.sort(), [1, 2, 3]);
  assert.equal(result.closedCount, 3);
});

const hoursAgo = count => Date.now() - count * 60 * 60 * 1000;
const inactiveIds = async runtime => (await runtime.send({ type: 'pc:previewInactive' })).tabs.map(tab => tab.id);

test('a tab counts as inactive from when it was left, not from when it was opened', async () => {
  for (const firefox of [false, true]) {
    const runtime = extension({ firefox, tabs: [
      { id: 1, url: 'https://doc.test/draft', title: 'Draft', active: true, lastAccessed: hoursAgo(5) },   // opened five hours ago, in use since
      { id: 2, url: 'https://look.test/up', lastAccessed: hoursAgo(4) },
      { id: 3, url: 'https://old.test/', lastAccessed: hoursAgo(6) },
    ] });
    await runtime.settle();
    await runtime.activate(2);                 // the user looks something up
    // Listing a keyword's matches looks at a few tabs only; it must not forget the others.
    const matched = await runtime.send({ type: 'pc:previewKeyword', query: 'old.test' });
    assert.deepEqual(matched.tabs.map(tab => [tab.id, tab.idleMinutes]), [[3, 360]]);
    await runtime.settle();
    assert.deepEqual(await inactiveIds(runtime), [3], 'the draft was in use a moment ago');
    assert.equal((await runtime.send({ type: 'pc:getSuggestions' })).overview.inactive, 1);
    runtime.context.Date.advance(30);
    await runtime.activate(1);                 // back to the draft
    runtime.context.Date.advance(125);
    // Tab 2 was opened four hours ago, used for half an hour and left 125 minutes ago.
    const preview = await runtime.send({ type: 'pc:previewInactive' });
    assert.deepEqual(preview.tabs.map(tab => [tab.id, tab.idleMinutes]), [[3, 6 * 60 + 155], [2, 125]]);
    const result = await runtime.send({ type: 'pc:closeInactive' });
    assert.deepEqual(runtime.state.removed.sort(), [2, 3]);
    assert.equal(result.closedCount, 2);
    // Records of closed tabs are dropped the next time the tabs are looked at.
    assert.deepEqual(Object.keys(runtime.state.session['pc.left'].at).sort(), ['1', '2']);
    await inactiveIds(runtime);
    await runtime.settle();
    assert.deepEqual(Object.keys(runtime.state.session['pc.left'].at), ['1']);
  }
});

test('the record of when tabs were left survives a service worker restart', async () => {
  const tabs = [
    { id: 1, url: 'https://doc.test/draft', active: true, lastAccessed: hoursAgo(5) },
    { id: 2, url: 'https://look.test/up', lastAccessed: hoursAgo(4) },
  ];
  const first = extension({ tabs });
  await first.settle();
  await first.activate(2);
  const woken = extension({ session: first.state.session, tabs: tabs.map(tab => ({ ...tab, active: tab.id === 2 })) });
  await woken.settle();
  assert.deepEqual(await inactiveIds(woken), [], 'the draft was left a moment ago');
  woken.context.Date.advance(121);
  assert.deepEqual(await inactiveIds(woken), [1]);
  // The worker also still knows which tab is active, so the next switch is recorded.
  await woken.activate(1);
  woken.context.Date.advance(121);
  assert.deepEqual(await inactiveIds(woken), [2]);
});

test('without session storage a worker falls back to the browser’s own time and a background page keeps its record', async () => {
  const tabs = () => [
    { id: 1, url: 'https://doc.test/draft', active: true, lastAccessed: hoursAgo(5) },
    { id: 2, url: 'https://look.test/up', lastAccessed: hoursAgo(1) },
  ];
  const worker = extension({ session: false, tabs: tabs() });
  await worker.settle();
  await worker.activate(2);
  assert.deepEqual(await inactiveIds(worker), [1], 'as in 4.0.4: nothing remembers the switch');
  const page = extension({ firefox: true, session: false, tabs: tabs() });
  await page.settle();
  await page.activate(2);
  assert.deepEqual(await inactiveIds(page), []);
});

test('an inactivity time shorter than the popup offers is raised to 30 minutes', async () => {
  const runtime = extension({ tabs: [
    { id: 1, url: 'https://a.test/', lastAccessed: Date.now() - 10 * 60000 },
    { id: 2, url: 'https://b.test/', lastAccessed: Date.now() - 40 * 60000 },
    { id: 3, url: 'https://c.test/', active: true },
  ] });
  // 4.0.4 stored 1 when its field was emptied.
  for (const saved of [1, -30, 0.2, 29]) {
    runtime.state.store['pc.settings'] = { inactiveThresholdMinutes: saved };
    assert.equal((await runtime.send({ type: 'pc:getSettings' })).settings.inactiveThresholdMinutes, 30, String(saved));
    assert.deepEqual(await inactiveIds(runtime), [2], String(saved));
  }
  // Nothing usable saved: the default of two hours.
  for (const saved of [0, 'soon', null]) {
    runtime.state.store['pc.settings'] = { inactiveThresholdMinutes: saved };
    assert.equal((await runtime.send({ type: 'pc:getSettings' })).settings.inactiveThresholdMinutes, 120, String(saved));
  }
  runtime.state.store['pc.settings'] = {};
  const elements = await popup(runtime);
  runtime.state.store['pc.settings'] = { inactiveThresholdMinutes: 1 };
  const reopened = await popup(runtime);
  assert.equal(reopened.threshold.textContent, '30 minutes');
  assert.equal(reopened['pc-inactive-hint'].textContent, '30 min+');
  assert.equal(reopened.less.disabled, true);
  assert.equal(elements.threshold.textContent, '2 hours');
});

test('settings saved by this version carry no unused values and leave older ones alone', async () => {
  const runtime = extension();
  const fresh = (await runtime.send({ type: 'pc:updateSettings', payload: { theme: 'dark' } })).settings;
  assert.deepEqual(Object.keys(fresh).sort(), ['accent', 'enableInactiveSuggestion', 'inactiveThresholdMinutes', 'keepPinnedTabs', 'theme']);
  runtime.state.store['pc.settings'] = { suggestMinOpenTabsPerDomain: 3, maxHistory: 200, theme: 'light', inactiveThresholdMinutes: 45 };
  const upgraded = (await runtime.send({ type: 'pc:updateSettings', payload: { keepPinnedTabs: false } })).settings;
  assert.equal(upgraded.suggestMinOpenTabsPerDomain, 3);
  assert.equal(upgraded.theme, 'light');
  assert.equal(upgraded.inactiveThresholdMinutes, 45);
  assert.equal(upgraded.keepPinnedTabs, false);
});

test('suggestions list every site, count only tabs a click would close, and report an overview', async () => {
  const sites = Array.from({ length: 40 }, (_, index) => ({ id: index + 10, url: `https://site${index}.test/` }));
  const runtime = extension({ tabs: [
    { id: 1, url: 'https://example.com/a', pinned: true }, { id: 2, url: 'https://example.com/a' },
    { id: 3, url: 'https://example.com/b' }, { id: 4, url: 'https://pinned-only.test/', pinned: true },
    { id: 5, url: 'https://example.com/private', incognito: true }, { id: 6, url: 'about:blank' }, ...sites,
  ] });
  await runtime.send({ type: 'pc:updateSettings', payload: { suggestMinOpenTabsPerDomain: 5 } });
  let result = await runtime.send({ type: 'pc:getSuggestions' });
  const domains = result.suggestions.filter(item => item.kind === 'domain');
  assert.equal(domains.length, 41);
  assert.deepEqual(domains[0], { kind: 'domain', domain: 'example.com', openCount: 2, favIconUrl: null });
  assert.equal(domains.some(item => item.domain === 'pinned-only.test'), false);
  assert.deepEqual(result.overview, { openTabs: 45, sites: 42, inactive: 0, duplicates: 1 });
  await runtime.send({ type: 'pc:updateSettings', payload: { keepPinnedTabs: false } });
  result = await runtime.send({ type: 'pc:getSuggestions' });
  assert.equal(result.suggestions.find(item => item.domain === 'example.com').openCount, 3);
  assert.equal(result.suggestions.find(item => item.domain === 'pinned-only.test').openCount, 1);
});

test('popup lists keyword matches as you type and closes exactly the listed tabs', async () => {
  const runtime = extension({ tabs: [
    { id: 1, url: 'https://example.com/one', title: 'One' }, { id: 2, url: 'https://docs.example.com/two', title: 'Two' },
    { id: 3, url: 'https://other.test/path', title: 'An example in a title' }, { id: 4, url: 'https://other.test/example', title: 'Plain' },
  ] });
  const elements = await popup(runtime);
  assert.equal(elements['pc-close'].hidden, true);
  await elements['pc-query'].type('example');
  assert.equal(elements['pc-suggest-list'].hidden, true);
  assert.equal(elements['pc-match-list'].hidden, false);
  assert.equal(elements['pc-match-count'].textContent, '4 open tabs');
  assert.equal(elements['pc-close'].hidden, false);
  assert.equal(elements['pc-close-count'].textContent, '4');
  // Each row shows why it matched: in the title, in the site, or further along the address.
  const lines = elements['pc-match-rows'].children.map(row => row.children[1].children.map(line => line.textContent));
  assert.deepEqual(lines, [['One', 'example.com'], ['Two', 'docs.example.com'], ['An example in a title', 'other.test'], ['Plain', 'other.test/example']]);
  assert.equal(elements['pc-match-rows'].children[0].children[1].children[1].children[1].tagName, 'mark');

  await elements['pc-query'].type('example.com');
  assert.deepEqual(elements['pc-match-rows'].children.map(row => row.dataset.tabId), ['1', '2']);
  // A tab that opens after the list was shown is not closed by Enter.
  runtime.state.tabs.push({ id: 9, url: 'https://example.com/late', windowId: 1, index: 9, incognito: false, pinned: false });
  await elements['pc-query'].enter();
  assert.deepEqual(runtime.state.removed, [1, 2]);
  assert.equal(elements['pc-status'].textContent, 'Closed: 2');
  assert.equal(elements['pc-undo-close'].hidden, false);
  assert.equal(elements['pc-query'].value, '');
  assert.equal(elements['pc-close'].hidden, true);
  assert.equal(elements['pc-suggest-list'].hidden, false);
  assert.equal(elements['pc-match-list'].hidden, true);

  await elements['pc-query'].type('zzz');
  assert.equal(elements['pc-match-empty'].hidden, false);
  assert.equal(elements['pc-close'].hidden, true);
  assert.equal(elements['pc-undo-close'].hidden, true, 'typing ends the result bar and its Undo');
  await elements['pc-query'].enter();
  assert.deepEqual(runtime.state.removed, [1, 2]);
  await elements['pc-query'].type('   ');
  assert.equal(elements['pc-suggest-list'].hidden, false);
  assert.equal(elements['pc-query-clear'].hidden, false);
  await elements['pc-query-clear'].click();
  assert.equal(elements['pc-query'].value, '');
  assert.equal(elements['pc-query-clear'].hidden, true);
});

test('popup Enter waits for the list of the text just typed', async () => {
  const runtime = extension({ tabs: [{ id: 1, url: 'https://example.com/one' }, { id: 2, url: 'https://other.test/' }] });
  const elements = await popup(runtime);
  elements['pc-query'].value = 'example.com';
  const typing = elements['pc-query'].dispatch('input');
  const entering = elements['pc-query'].enter();
  await Promise.all([typing, entering]);
  assert.deepEqual(runtime.state.removed, [1]);
  assert.equal(elements['pc-status'].textContent, 'Closed: 1');
});

test('popup closes one listed tab from its row and keeps the list', async () => {
  const runtime = extension({ tabs: [1, 2, 3].map(id => ({ id, url: 'https://example.com/' + id, title: 'Page ' + id })) });
  const elements = await popup(runtime);
  await elements['pc-query'].type('page');
  await lastOf(elements['pc-match-rows'].children[1]).click();
  assert.deepEqual(runtime.state.removed, [2]);
  assert.deepEqual(elements['pc-match-rows'].children.map(row => row.dataset.tabId), ['1', '3']);
  assert.equal(elements['pc-close-count'].textContent, '2');
  assert.equal(elements['pc-match-list'].hidden, false);
  assert.equal(elements['pc-status'].textContent, 'Closed: 1');
  assert.equal(elements['pc-undo-close'].hidden, false);
});

test('Undo reopens tabs in their window and place, pinned as before, and brings back the tab that was in view', async () => {
  const fixture = () => extension({ tabs: [
    { id: 1, url: 'https://keep.test/', windowId: 1, index: 0 },
    { id: 2, url: 'https://site.test/a', windowId: 1, index: 1, active: true },
    { id: 3, url: 'https://other.test/', windowId: 1, index: 2 },
    { id: 4, url: 'https://site.test/b', windowId: 1, index: 3 },
    { id: 5, url: 'https://site.test/c', windowId: 2, index: 0, pinned: true },
    { id: 6, url: 'https://keep.test/2', windowId: 2, index: 1, active: true },
  ] });
  const runtime = fixture();
  runtime.state.store['pc.settings'] = { keepPinnedTabs: false };
  const closed = await runtime.send({ type: 'pc:closeByDomain', query: 'site.test' });
  assert.deepEqual(closed.closedTabs, [
    { url: 'https://site.test/a', windowId: 1, index: 1, active: true, pinned: false },
    { url: 'https://site.test/b', windowId: 1, index: 3, active: false, pinned: false },
    { url: 'https://site.test/c', windowId: 2, index: 0, active: false, pinned: true },
  ]);
  // Given out of order, as a snapshot kept by the popup may be.
  const restored = await runtime.send({ type: 'pc:restoreTabs', tabs: [...closed.closedTabs].reverse() });
  assert.equal(restored.restoredCount, 3);
  assert.deepEqual(restored.remainingTabs, []);
  assert.deepEqual(runtime.state.created, [
    { url: 'https://site.test/a', active: true, windowId: 1, index: 1 },
    { url: 'https://site.test/b', active: false, windowId: 1, index: 3 },
    { url: 'https://site.test/c', active: false, windowId: 2, index: 0, pinned: true },
  ]);

  // The window a tab came from has since been closed: it reopens in the current window, still pinned.
  const later = fixture();
  later.state.missingWindows.add(2);
  const again = await later.send({ type: 'pc:restoreTabs', tabs: closed.closedTabs });
  assert.equal(again.restoredCount, 3);
  assert.deepEqual(later.state.created.at(-1), { url: 'https://site.test/c', active: false, pinned: true });
});

test('each popup control sends its own request and no other', async () => {
  const old = Date.now() - 3 * 60 * 60 * 1000;
  const runtime = extension({ tabs: [
    { id: 1, url: 'https://in-view.test/', active: true },
    { id: 2, url: 'https://twice.test/page' }, { id: 3, url: 'https://twice.test/page' },
    { id: 4, url: 'https://idle.test/a', lastAccessed: old }, { id: 5, url: 'https://idle.test/b', lastAccessed: old },
    { id: 6, url: 'https://site.test/1' }, { id: 7, url: 'https://word.test/keyword-page', title: 'Has the keyword' },
    { id: 8, url: 'https://zzz.test/' },
  ] });
  const changing = ['pc:closeByKeyword', 'pc:closeByDomain', 'pc:closeInactive', 'pc:closeDuplicates',
    'pc:sortTabsByOpenCount', 'pc:restoreTabs', 'pc:updateSettings', 'pc:resetStats'];
  const sent = [];
  const deliver = runtime.api.runtime.sendMessage;
  runtime.api.runtime.sendMessage = (message, cb) => { sent.push(message); return deliver(message, cb); };
  // Copied through JSON: the popup runs in its own realm, so its arrays are not this file's arrays.
  const requests = () => JSON.parse(JSON.stringify(sent.splice(0).filter(message => changing.includes(message.type))));
  const elements = await popup(runtime);
  requests();

  await elements['pc-inactive-row'].click();                       // opens the review; closes nothing
  assert.deepEqual(requests(), []);
  assert.deepEqual(runtime.state.removed, []);
  await elements['pc-inactive-close'].click();
  assert.deepEqual(requests(), [{ type: 'pc:closeInactive', tabIds: [4, 5] }]);
  await elements['pc-undo-close'].click();
  assert.deepEqual(requests().map(message => message.type), ['pc:restoreTabs']);
  await elements['pc-close-duplicates'].click();
  assert.deepEqual(requests(), [{ type: 'pc:closeDuplicates' }]);
  await siteRow(elements, 'site.test').click();
  assert.deepEqual(requests(), [{ type: 'pc:closeByDomain', query: 'site.test' }]);
  await elements['pc-query'].type('keyword');
  assert.deepEqual(requests(), [], 'typing only lists');
  await elements['pc-query'].enter();
  assert.deepEqual(requests(), [{ type: 'pc:closeByKeyword', query: 'keyword', tabIds: [7] }]);
  await elements['pc-sort-tabs-quick'].click();
  assert.deepEqual(requests(), [{ type: 'pc:sortTabsByOpenCount' }]);
  await elements.themes.dark.click();
  assert.deepEqual(requests(), [{ type: 'pc:updateSettings', payload: { theme: 'dark' } }]);
  await elements['pc-keep-pinned'].click();
  assert.deepEqual(requests(), [{ type: 'pc:updateSettings', payload: { keepPinnedTabs: false } }]);
  await elements.less.click();
  assert.deepEqual(requests(), [{ type: 'pc:updateSettings', payload: { inactiveThresholdMinutes: 60 } }]);
  await elements.accents.green.click();
  assert.deepEqual(requests(), [{ type: 'pc:updateSettings', payload: { accent: 'green' } }]);
  await elements['pc-reset-stats'].click();
  assert.deepEqual(requests(), [{ type: 'pc:resetStats' }]);
  // Moving between views changes nothing.
  for (const id of ['pc-settings-toggle', 'pc-settings-back', 'pc-inactive-row', 'pc-inactive-back', 'pc-query-clear']) await elements[id].click();
  assert.deepEqual(requests(), []);
});

test('popup retains failed undo entries for retry without recreating successful entries', async () => {
  const runtime = extension({ tabs: [1, 2].map(id => ({ id, url: 'https://example.com/' + id })) });
  const elements = await popup(runtime);
  await elements['pc-query'].type('example.com');
  await elements['pc-close'].click();
  runtime.state.failCreate.add('https://example.com/2');
  await elements['pc-undo-close'].click();
  assert.equal(runtime.state.created.length, 1);
  assert.equal(elements['pc-undo-close'].hidden, false);
  assert.equal(elements['pc-status'].textContent, 'Restored: 1 · Undo failed');
  runtime.state.failCreate.clear();
  await elements['pc-undo-close'].click();
  assert.deepEqual(runtime.state.created.map(tab => tab.url), ['https://example.com/1', 'https://example.com/2']);
  assert.equal(elements['pc-undo-close'].hidden, true);
});

test('popup blocks another cleanup while Undo is restoring its snapshot', async () => {
  const runtime = extension({ tabs: [
    { id: 1, url: 'https://first.example/one' },
    { id: 2, url: 'https://second.example/two' },
  ] });
  const elements = await popup(runtime);
  await siteRow(elements, 'first.example').click();
  assert.deepEqual(runtime.state.removed, [1]);
  const next = siteRow(elements, 'second.example');
  await Promise.all([elements['pc-undo-close'].click(), next.dispatch('click')]);
  assert.deepEqual(runtime.state.removed, [1]);
  assert.deepEqual(runtime.state.created.map(tab => tab.url), ['https://first.example/one']);
  assert.ok(runtime.state.tabs.some(tab => tab.id === 2));
  assert.equal(elements['pc-undo-close'].hidden, true);
  assert.equal(elements['pc-close'].disabled, false);
});

test('popup refreshes a restored site when its initially blank tab finishes navigation', async () => {
  for (const firefox of [false, true]) {
    const runtime = extension({ firefox, tabs: [{ id: 1, url: 'https://example.com/restored' }] });
    const timers = popupTimers();
    const elements = await popup(runtime, { timers });
    await siteRow(elements, 'example.com').click();
    runtime.state.delayCreatedNavigation = true;
    await elements['pc-undo-close'].click();
    const restored = runtime.state.tabs[0];
    assert.equal(restored.url, 'about:blank');
    assert.deepEqual(sitesIn(elements), []);

    restored.url = 'https://example.com/restored';
    for (const listener of runtime.api.tabs.onUpdated.listeners) await listener(restored.id, { url: restored.url, status: 'complete' }, restored);
    await timers.flushRefreshes();
    assert.deepEqual(sitesIn(elements), ['example.com']);

    const queries = runtime.state.queryCount;
    for (const listener of runtime.api.tabs.onUpdated.listeners) {
      await listener(restored.id, { title: 'Updated title' }, restored);
      await listener(99, { url: 'https://private.test/', status: 'complete' }, { id: 99, incognito: true });
    }
    await timers.flushRefreshes();
    assert.equal(runtime.state.queryCount, queries);
  }
});

test('popup keeps counts and site rows current when regular tabs are created and removed', async () => {
  const runtime = extension();
  const timers = popupTimers();
  const elements = await popup(runtime, { timers });
  assert.equal(elements['pc-suggest-empty'].hidden, false);
  assert.equal(elements['pc-suggest-empty'].textContent, 'No suggestions right now');
  assert.equal(elements['pc-sites-rule'].hidden, true);
  const created = { id: 1, url: 'https://new.example/', windowId: 1, incognito: false };
  runtime.state.tabs.push(created);
  for (const listener of runtime.api.tabs.onCreated.listeners) await listener(created);
  await timers.flushRefreshes();
  assert.deepEqual(sitesIn(elements), ['new.example']);
  assert.equal(elements['pc-open-count'].textContent, '1 open tab');
  assert.equal(elements['pc-site-count'].textContent, '1 site');
  assert.equal(elements['pc-suggest-empty'].hidden, true);

  runtime.state.tabs = [];
  for (const listener of runtime.api.tabs.onRemoved.listeners) await listener(created.id, { windowId: 1, isWindowClosing: false });
  await timers.flushRefreshes();
  assert.deepEqual(sitesIn(elements), []);
  assert.equal(elements['pc-open-count'].textContent, '0 open tabs');
});

test('popup handles an unavailable background with its translated error state', async () => {
  const runtime = extension({ locale: 'de' });
  runtime.state.failMessage = true;
  const elements = await popup(runtime);
  assert.equal(elements['pc-suggest-empty'].hidden, false);
  assert.equal(elements['pc-suggest-empty'].textContent, L.catalogue('de').suggestionsFailed);
  await elements['pc-query'].type('example.com');
  assert.equal(elements['pc-match-empty'].textContent, L.catalogue('de').suggestionsFailed);
  assert.equal(elements['pc-close'].hidden, true);
  await elements['pc-query'].enter();
  assert.equal(elements['pc-status'].textContent, L.catalogue('de').closeFailed);
  assert.equal(elements['pc-close'].disabled, false);
});

test('popup settings persist when a translated popup is reopened', async () => {
  const runtime = extension({ locale: 'de' });
  const elements = await popup(runtime);
  assert.equal(elements.root.getAttribute('data-theme'), 'system');
  assert.equal(elements.themes.system.getAttribute('aria-pressed'), 'true');
  assert.equal(elements.threshold.textContent, '2 Stunden');
  await elements.more.click();
  await elements.more.click();
  await elements.themes.dark.click();
  await elements['pc-keep-pinned'].click();
  const reopened = await popup(runtime);
  assert.equal(reopened.threshold.textContent, '8 Stunden');
  assert.equal(reopened['pc-inactive-hint'].textContent, '8 Std.+');
  assert.equal(reopened.themes.dark.getAttribute('aria-pressed'), 'true');
  assert.equal(reopened.root.getAttribute('data-theme'), 'dark');
  assert.equal(reopened['pc-keep-pinned'].getAttribute('aria-checked'), 'false');
  assert.equal(runtime.state.store['pc.settings'].inactiveThresholdMinutes, 480);
  assert.equal(runtime.state.store['pc.settings'].keepPinnedTabs, false);
});

test('popup settings changes arriving together retain every saved value', async () => {
  const runtime = extension();
  const elements = await popup(runtime);
  await Promise.all([elements.less.click(), elements['pc-keep-pinned'].click(), elements.themes.dark.click()]);
  const reopened = await popup(runtime);
  assert.equal(reopened.threshold.textContent, '1 hour');
  assert.equal(reopened['pc-keep-pinned'].getAttribute('aria-checked'), 'false');
  assert.equal(reopened.themes.dark.getAttribute('aria-pressed'), 'true');
});

test('popup steps a threshold saved by an older version to its neighbours', async () => {
  const runtime = extension();
  runtime.state.store['pc.settings'] = { inactiveThresholdMinutes: 45 };
  let elements = await popup(runtime);
  assert.equal(elements.threshold.textContent, '45 minutes');
  assert.equal(elements.less.getAttribute('aria-label'), '30 minutes');
  assert.equal(elements.more.getAttribute('aria-label'), '1 hour');
  await elements.less.click();
  assert.equal(runtime.state.store['pc.settings'].inactiveThresholdMinutes, 30);
  assert.equal(elements.less.disabled, true);
  runtime.state.store['pc.settings'] = { inactiveThresholdMinutes: 20000 };
  elements = await popup(runtime);
  assert.equal(elements.more.disabled, true);
  await elements.less.click();
  assert.equal(runtime.state.store['pc.settings'].inactiveThresholdMinutes, 10080);
  assert.equal(elements.threshold.textContent, '1 week');
});

test('popup does not apply or keep settings changes that failed to save', async () => {
  const runtime = extension({ locale: 'es' });
  runtime.state.store['pc.settings'] = { theme: 'light', inactiveThresholdMinutes: 60 };
  const elements = await popup(runtime);
  await elements['pc-settings-toggle'].click();
  runtime.state.failStorageSet = true;
  await elements.more.click();
  await elements.themes.dark.click();
  await elements['pc-keep-pinned'].click();
  assert.equal(runtime.state.store['pc.settings'].inactiveThresholdMinutes, 60);
  assert.equal(runtime.state.store['pc.settings'].theme, 'light');
  assert.equal(elements.threshold.textContent, '1 hora');
  assert.equal(elements.root.getAttribute('data-theme'), 'light');
  assert.equal(elements.themes.light.getAttribute('aria-pressed'), 'true');
  assert.equal(elements['pc-keep-pinned'].getAttribute('aria-checked'), 'true');
  assert.equal(elements['pc-status'].textContent, L.catalogue('es').closeFailed);
});

test('popup site rows use exact host matching and report partial close failures', async () => {
  const runtime = extension({ tabs: [
    { id: 1, url: 'http://localhost:3000/one' }, { id: 2, url: 'http://localhost:3000/two' },
    { id: 3, url: 'https://docs.example/', title: 'localhost instructions' },
  ] });
  runtime.state.failRemove.add(2);
  const elements = await popup(runtime);
  const row = siteRow(elements, 'localhost');
  assert.equal(row.getAttribute('aria-label'), 'Close tabs from localhost · 2 open tabs');
  assert.equal(row.style.getPropertyValue('--n'), '2');
  await row.click();
  assert.deepEqual(runtime.state.removed, [1]);
  assert.equal(elements['pc-status'].textContent, 'Closed: 1 · Failed');
  assert.equal(elements['pc-undo-close'].hidden, false);
});

test('popup counts: open tabs and sites in the header, lifetime total with digit grouping below', async () => {
  const runtime = extension({ tabs: Array.from({ length: 14 }, (_, index) => ({ id: index + 1, url: 'https://example.com/' + index })) });
  runtime.state.store['pc.stats'] = { totalTabsEaten: 2479 };
  const elements = await popup(runtime);
  assert.equal(elements['pc-open-count'].textContent, '14 open tabs');
  assert.equal(elements['pc-site-count'].textContent, '1 site');
  assert.equal(elements['pc-closed-count'].textContent, '2,479 closed');
  assert.equal(elements['pc-settings-closed'].textContent, '2,479 closed');
  assert.equal(elements['pc-duplicates-count'].textContent, '0');
  assert.equal(elements['pc-close-duplicates'].disabled, true);
  assert.equal(elements['pc-inactive-row'].disabled, true);
  // 14 tabs on the busiest site: one 4px mark per tab with a 1px gap.
  assert.equal(elements['pc-suggest-list'].style.getPropertyValue('--u'), '4px');
  assert.equal(elements['pc-suggest-list'].style.getPropertyValue('--g'), '1px');
  await elements['pc-reset-stats'].click();
  assert.equal(elements['pc-closed-count'].textContent, '0 closed');
  assert.equal(runtime.state.store['pc.stats'].totalTabsEaten, 0);
});

test('popup tick marks narrow, then become a plain bar, as one site grows', async () => {
  for (const [count, unit, gap] of [[16, '4px', '1px'], [17, '3px', '1px'], [21, '3px', '1px'], [22, 64 / 22 + 'px', '0px'], [64, '1px', '0px']]) {
    const runtime = extension({ tabs: Array.from({ length: count }, (_, index) => ({ id: index + 1, url: 'https://example.com/' + index })) });
    const elements = await popup(runtime);
    assert.equal(elements['pc-suggest-list'].style.getPropertyValue('--u'), unit, String(count));
    assert.equal(elements['pc-suggest-list'].style.getPropertyValue('--g'), gap, String(count));
  }
});

test('popup inactive review lists tabs before closing them and returns to suggestions', async () => {
  const hours = count => Date.now() - count * 60 * 60 * 1000;
  const runtime = extension({ tabs: [
    { id: 1, lastAccessed: hours(3), title: 'Three' }, { id: 2, lastAccessed: hours(30), title: 'Thirty' },
    { id: 3, lastAccessed: hours(5), title: 'Five' }, { id: 4, lastAccessed: hours(9), pinned: true }, { id: 5, lastAccessed: hours(9), active: true },
  ].map(tab => ({ url: 'https://example.com/' + tab.id, ...tab })) });
  const elements = await popup(runtime);
  assert.equal(elements['pc-inactive-count'].textContent, '3');
  assert.equal(elements['pc-inactive-hint'].textContent, '2 hr+');
  await elements['pc-inactive-row'].click();
  assert.deepEqual(runtime.state.removed, [], 'opening the review closes nothing');
  assert.equal(elements['pc-inactive-list'].hidden, false);
  assert.equal(elements['pc-suggest-list'].hidden, true);
  assert.equal(elements['pc-header'].hidden, true);
  assert.equal(elements.document.activeElement, elements['pc-inactive-back']);
  assert.equal(elements['pc-inactive-meta'].textContent, '3 open tabs');
  assert.deepEqual(elements['pc-inactive-rows'].children.map(row => [row.dataset.tabId, row.children[2].textContent]), [['2', '1 day'], ['3', '5 hr'], ['1', '3 hr']]);
  await lastOf(elements['pc-inactive-rows'].children[0]).click();
  assert.deepEqual(runtime.state.removed, [2]);
  assert.equal(elements['pc-inactive-list'].hidden, false);
  assert.equal(elements['pc-inactive-close-count'].textContent, '2');
  await elements.more.click();
  assert.deepEqual(elements['pc-inactive-rows'].children.map(row => row.dataset.tabId), ['3']);
  await elements.less.click();
  await elements['pc-inactive-close'].click();
  assert.deepEqual(runtime.state.removed, [2, 1, 3]);
  assert.equal(elements['pc-status'].textContent, 'Inactive tabs closed: 2');
  assert.equal(elements['pc-undo-close'].hidden, false);
  assert.equal(elements['pc-suggest-list'].hidden, false);
  assert.equal(elements['pc-inactive-row'].disabled, true);
  assert.deepEqual(runtime.state.tabs.map(tab => tab.id), [4, 5]);
});

test('popup hides the Inactive row when the saved setting turns it off', async () => {
  const runtime = extension({ tabs: [{ id: 1, url: 'https://example.com/', lastAccessed: 1 }] });
  runtime.state.store['pc.settings'] = { enableInactiveSuggestion: false };
  const elements = await popup(runtime);
  assert.equal(elements['pc-inactive-row'].hidden, true);
});

test('popup views swap whole blocks and move focus with them', async () => {
  const elements = await popup(extension());
  const shown = () => ['pc-header', 'pc-suggest-list', 'pc-match-list', 'pc-tab-settings', 'pc-inactive-list', 'pc-foot-main', 'pc-foot-settings', 'pc-foot-inactive'].filter(id => !elements[id].hidden);
  assert.deepEqual(shown(), ['pc-header', 'pc-suggest-list', 'pc-foot-main']);
  await elements['pc-settings-toggle'].click();
  assert.deepEqual(shown(), ['pc-tab-settings', 'pc-foot-settings']);
  assert.equal(elements.document.activeElement, elements['pc-settings-back']);
  await elements['pc-settings-back'].click();
  assert.deepEqual(shown(), ['pc-header', 'pc-suggest-list', 'pc-foot-main']);
  assert.equal(elements.document.activeElement, elements['pc-settings-toggle']);
  assert.equal(elements['pc-version'].textContent, 'TabTools');
});

test('popup result bar lasts seven seconds and sorting reports without Undo', async () => {
  const runtime = extension({ tabs: [{ id: 1, url: 'https://b.test/' }, { id: 2, url: 'https://c.test/' }, { id: 3, url: 'https://a.test/1' }, { id: 4, url: 'https://a.test/2' }] });
  const delays = [];
  const elements = await popup(runtime, { timers: { setTimeout: (_, delay) => { delays.push(delay); return delays.length; }, clearTimeout() {} } });
  await siteRow(elements, 'b.test').click();
  assert.ok(delays.includes(7000));
  assert.equal(elements['pc-toast'].classList.contains('is-open'), true);
  assert.equal(elements['pc-undo-close'].hidden, false);
  await elements['pc-sort-tabs-quick'].click();
  assert.equal(elements['pc-status'].textContent, 'Tabs reordered: 3');
  assert.equal(elements['pc-undo-close'].hidden, true);
  await elements['pc-undo-close'].dispatch('click');
  assert.deepEqual(runtime.state.created, [], 'a later message ends the earlier Undo');
  // Nothing is out of place now, and the popup says so instead of repeating a count.
  await elements['pc-sort-tabs-quick'].click();
  assert.equal(elements['pc-status'].textContent, 'Nothing to sort');
  // The user drags the single c.test tab to the front, then the browser refuses a move.
  await new Promise(resolve => runtime.api.tabs.move(2, { index: 0 }, resolve));
  runtime.state.failMove.add(3);
  await elements['pc-sort-tabs-quick'].click();
  assert.equal(elements['pc-status'].textContent, 'Sort failed');
});

test('popup applies an accent preset for the active theme and clears it for purple', async () => {
  const runtime = extension();
  runtime.state.store['pc.settings'] = { accent: 'blue', theme: 'dark' };
  let elements = await popup(runtime);
  assert.equal(elements.root.style.getPropertyValue('--accent'), '#4b94ff');
  assert.equal(elements.root.style.getPropertyValue('--on-accent'), '#15161b');
  assert.equal(elements.accents.blue.getAttribute('aria-pressed'), 'true');
  assert.equal(elements.accents.green.style.getPropertyValue('--sw'), '#00b366');
  await elements.themes.light.click();
  assert.equal(elements.root.style.getPropertyValue('--accent'), '#106bde');
  await elements.accents.purple.click();
  assert.equal(elements.root.style.getPropertyValue('--accent'), '');
  assert.equal(runtime.state.store['pc.settings'].accent, 'purple');
  runtime.state.store['pc.settings'] = { accent: 'no-such-colour', theme: 'system' };
  elements = await popup(runtime, { dark: true });
  assert.equal(elements.root.style.getPropertyValue('--accent'), '');
  assert.equal(elements.accents.purple.getAttribute('aria-pressed'), 'true');
  assert.equal(elements.accents.orange.style.getPropertyValue('--sw'), '#f77211', 'System follows a dark browser');
});
