// SPDX-License-Identifier: MPL-2.0

(function () {
  const root = typeof globalThis !== "undefined" ? globalThis : this;

  const KEYS = {
    SETTINGS: "pc.settings",
    STATS: "pc.stats",
  };

  // The defaults, the selectors and the record of when tabs were left all live
  // in background.js, which is loaded first in every browser.
  const { normalizeSettings, domainFromUrl } = root;

  const now = () => Date.now();
  const getStore = (k) =>
    new Promise((resolve, reject) => chrome.storage.local.get(k, (value) => {
      const err = chrome.runtime.lastError;
      if (err) reject(err);
      else resolve(value);
    }));
  const setStore = (o) =>
    new Promise((resolve, reject) => chrome.storage.local.set(o, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(err);
      else resolve();
    }));

  async function getSettings() {
    const got = await getStore([KEYS.SETTINGS]);
    return normalizeSettings(got[KEYS.SETTINGS]);
  }
  let settingsWrite = Promise.resolve();
  function updateSettings(patch) {
    // Multiple popup controls/windows can submit patches before a storage
    // read completes. Read each patch's starting state after the prior write.
    const next = settingsWrite.then(async () => {
      const cur = await getSettings();
      const settings = normalizeSettings({ ...cur, ...(patch || {}) });
      await setStore({ [KEYS.SETTINGS]: settings });
      return settings;
    });
    settingsWrite = next.catch(() => {});
    return next;
  }

  async function pcGetSuggestions() {
    const got = await getStore([KEYS.SETTINGS]);
    const cfg = normalizeSettings(got[KEYS.SETTINGS]);

    const tabs = await new Promise((resolve, reject) => chrome.tabs.query({}, (value) => {
      const err = chrome.runtime.lastError;
      if (err) reject(err);
      else resolve(value);
    }));
    // With "Keep pinned tabs open" on, a site row counts only the tabs a click
    // on it would close. The overview counts everything that is open.
    const keepPinned = cfg.keepPinnedTabs !== false;
    const openByDomain = new Map();
    const sites = new Set();
    let openTabs = 0;
    for (const t of tabs) {
      if (t.incognito) continue;
      openTabs += 1;
      const d = domainFromUrl(t.url || t.pendingUrl);
      if (!d) continue;
      sites.add(d);
      if (keepPinned && t.pinned) continue;
      const existing = openByDomain.get(d) || { openCount: 0, favIconUrl: "" };
      const tabIcon =
        typeof t.favIconUrl === "string" && t.favIconUrl.trim()
          ? t.favIconUrl.trim()
          : "";
      const favIconUrl = existing.favIconUrl || tabIcon;
      openByDomain.set(d, {
        openCount: existing.openCount + 1,
        favIconUrl,
      });
    }

    const inactiveCount = cfg.enableInactiveSuggestion
      ? root.selectInactive(tabs, cfg.inactiveThresholdMinutes, now(), await root.leftTimes(tabs)).length
      : 0;

    const domains = Array.from(openByDomain.entries())
      .sort((a, b) => b[1].openCount - a[1].openCount)
      .map(([domain, info]) => ({
        kind: "domain",
        domain,
        openCount: info.openCount,
        favIconUrl: info.favIconUrl || null,
      }));

    const suggestions = [];
    if (inactiveCount) {
      suggestions.push({
        kind: "inactive",
        inactiveCount,
      });
    }
    suggestions.push(...domains);
    return {
      suggestions,
      overview: {
        openTabs,
        sites: sites.size,
        inactive: inactiveCount,
        duplicates: root.selectDuplicates(tabs).length,
      },
    };
  }

  async function getStats() {
    const got = await getStore([KEYS.STATS]);
    return got[KEYS.STATS] || {
      totalTabsEaten: 0,
      startedAt: now(),
    };
  }
  let statsWrite = Promise.resolve();
  function queueStatsWrite(update) {
    const next = statsWrite.then(update);
    statsWrite = next.catch(() => {});
    return next;
  }
  function resetStats() {
    return queueStatsWrite(() => setStore({
      [KEYS.STATS]: { totalTabsEaten: 0, startedAt: now() },
    }));
  }
  async function pcStatsEat({ count = 0 } = {}) {
    if (!count) return;
    return queueStatsWrite(async () => {
      const got = await getStore([KEYS.STATS]);
      const s = got[KEYS.STATS] || { totalTabsEaten: 0, startedAt: now() };
      s.totalTabsEaten += count;
      await setStore({ [KEYS.STATS]: s });
    });
  }

  // Expose hooks to background.js / service worker global scope.
  root.pcStatsEat = pcStatsEat;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!["pc:getSettings", "pc:updateSettings", "pc:getSuggestions", "pc:getStats", "pc:resetStats"].includes(msg?.type)) return;
    (async () => {
      try {
        if (msg.type === "pc:getSettings") {
          sendResponse({ ok: true, settings: await getSettings() });
        } else if (msg.type === "pc:updateSettings") {
          sendResponse({ ok: true, settings: await updateSettings(msg.payload || {}) });
        } else if (msg.type === "pc:getSuggestions") {
          sendResponse({ ok: true, ...(await pcGetSuggestions()) });
        } else if (msg.type === "pc:getStats") {
          sendResponse({ ok: true, stats: await getStats() });
        } else if (msg.type === "pc:resetStats") {
          await resetStats();
          sendResponse({ ok: true });
        }
      } catch (err) {
        console.error("TabTools: request failed", msg.type, err);
        sendResponse({ ok: false });
      }
    })();
    return true;
  });
})();
