// SPDX-License-Identifier: MPL-2.0

(function () {
  const root = typeof globalThis !== "undefined" ? globalThis : this;

  const KEYS = {
    SETTINGS: "pc.settings",
    STATS: "pc.stats",
  };

  const DEFAULTS = {
    enableInactiveSuggestion: true,
    inactiveThresholdMinutes: 120,
    suggestMinOpenTabsPerDomain: 1,
    decayDays: 14,
    maxHistory: 200,
    showQuickActions: true,
    theme: "light",
  };

  const normalizeSettings = (raw) => {
    const settings = { ...DEFAULTS, ...(raw || {}) };
    delete settings.enableSuggestions;
    return settings;
  };

  const now = () => Date.now();
  const domainFromUrl = (url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return null;
    }
  };
  const internalPages = new Set(["settings", "extensions", "downloads", "history", "bookmarks"]);
  function internalIconFromUrl(value) {
    try {
      const url = new URL(value);
      // Match the scheme as well as the host: https://settings is a website.
      // Paths, queries and fragments still belong to the same built-in page.
      return url.protocol === "chrome:" && !url.username && !url.password && !url.port && internalPages.has(url.hostname)
        ? url.hostname : null;
    } catch {
      return null;
    }
  }
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
    const openByDomain = new Map();
    for (const t of tabs) {
      if (t.incognito) continue;
      const d = domainFromUrl(t.url || t.pendingUrl);
      if (!d) continue;
      const internalIcon = internalIconFromUrl(t.url || t.pendingUrl);
      const previous = openByDomain.get(d);
      const existing = previous || { openCount: 0, favIconUrl: "" };
      const tabIcon =
        typeof t.favIconUrl === "string" && t.favIconUrl.trim()
          ? t.favIconUrl.trim()
          : "";
      const favIconUrl = existing.favIconUrl || tabIcon;
      openByDomain.set(d, {
        openCount: existing.openCount + 1,
        favIconUrl,
        // Existing grouping is hostname-based. Mixed browser/web groups must
        // not acquire a browser-page icon from just one of their tabs.
        internalIcon: previous && previous.internalIcon !== internalIcon ? null : internalIcon,
      });
    }

    const thresholdMinutes = Math.max(
      1,
      Number(cfg.inactiveThresholdMinutes) || 30
    );
    const thresholdMs = thresholdMinutes * 60000;
    const nowTs = now();

    let inactiveCount = 0;
    if (cfg.enableInactiveSuggestion) {
      const inactiveTabs = tabs.filter((t) => {
        if (t.incognito) return false;
        if (t.pinned || t.audible) return false;
        if (t.active) return false;
        const last = t.lastAccessed || 0;
        if (last) return nowTs - last >= thresholdMs;
        return t.discarded === true;
      });
      inactiveCount = inactiveTabs.length;
    }

    const domains = Array.from(openByDomain.entries())
      .filter(
        ([, info]) => info.openCount >= cfg.suggestMinOpenTabsPerDomain
      )
      .sort((a, b) => b[1].openCount - a[1].openCount)
      .slice(0, 30)
      .map(([domain, info]) => ({
        kind: "domain",
        domain,
        openCount: info.openCount,
        favIconUrl: info.favIconUrl || null,
        internalIcon: info.internalIcon,
      }));

    const suggestions = [];
    if (inactiveCount) {
      suggestions.push({
        kind: "inactive",
        inactiveCount,
      });
    }
    suggestions.push(...domains);
    return suggestions;
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
          sendResponse({ ok: true, suggestions: await pcGetSuggestions() });
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
