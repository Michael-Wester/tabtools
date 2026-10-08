// SPDX-License-Identifier: MPL-2.0

const root = typeof globalThis !== "undefined" ? globalThis : this;
if (typeof root.ttMessage !== "function" && typeof importScripts === "function") {
  try {
    importScripts("i18n-fallback.js", "i18n.js");
  } catch (err) {
    console.error("TabTools: unable to import localization helpers", err);
  }
}
const SETTINGS_KEY = "pc.settings";
// background.suggestions.js shares these through normalizeSettings below.
const DEFAULTS = {
  enableInactiveSuggestion: true,
  inactiveThresholdMinutes: 120,
  keepPinnedTabs: true,
  theme: "system",
  accent: "purple",
};
// The shortest inactivity time the popup offers.
const MIN_INACTIVE_MINUTES = 30;

function normalizeSettings(raw) {
  const settings = { ...DEFAULTS, ...(raw || {}) };
  delete settings.enableSuggestions;
  // 4.0.4 saved 1 minute when its field was emptied, and accepted any number.
  // Shorter times than the popup can show are raised to its first step.
  settings.inactiveThresholdMinutes = Math.max(
    MIN_INACTIVE_MINUTES,
    Number(settings.inactiveThresholdMinutes) || DEFAULTS.inactiveThresholdMinutes
  );
  return settings;
}

const CONTEXT_MENU_TITLE_KEY = "contextClose";
const CLOSE_MENU_ID_PAGE = "tabTools-close-site-tabs-page";

// In MV3 service workers we must pull in helper script manually.
if (
  typeof root.pcRecordClosedTabs !== "function" &&
  typeof importScripts === "function"
) {
  try {
    importScripts("background.suggestions.js");
  } catch (err) {
    console.error("TabTools: unable to import suggestions helpers", err);
  }
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

// When a tab was last in use. Chrome's lastAccessed is the moment a tab became
// the active one, so on its own a tab used for hours looks idle as soon as the
// user switches away. `leftAt` holds the times this extension saw tabs being
// left (see recordActivated); the later of the two is the truth.
function lastUsed(tab, leftAt) {
  return Math.max(tab.lastAccessed || 0, (leftAt && leftAt[tab.id]) || 0);
}

function tabLooksInactive(tab, thresholdMs, nowTs, leftAt) {
  if (!tab || tab.incognito) return false;
  if (tab.pinned || tab.audible) return false;
  if (tab.active) return false;
  const last = lastUsed(tab, leftAt);
  if (last) return nowTs - last >= thresholdMs;
  return tab.discarded === true;
}

// Which tabs an action would close. Previews, counts and the closes themselves
// all go through these, so what the popup lists is what a click removes.
function selectByKeyword(tabs, keyword, { exactDomain = false, keepPinned = true } = {}) {
  if (typeof keyword !== "string" || !keyword.trim()) return [];
  const kw = keyword.trim();
  const open = tabs.filter(tab => !tab.incognito && !(keepPinned && tab.pinned));
  if (exactDomain || kw.includes(".")) {
    // Site rows and the context menu name one exact host. A domain typed into
    // the field also covers its subdomains.
    const wanted = kw.toLowerCase().replace(/^www\./, "");
    return open.filter(tab => {
      const domain = domainFromUrl(tab.url || tab.pendingUrl);
      return domain === wanted || (!exactDomain && !!domain && domain.endsWith("." + wanted));
    });
  }
  const rx = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return open.filter(tab => (tab.title && rx.test(tab.title)) || rx.test(tab.url || tab.pendingUrl || ""));
}

function selectInactive(tabs, thresholdMinutes, nowTs = Date.now(), leftAt = {}) {
  const thresholdMs = Math.max(1, Number(thresholdMinutes) || 30) * 60000;
  return tabs.filter(tab => tabLooksInactive(tab, thresholdMs, nowTs, leftAt));
}

// Two tabs are copies of one page when their whole addresses match, including
// the part after "#". Gmail, Telegram and many web apps keep the page there,
// so two different conversations differ only in it.
function duplicateKey(url) {
  try {
    const address = new URL(url);
    // A text directive ("#:~:text=…") only tells the browser what to highlight.
    const fragment = address.hash.replace(/:~:.*$/, "");
    address.hash = "";
    return address.href + (fragment.length > 1 ? fragment : "");
  } catch {
    return null;
  }
}

function selectDuplicates(tabs) {
  const copies = new Map();
  for (const tab of tabs) {
    if (tab.incognito) continue;
    const key = duplicateKey(tab.url || tab.pendingUrl || "");
    if (!key) continue;
    if (!copies.has(key)) copies.set(key, []);
    copies.get(key).push(tab);
  }
  const extra = new Set();
  for (const group of copies.values()) {
    if (group.length < 2) continue;
    // A pinned copy, a copy playing sound and a copy in view in its window
    // always stay. When no copy is one of those, the first in tab order stays.
    const spare = group.filter(tab => !tab.pinned && !tab.audible && !tab.active);
    if (spare.length === group.length) spare.shift();
    for (const tab of spare) extra.add(tab.id);
  }
  return tabs.filter(tab => extra.has(tab.id));
}

// The popup sends the ids it listed; close only tabs that are both listed and
// still selected by the rule, so nothing unseen and nothing stale is removed.
function onlyListed(tabs, tabIds) {
  return Array.isArray(tabIds) ? tabs.filter(tab => tabIds.includes(tab.id)) : tabs;
}

function previewTab(tab, nowTs, leftAt) {
  const url = tab.url || tab.pendingUrl || "";
  const last = lastUsed(tab, leftAt);
  return {
    id: tab.id,
    title: tab.title || "",
    url,
    domain: domainFromUrl(url) || "",
    favIconUrl: typeof tab.favIconUrl === "string" ? tab.favIconUrl.trim() : "",
    idleMinutes: last ? Math.max(0, Math.floor((nowTs - last) / 60000)) : null,
  };
}

function tabsQuery(q) {
  return new Promise((resolve, reject) => chrome.tabs.query(q || {}, (tabs) => {
    const err = getRuntimeLastError();
    if (err) reject(err);
    else resolve(tabs);
  }));
}
function tabsRemove(ids) {
  return new Promise((resolve, reject) => chrome.tabs.remove(ids, () => {
    const err = getRuntimeLastError();
    if (err) reject(err);
    else resolve();
  }));
}
function tabsCreate(options) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(options, (tab) => {
      const err = chrome.runtime.lastError;
      if (err) reject(err);
      else resolve(tab);
    });
  });
}
function tabsMove(id, index) {
  return new Promise((resolve, reject) => {
    chrome.tabs.move(id, { index }, (moved) => {
      const err = getRuntimeLastError();
      if (err) reject(err);
      else resolve(Array.isArray(moved) ? moved[0] : moved);
    });
  });
}

// ---- When tabs were last left ----------------------------------------------
// Kept in session storage: the record has to outlive the service worker, which
// Chrome stops after about half a minute, and means nothing after a restart.
const LEFT_KEY = "pc.left";   // { at: { tabId: ms }, active: { windowId: tabId } }
let leftMemory = { at: {}, active: {} };   // for browsers without session storage
let leftWrite = Promise.resolve();

function sessionStore() {
  const storage = (typeof chrome !== "undefined" && chrome.storage) || null;
  return storage && storage.session ? storage.session : null;
}

function readLeft() {
  const store = sessionStore();
  if (!store) return Promise.resolve({ at: { ...leftMemory.at }, active: { ...leftMemory.active } });
  return new Promise((resolve) => {
    const answer = (value) => resolve({ at: { ...(value && value.at) }, active: { ...(value && value.active) } });
    try {
      store.get(LEFT_KEY, (got) => answer(getRuntimeLastError() ? null : got && got[LEFT_KEY]));
    } catch (_) { answer(null); }
  });
}

function writeLeft(state) {
  const store = sessionStore();
  if (!store) {
    leftMemory = state;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    try {
      store.set({ [LEFT_KEY]: state }, () => { getRuntimeLastError(); resolve(); });
    } catch (_) { resolve(); }
  });
}

// One change at a time: tab switches can arrive faster than storage answers.
function updateLeft(change) {
  const next = leftWrite.then(async () => {
    const state = await readLeft();
    if ((await change(state)) !== false) await writeLeft(state);
  });
  leftWrite = next.catch(() => {});
  return next;
}

function recordActivated(info) {
  if (!info || typeof info.tabId !== "number") return Promise.resolve();
  const at = Date.now();
  return updateLeft((state) => {
    // Firefox names the tab that was left. Chrome does not, so remember which
    // tab was active in each window.
    const previous = typeof info.previousTabId === "number" ? info.previousTabId : state.active[info.windowId];
    if (typeof previous === "number" && previous !== info.tabId) state.at[previous] = at;
    state.active[info.windowId] = info.tabId;
  });
}

// After an install, an update or a browser start nothing says which tab is
// active in each window, and the first tab left would go unrecorded.
function seedActiveTabs() {
  return updateLeft(async (state) => {
    for (const tab of await tabsQuery({ active: true })) {
      if (typeof tab.windowId === "number" && typeof tab.id === "number") state.active[tab.windowId] = tab.id;
    }
  }).catch((err) => console.warn("TabTools: unable to note the active tabs", err));
}

// The recorded times. `openTabs` must be every open tab: the record of any tab
// that is not in it is taken to belong to a closed tab and is dropped.
async function leftTimes(openTabs) {
  await leftWrite;
  const state = await readLeft();
  const open = new Set(openTabs.map(tab => String(tab.id)));
  if (Object.keys(state.at).some(id => !open.has(id))) {
    updateLeft((latest) => {
      const stale = Object.keys(latest.at).filter(id => !open.has(id));
      for (const id of stale) delete latest.at[id];
      return stale.length > 0;
    });
  }
  return state.at;
}

function serializeTab(tab) {
  if (!tab) return null;
  const url = tab.url || tab.pendingUrl || "";
  if (!url) return null;
  const out = {
    url,
    windowId: typeof tab.windowId === "number" ? tab.windowId : undefined,
    index: typeof tab.index === "number" ? tab.index : undefined,
    active: !!tab.active,
    pinned: !!tab.pinned,
  };
  return out;
}
function getRuntimeLastError() {
  if (
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    chrome.runtime.lastError
  ) {
    return chrome.runtime.lastError;
  }
  if (
    typeof browser !== "undefined" &&
    browser.runtime &&
    browser.runtime.lastError
  ) {
    return browser.runtime.lastError;
  }
  return null;
}
async function handleContextMenuClick(info, tab) {
  // Every action leaves private windows alone. Without this, a click in a
  // private tab would close that site's tabs in the normal windows instead.
  if (tab && tab.incognito) return;
  let url =
    tab?.url ||
    info?.pageUrl ||
    info?.frameUrl ||
    info?.linkUrl ||
    info?.srcUrl ||
    "";
  if (!url) {
    try {
      const activeTabs = await tabsQuery({ active: true, currentWindow: true });
      url = activeTabs[0]?.url || "";
    } catch (err) {
      console.warn(
        "TabTools: unable to resolve active tab for context menu",
        err
      );
    }
  }
  let domain = null;
  try {
    domain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {}
  if (!domain) return;
  try {
    await closeByKeyword(domain, true);
  } catch (err) {
    console.error("TabTools: context menu action failed", err);
  }
}

function contextMenusApi() {
  return (typeof chrome !== "undefined" && chrome.contextMenus) ||
    (typeof browser !== "undefined" && (browser.contextMenus || browser.menus)) ||
    null;
}

function installContextMenu() {
  const menus = contextMenusApi();
  if (!menus || typeof menus.create !== "function") return;

  // Firefox, and Chrome versions that offer it, can also show the item in the
  // menu of a tab itself.
  const tabContext = menus.ContextType && (menus.ContextType.TAB || menus.ContextType.tab);
  const contexts = ["page", "selection", "link", "editable", "image", "video", "audio"];
  if (tabContext) contexts.push(tabContext);
  else if (typeof browser !== "undefined" && (browser.contextMenus || browser.menus)) contexts.push("tab");

  const warn = (stage) => (err) => {
    if (err) console.warn(`TabTools: context menu ${stage} failed (contexts: ${contexts.join(",")})`, err);
  };
  const create = () => {
    try {
      const maybePromise = menus.create(
        { id: CLOSE_MENU_ID_PAGE, title: root.ttMessage(CONTEXT_MENU_TITLE_KEY), contexts },
        () => {
          const err = getRuntimeLastError();
          if (err && err.message) warn("create")(err);
        }
      );
      if (maybePromise && typeof maybePromise.then === "function") maybePromise.catch(warn("create"));
    } catch (err) {
      warn("create")(err);
    }
  };

  if (typeof menus.removeAll !== "function") {
    create();
    return;
  }
  try {
    const maybePromise = menus.removeAll();
    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.catch(warn("removeAll")).finally(create);
    } else {
      menus.removeAll(() => {
        const err = getRuntimeLastError();
        if (err && err.message) warn("removeAll")(err);
        create();
      });
    }
  } catch (err) {
    warn("removeAll")(err);
    create();
  }
}

// What has to happen once per browser session: create the menu item and note
// which tab is active in each window.
function startSession() {
  installContextMenu();
  seedActiveTabs();
}

// A service worker runs this file on every wake, but the menu item and the
// session record outlive it. A flag in session storage says the session has
// started. That storage is emptied exactly when the work is due again: on
// install, update, re-enable and browser start.
const SESSION_KEY = "pc.sessionStarted";
let sessionCheck = null;
function ensureSessionStarted() {
  if (sessionCheck) return sessionCheck;
  const store = sessionStore();
  if (!store) {
    // No session storage: nothing would remember tab switches between wakes.
    installContextMenu();
    return Promise.resolve();
  }
  sessionCheck = new Promise((resolve) => {
    const start = () => {
      startSession();
      try {
        store.set({ [SESSION_KEY]: true }, () => { getRuntimeLastError(); resolve(); });
      } catch (_) { resolve(); }
    };
    try {
      store.get(SESSION_KEY, (got) => {
        if (!getRuntimeLastError() && got && got[SESSION_KEY]) resolve();
        else start();
      });
    } catch (_) { start(); }
  });
  return sessionCheck;
}

function getSettings() {
  return new Promise((res, reject) => {
    chrome.storage.local.get(SETTINGS_KEY, (raw) => {
      const err = getRuntimeLastError();
      if (err) reject(err);
      else res(normalizeSettings(raw?.[SETTINGS_KEY]));
    });
  });
}

async function closeTabs(tabs) {
  // A tab may disappear or become uneditable after the query. Track each
  // removal independently so failed tabs never enter stats or the undo list.
  const results = await Promise.allSettled(tabs.map(tab => tabsRemove(tab.id)));
  const closed = tabs.filter((_, index) => results[index].status === "fulfilled");
  if (closed.length) {
    if (typeof root.pcStatsEat === "function") {
      try { await root.pcStatsEat({ count: closed.length }); } catch (err) {
        console.warn("TabTools: unable to save close statistics", err);
      }
    }
  }
  return {
    closedCount: closed.length,
    failedCount: tabs.length - closed.length,
    closedDomains: [...new Set(closed.map(tab => domainFromUrl(tab.url || tab.pendingUrl)).filter(Boolean))],
    closedTabs: closed.map(serializeTab).filter(Boolean),
  };
}

// `open` is every open tab; `matched` is the part of it the keyword selects.
async function findKeywordTabs(keyword, exactDomain = false) {
  if (typeof keyword !== "string" || !keyword.trim()) return { open: [], matched: [] };
  const settings = await getSettings();
  const open = await tabsQuery({});
  const matched = selectByKeyword(open, keyword, {
    exactDomain,
    keepPinned: settings.keepPinnedTabs !== false,
  });
  return { open, matched };
}

async function closeByKeyword(keyword, exactDomain = false, tabIds) {
  return closeTabs(onlyListed((await findKeywordTabs(keyword, exactDomain)).matched, tabIds));
}

async function previewKeyword(keyword) {
  const nowTs = Date.now();
  const { open, matched } = await findKeywordTabs(keyword);
  const leftAt = matched.length ? await leftTimes(open) : {};
  return { tabs: matched.map(tab => previewTab(tab, nowTs, leftAt)) };
}

async function findInactiveTabs() {
  const settings = await getSettings();
  const tabs = await tabsQuery({});
  const leftAt = await leftTimes(tabs);
  return { tabs: selectInactive(tabs, settings.inactiveThresholdMinutes, Date.now(), leftAt), leftAt };
}

async function closeInactiveTabs(tabIds) {
  return closeTabs(onlyListed((await findInactiveTabs()).tabs, tabIds));
}

async function previewInactive() {
  const nowTs = Date.now();
  const { tabs, leftAt } = await findInactiveTabs();
  // Longest unused first. Tabs with no time at all (listed because the browser
  // discarded them) go last.
  tabs.sort((a, b) => (lastUsed(a, leftAt) || Infinity) - (lastUsed(b, leftAt) || Infinity));
  return { tabs: tabs.map(tab => previewTab(tab, nowTs, leftAt)) };
}

async function closeDuplicateTabs() {
  return closeTabs(selectDuplicates(await tabsQuery({})));
}

async function restoreTabs(tabs) {
  if (!Array.isArray(tabs) || !tabs.length) return { restoredCount: 0, remainingTabs: [] };

  const cleaned = tabs
    .map((tab) => {
      if (!tab || typeof tab.url !== "string" || !tab.url) return null;
      return {
        url: tab.url,
        windowId: typeof tab.windowId === "number" ? tab.windowId : undefined,
        index: typeof tab.index === "number" ? tab.index : undefined,
        active: !!tab.active,
        pinned: !!tab.pinned,
      };
    })
    .filter(Boolean);

  if (!cleaned.length) return { restoredCount: 0, remainingTabs: [] };

  cleaned.sort((a, b) => {
    const winA =
      typeof a.windowId === "number" ? a.windowId : Number.MAX_SAFE_INTEGER;
    const winB =
      typeof b.windowId === "number" ? b.windowId : Number.MAX_SAFE_INTEGER;
    if (winA !== winB) return winA - winB;
    const idxA =
      typeof a.index === "number" ? a.index : Number.MAX_SAFE_INTEGER;
    const idxB =
      typeof b.index === "number" ? b.index : Number.MAX_SAFE_INTEGER;
    return idxA - idxB;
  });

  const activatedWindows = new Set();
  let activatedFallback = false;
  let restored = 0;
  const remainingTabs = [];

  for (const tab of cleaned) {
    const opts = {
      url: tab.url,
      active: false,
    };
    if (typeof tab.windowId === "number") {
      opts.windowId = tab.windowId;
    }
    if (typeof tab.index === "number") {
      opts.index = Math.max(0, tab.index);
    }
    if (tab.pinned) {
      opts.pinned = true;
    }

    if (tab.active) {
      if (
        typeof tab.windowId === "number" &&
        !activatedWindows.has(tab.windowId)
      ) {
        opts.active = true;
        activatedWindows.add(tab.windowId);
      } else if (!activatedFallback) {
        opts.active = true;
        activatedFallback = true;
      }
    }

    try {
      await tabsCreate(opts);
      restored += 1;
    } catch (err) {
      if (opts.windowId !== undefined) {
        try {
          const fallback = {
            url: tab.url,
            active: opts.active,
          };
          if (tab.pinned) fallback.pinned = true;
          await tabsCreate(fallback);
          restored += 1;
          continue;
        } catch (fallbackErr) {
          console.warn("TabTools: fallback restore failed", fallbackErr);
        }
      } else {
        console.warn("TabTools: restore failed", err);
      }
      remainingTabs.push(tab);
    }
  }

  return { restoredCount: restored, remainingTabs };
}

// Works out how to sort one window's loose tabs by site: the sites with the
// most tabs first, then by name. Pinned tabs and tabs in a tab group stay
// exactly where they are; the loose tabs are rearranged among the positions
// loose tabs already hold, so no group gains, loses or is split by a tab.
function planSort(tabs) {
  const order = [...tabs].sort((a, b) => (a.index || 0) - (b.index || 0));
  const domainOf = new Map();
  const domainCounts = new Map();
  for (const tab of order) {
    const domain = domainFromUrl(tab.url) || "";
    domainOf.set(tab.id, domain);
    domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
  }
  const isLoose = (tab) => !tab.pinned && !(typeof tab.groupId === "number" && tab.groupId !== -1);
  const slots = [];
  order.forEach((tab, position) => { if (isLoose(tab)) slots.push(position); });
  const sorted = slots.map(position => order[position]).sort((a, b) => {
    const domainA = domainOf.get(a.id);
    const domainB = domainOf.get(b.id);
    const countDiff = (domainCounts.get(domainB) || 0) - (domainCounts.get(domainA) || 0);
    if (countDiff !== 0) return countDiff;
    if (!domainA && domainB) return 1;
    if (domainA && !domainB) return -1;
    const cmp = domainA.localeCompare(domainB);
    if (cmp !== 0) return cmp;
    return (a.index || 0) - (b.index || 0);
  });

  const moves = [];
  const now = order.map(tab => tab.id);          // ids by position, as the moves are made
  const indexAt = order.map((tab, position) => (typeof tab.index === "number" ? tab.index : position));
  const looseAt = order.map(isLoose);
  let changed = 0;
  slots.forEach((slot, rank) => {
    const wanted = sorted[rank].id;
    if (order[slot].id !== wanted) changed += 1;
    if (now[slot] === wanted) return;
    const from = now.indexOf(wanted);            // always a later loose position
    if (looseAt.slice(slot, from).every(Boolean)) {
      // Nothing but loose tabs in between: one move, and they shift along.
      moves.push({ id: wanted, index: indexAt[slot] });
      now.splice(from, 1);
      now.splice(slot, 0, wanted);
      return;
    }
    // A pinned or grouped tab lies between. Swap the two loose tabs with two
    // moves, which puts every tab in between back where it was.
    const displaced = now[slot];
    moves.push({ id: wanted, index: indexAt[slot] }, { id: displaced, index: indexAt[from] });
    now[slot] = wanted;
    now[from] = displaced;
  });
  return { moves, changed };
}

async function sortTabsByOpenCount() {
  const tabs = await tabsQuery({ currentWindow: true });
  if (!Array.isArray(tabs) || tabs.length <= 1) return { sortedCount: 0 };
  const { moves, changed } = planSort(tabs);
  for (const move of moves) {
    // Each move assumes the ones before it landed. If the browser put a tab
    // somewhere else, or refused, stop rather than place the rest by guesswork.
    const moved = await tabsMove(move.id, move.index);
    if (moved && typeof moved.index === "number" && moved.index !== move.index) {
      throw new Error("TabTools: a tab did not move to its place; sorting stopped");
    }
    // Only loose tabs are moved, each to a place beside loose tabs. One that
    // comes back in a tab group was taken into it by the browser.
    if (moved && typeof moved.groupId === "number" && moved.groupId !== -1) {
      throw new Error("TabTools: a moved tab ended up in a tab group; sorting stopped");
    }
  }
  return { sortedCount: changed };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;
  let action;
  switch (msg.type) {
    case "pc:closeByKeyword": action = () => closeByKeyword(msg.query, false, msg.tabIds); break;
    case "pc:closeByDomain": action = () => closeByKeyword(msg.query, true); break;
    case "pc:closeInactive": action = () => closeInactiveTabs(msg.tabIds); break;
    case "pc:previewKeyword": action = () => previewKeyword(msg.query); break;
    case "pc:previewInactive": action = previewInactive; break;
    case "pc:closeDuplicates": action = closeDuplicateTabs; break;
    case "pc:sortTabsByOpenCount": action = sortTabsByOpenCount; break;
    case "pc:restoreTabs": action = () => restoreTabs(msg.tabs); break;
    default: return;
  }
  (async () => {
    try {
      const result = await action();
      sendResponse({ ok: !result.failedCount || result.closedCount > 0, ...result });
    } catch (err) {
      console.error("TabTools: action failed", msg.type, err);
      sendResponse({ ok: false });
    }
  })();
  return true;
});

const menusApi = contextMenusApi();
if (menusApi && menusApi.onClicked && typeof menusApi.onClicked.addListener === "function") {
  menusApi.onClicked.addListener((info, tab) => {
    if (info && info.menuItemId === CLOSE_MENU_ID_PAGE) handleContextMenuClick(info, tab);
  });
}

// The only tab event the background listens to. It notes when a tab is left.
const tabsApi =
  (typeof chrome !== "undefined" && chrome.tabs) ||
  (typeof browser !== "undefined" && browser.tabs);
if (tabsApi?.onActivated) tabsApi.onActivated.addListener(recordActivated);

// A background page runs this file once per session. A service worker runs it
// on every wake; listening for install and browser start makes sure one of
// those wakes comes before the first tab switch.
const isServiceWorker = typeof importScripts === "function" && typeof window === "undefined";
const runtimeApi =
  (typeof chrome !== "undefined" && chrome.runtime) ||
  (typeof browser !== "undefined" && browser.runtime) ||
  null;
if (isServiceWorker) {
  if (runtimeApi?.onInstalled) runtimeApi.onInstalled.addListener(ensureSessionStarted);
  if (runtimeApi?.onStartup) runtimeApi.onStartup.addListener(ensureSessionStarted);
  ensureSessionStarted();
} else {
  startSession();
}
