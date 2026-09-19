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
const DEFAULTS = {
  enableInactiveSuggestion: true,
  inactiveThresholdMinutes: 120,
  suggestMinOpenTabsPerDomain: 1,
  decayDays: 14,
  maxHistory: 100000,
  showQuickActions: true,
  theme: "light",
};

function normalizeSettings(raw) {
  const settings = { ...DEFAULTS, ...(raw || {}) };
  delete settings.enableSuggestions;
  return settings;
}

const ACTION_ICON_PATHS = {
  active: {
    16: "icons/black/icon-16.png",
    32: "icons/black/icon-32.png",
    48: "icons/black/icon-48.png",
    128: "icons/black/icon-128.png",
  },
};

const CONTEXT_MENU_TITLE_KEY = "contextClose";
const CONTEXT_MENU_SORT_TITLE_KEY = "contextSort";
const CONTEXT_MENU_SORT_ID = "tabTools-sort-tabs";
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

function getActionApi() {
  if (typeof chrome !== "undefined") {
    if (chrome.action) return chrome.action;
    if (chrome.browserAction) return chrome.browserAction;
  }
  if (typeof browser !== "undefined") {
    if (browser.action) return browser.action;
    if (browser.browserAction) return browser.browserAction;
  }
  return null;
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function tabLooksInactive(tab, thresholdMs, nowTs) {
  if (!tab || tab.incognito) return false;
  if (tab.pinned || tab.audible) return false;
  if (tab.active) return false;
  const last = tab.lastAccessed || 0;
  if (last) return nowTs - last >= thresholdMs;
  return tab.discarded === true;
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
    chrome.tabs.move(id, { index }, (tab) => {
      const err = getRuntimeLastError();
      if (err) reject(err);
      else resolve(tab);
    });
  });
}

// Context menu helpers

let lastIconKind = null;
let iconRefreshTimer = null;
let contextMenuClickBound = false;
async function setActionIcon() {
  const api = getActionApi();
  if (!api || typeof api.setIcon !== "function") return;
  // Firefox's manifest theme_icons adapts the icon to the toolbar theme.
  if (typeof browser !== "undefined" && browser?.browserAction) return;
  if (lastIconKind === "active") return;
  const path = ACTION_ICON_PATHS.active;
  try {
    const maybePromise = api.setIcon({ path });
    if (maybePromise && typeof maybePromise.then === "function") {
      await maybePromise;
    }
    lastIconKind = "active";
  } catch (err) {
    console.warn("TabTools: unable to set action icon", err);
  }
}

async function refreshActionIcon() {
  const api = getActionApi();
  if (!api || typeof api.setIcon !== "function") return;
  try {
    await setActionIcon();
  } catch (err) {
    console.warn("TabTools: icon refresh failed", err);
  }
}

function scheduleIconRefresh(delay = 250) {
  if (iconRefreshTimer) return;
  iconRefreshTimer = setTimeout(() => {
    iconRefreshTimer = null;
    refreshActionIcon();
  }, delay);
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

function installContextMenu() {
  const menus =
    (typeof chrome !== "undefined" && chrome.contextMenus) ||
    (typeof browser !== "undefined" && (browser.contextMenus || browser.menus));
  if (!menus || typeof menus.create !== "function") return;

  const createEntry = (title, contexts, id) => {
    try {
      const maybePromise = menus.create(
        {
          id,
          title,
          contexts,
        },
        () => {
          const err = getRuntimeLastError();
          if (err && err.message) {
            console.warn(
              `TabTools: context menu create failed (contexts: ${contexts.join(
                ","
              )})`,
              err
            );
          }
        }
      );
      if (maybePromise && typeof maybePromise.then === "function") {
        return maybePromise.catch((err) => {
          if (err) {
            console.warn(
              `TabTools: context menu create promise failed (contexts: ${contexts.join(
                ","
              )})`,
              err
            );
          }
          return null;
        });
      }
      // Synchronous ID return path.
      return maybePromise;
    } catch (err) {
      console.warn(
        `TabTools: context menu create threw (contexts: ${contexts.join(",")})`,
        err
      );
    }
    return null;
  };

  const tabContext =
    (menus.ContextType && (menus.ContextType.TAB || menus.ContextType.tab)) ||
    "tab";
  const supportsTabContext =
    !!(menus.ContextType && (menus.ContextType.TAB || menus.ContextType.tab)) ||
    (typeof browser !== "undefined" && (browser.contextMenus || browser.menus));
  const baseContexts = [
    "page",
    "selection",
    "link",
    "editable",
    "image",
    "video",
    "audio",
  ];
  const contextsToAdd = [
    {
      id: CLOSE_MENU_ID_PAGE,
      contexts: supportsTabContext
        ? [...baseContexts, tabContext]
        : baseContexts,
    },
  ];
  const sortContexts = [];

  const runCreate = () => {
    contextsToAdd.forEach((entry) => {
      createEntry(root.ttMessage(CONTEXT_MENU_TITLE_KEY), entry.contexts, entry.id);
    });
    const seenSort = new Set();
    sortContexts.forEach((ctx) => {
      const key = ctx.join(",");
      if (seenSort.has(key)) return;
      // Only register contexts supported in this browser.
      const ctxName = ctx[0];
      if (ctxName === "action" && !chrome?.action && !browser?.action) return;
      if (
        ctxName === "browser_action" &&
        !chrome?.browserAction &&
        !(typeof browser !== "undefined" && browser.browserAction)
      ) {
        return;
      }
      seenSort.add(key);
      createEntry(root.ttMessage(CONTEXT_MENU_SORT_TITLE_KEY), ctx, CONTEXT_MENU_SORT_ID);
    });
  };

  if (typeof menus.removeAll === "function") {
    try {
      const maybePromise = menus.removeAll();
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise
          .catch((err) => {
            if (err)
              console.warn("TabTools: context menu removeAll failed", err);
          })
          .finally(runCreate);
      } else {
        menus.removeAll(() => {
          const err = getRuntimeLastError();
          if (err && err.message) {
            console.warn("TabTools: context menu removeAll failed", err);
          }
          runCreate();
        });
      }
    } catch (err) {
      console.warn("TabTools: context menu removeAll threw", err);
      runCreate();
    }
  } else {
    runCreate();
  }

  if (
    !contextMenuClickBound &&
    menus.onClicked &&
    typeof menus.onClicked.addListener === "function"
  ) {
    menus.onClicked.addListener((info, tab) => {
      if (info?.menuItemId === CLOSE_MENU_ID_PAGE) {
        handleContextMenuClick(info, tab);
        return;
      }
      if (info?.menuItemId === CONTEXT_MENU_SORT_ID) {
        sortTabsByOpenCount().catch((err) => {
          console.error("TabTools: context sort failed", err);
        });
      }
    });
    contextMenuClickBound = true;
  }

}

function getSettings() {
  return new Promise((res) => {
    chrome.storage.local.get(SETTINGS_KEY, (raw) => {
      res(normalizeSettings(raw?.[SETTINGS_KEY]));
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
    scheduleIconRefresh();
  }
  return {
    closedCount: closed.length,
    failedCount: tabs.length - closed.length,
    closedDomains: [...new Set(closed.map(tab => domainFromUrl(tab.url || tab.pendingUrl)).filter(Boolean))],
    closedTabs: closed.map(serializeTab).filter(Boolean),
  };
}

async function closeByKeyword(keyword, exactDomain = false) {
  if (typeof keyword !== "string" || !keyword.trim()) return closeTabs([]);

  const kw = keyword.trim();
  const tabs = await tabsQuery({});
  const toClose = [];

  const looksLikeDomain = exactDomain || /\./.test(kw);
  if (looksLikeDomain) {
    const wanted = kw.toLowerCase().replace(/^www\./, "");
    for (const t of tabs) {
      if (t.incognito) continue;
      const d = domainFromUrl(t.url || t.pendingUrl);
      if (d === wanted) {
        toClose.push(t);
      }
    }
  } else {
    const rx = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    for (const t of tabs) {
      if (t.incognito) continue;
      if ((t.title && rx.test(t.title)) || rx.test(t.url || t.pendingUrl || "")) {
        toClose.push(t);
      }
    }
  }

  return closeTabs(toClose);
}

async function closeInactiveTabs() {
  const settings = await getSettings();
  const thresholdMinutes = Math.max(
    1,
    Number(settings.inactiveThresholdMinutes) || 30
  );
  const thresholdMs = thresholdMinutes * 60000;
  const nowTs = Date.now();

  const tabs = await tabsQuery({});
  return closeTabs(tabs.filter(tab => tabLooksInactive(tab, thresholdMs, nowTs)));
}

function normalizeUrlForDedup(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

async function closeDuplicateTabs() {
  const tabs = await tabsQuery({});
  // Seed from every pinned tab first: query order can place an unpinned copy
  // in an earlier window before the pinned copy we must keep.
  const seen = new Set(tabs.filter(tab => tab.pinned && !tab.incognito)
    .map(tab => normalizeUrlForDedup(tab.url || tab.pendingUrl || "")).filter(Boolean));
  const toClose = [];

  for (const tab of tabs) {
    if (tab.incognito || tab.pinned) continue;
    const key = normalizeUrlForDedup(tab.url || tab.pendingUrl || "");
    if (!key) continue;
    if (seen.has(key)) {
      toClose.push(tab);
    } else {
      seen.add(key);
    }
  }

  return closeTabs(toClose);
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

  scheduleIconRefresh();
  return { restoredCount: restored, remainingTabs };
}

async function sortTabsByOpenCount() {
  const tabs = await tabsQuery({ currentWindow: true });
  if (!Array.isArray(tabs) || tabs.length <= 1) return { sortedCount: 0 };

  const ordered = [...tabs].sort((a, b) => (a.index || 0) - (b.index || 0));
  const domainCounts = new Map();
  const movable = [];
  let pinnedCount = 0;

  for (const tab of ordered) {
    const domain = domainFromUrl(tab.url) || "";
    domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    if (tab.pinned) {
      pinnedCount += 1;
      continue;
    }
    movable.push({
      tabId: tab.id,
      domain,
      originalIndex: typeof tab.index === "number" ? tab.index : Number.MAX_SAFE_INTEGER,
    });
  }

  if (movable.length <= 1) return { sortedCount: 0 };

  movable.sort((a, b) => {
    const countDiff =
      (domainCounts.get(b.domain) || 0) - (domainCounts.get(a.domain) || 0);
    if (countDiff !== 0) return countDiff;
    if (!a.domain && b.domain) return 1;
    if (a.domain && !b.domain) return -1;
    const cmp = (a.domain || "").localeCompare(b.domain || "");
    if (cmp !== 0) return cmp;
    return a.originalIndex - b.originalIndex;
  });

  let moved = 0;
  for (let i = 0; i < movable.length; i += 1) {
    const targetIndex = pinnedCount + i;
    const tabId = movable[i].tabId;
    if (typeof tabId !== "number") continue;
    try {
      await tabsMove(tabId, targetIndex);
      moved += 1;
    } catch (err) {
      console.warn("TabTools: sort move failed", err);
    }
  }

  return { sortedCount: moved };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;
  let action;
  switch (msg.type) {
    case "pc:closeByKeyword": action = () => closeByKeyword(msg.query); break;
    case "pc:closeByDomain": action = () => closeByKeyword(msg.query, true); break;
    case "pc:closeInactive": action = closeInactiveTabs; break;
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

const tabsApi =
  (typeof chrome !== "undefined" && chrome.tabs) ||
  (typeof browser !== "undefined" && browser.tabs);
if (tabsApi?.onCreated) tabsApi.onCreated.addListener(scheduleIconRefresh);
if (tabsApi?.onRemoved) tabsApi.onRemoved.addListener(scheduleIconRefresh);
if (tabsApi?.onActivated) tabsApi.onActivated.addListener(scheduleIconRefresh);
if (tabsApi?.onUpdated) tabsApi.onUpdated.addListener(scheduleIconRefresh);
if (tabsApi?.onReplaced) tabsApi.onReplaced.addListener(scheduleIconRefresh);

const storageApi =
  (typeof chrome !== "undefined" && chrome.storage) ||
  (typeof browser !== "undefined" && browser.storage);
if (storageApi?.onChanged) {
  storageApi.onChanged.addListener((changes, area) => {
    if (area === "local" && changes?.[SETTINGS_KEY]) {
      scheduleIconRefresh();
    }
  });
}

const runtimeApi =
  (typeof chrome !== "undefined" && chrome.runtime) ||
  (typeof browser !== "undefined" && browser.runtime) ||
  null;
if (runtimeApi?.onInstalled) {
  runtimeApi.onInstalled.addListener(installContextMenu);
}
if (runtimeApi?.onStartup) {
  runtimeApi.onStartup.addListener(installContextMenu);
}
installContextMenu();
refreshActionIcon();
