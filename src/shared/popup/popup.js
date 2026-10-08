// SPDX-License-Identifier: MPL-2.0

// Popup: suggestions, keyword matches, the inactive review and settings.

(function () {
  const root = document.documentElement;
  const byId = (id) => document.getElementById(id);
  const all = (selector) => Array.from(document.querySelectorAll(selector));
  const msg = (type, payload) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, ...(payload || {}) }, (response) => {
          resolve(chrome.runtime.lastError ? { ok: false } : response || { ok: false });
        });
      } catch (_) { resolve({ ok: false }); }
    });
  const t = (key, values, options) =>
    typeof globalThis.ttMessage === "function" ? globalThis.ttMessage(key, values, options) : key;
  const number = (value) =>
    typeof globalThis.ttNumber === "function" ? globalThis.ttNumber(value) : String(value);
  const duration = (minutes, display) =>
    typeof globalThis.ttDuration === "function" ? globalThis.ttDuration(minutes, display) : String(minutes);
  const age = (minutes) =>
    typeof globalThis.ttAge === "function" ? globalThis.ttAge(minutes) : String(minutes);

  const STORAGE_KEY = "pc.settings";
  const DEFAULTS = {
    enableInactiveSuggestion: true,
    inactiveThresholdMinutes: 120,
    keepPinnedTabs: true,
    theme: "system",
    accent: "purple",
  };
  // The inactivity choices, in minutes: 30 minutes to 1 week.
  const THRESHOLDS = [30, 60, 120, 240, 480, 1440, 4320, 10080];
  // How long a result shows. It takes the footer's place, so one without Undo
  // gives the footer back sooner.
  const TOAST_MS = 7000;
  const NOTE_MS = 4000;
  // Tick marks: one per open tab in a 64px track.
  const TICK_TRACK = 64;

  // Accent presets, light then dark: accent, hover, text on accent, tick marks,
  // keyword highlight, focus ring. Purple is the stylesheet's own default.
  const ACCENTS = {
    purple: [["#7054d8", "#5739bf", "#ffffff", "#b9abec", "#e3dcfb", "rgba(112,84,216,.24)"], ["#957dff", "#aa96ff", "#15161b", "#5d4eaf", "#3a3270", "rgba(149,125,255,.32)"]],
    blue: [["#106bde", "#0053b7", "#ffffff", "#91b8f2", "#d0e3ff", "rgba(16,107,222,.24)"], ["#4b94ff", "#70aaff", "#15161b", "#215eb3", "#163c72", "rgba(75,148,255,.32)"]],
    green: [["#008249", "#006738", "#ffffff", "#85c89c", "#ccead5", "rgba(0,130,73,.24)"], ["#00b366", "#48c47e", "#15161b", "#007440", "#004a27", "rgba(0,179,102,.32)"]],
    orange: [["#bd4d00", "#993c00", "#ffffff", "#eaa37c", "#fbdac5", "rgba(189,77,0,.24)"], ["#f77211", "#fa934e", "#15161b", "#a14200", "#662801", "rgba(247,114,17,.32)"]],
    pink: [["#c22a6c", "#a40055", "#ffffff", "#e89db4", "#fbd6e0", "rgba(194,42,108,.24)"], ["#ec5a91", "#f37da5", "#15161b", "#9f325d", "#66203b", "rgba(236,90,145,.32)"]],
    graphite: [["#494d55", "#32353d", "#ffffff", "#a8abb1", "#dadce0", "rgba(73,77,85,.24)"], ["#c0c4cc", "#d7dbe2", "#15161b", "#656970", "#3f4249", "rgba(192,196,204,.32)"]],
  };
  const ACCENT_PROPS = ["--accent", "--accent-2", "--on-accent", "--bar", "--hit", "--ring"];

  // Which blocks each view shows. "search" is the main view with text in the field.
  const BLOCKS = {
    main: ["pc-header", "pc-suggest-head", "pc-suggest-list", "pc-foot-main"],
    search: ["pc-header", "pc-match-head", "pc-match-list", "pc-foot-main"],
    inactive: ["pc-bar-inactive", "pc-inactive-control", "pc-inactive-list", "pc-foot-inactive"],
    settings: ["pc-bar-settings", "pc-tab-settings", "pc-foot-settings"],
  };

  function normalizeSettings(raw) {
    const settings = { ...DEFAULTS, ...(raw || {}) };
    delete settings.enableSuggestions;
    // The background applies the same floor: a shorter time saved by an older
    // version is raised to the first step the stepper offers.
    settings.inactiveThresholdMinutes = Math.max(
      THRESHOLDS[0],
      Number(settings.inactiveThresholdMinutes) || DEFAULTS.inactiveThresholdMinutes
    );
    return settings;
  }

  let savedSettings = { ...DEFAULTS };
  let view = "main";            // "main" | "inactive" | "settings"
  let query = "";               // trimmed field text; when not empty the main view lists matches
  let overview = null;          // { openTabs, sites, inactive, duplicates }
  let sites = [];               // [{ domain, openCount, favIconUrl }], most tabs first
  let suggestionsState = "loading";   // "loading" | "ready" | "failed"
  let matches = null;           // tabs listed for `matchesFor`
  let matchesFor = "";
  let matchesFailed = false;
  let inactiveTabs = null;      // tabs listed in the review
  let inactiveFailed = false;
  let totalClosed = null;
  let lastClosedTabs = [];      // undo snapshot; lives as long as its result bar
  let busy = false;
  let currentTheme = "system";

  /* ---------- Small DOM helpers ---------- */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const SVG_NS = "http://www.w3.org/2000/svg";
  function crossIcon() {
    const svg = document.createElementNS(SVG_NS, "svg");
    const attributes = {
      width: "10", height: "10", viewBox: "0 0 10 10", fill: "none", stroke: "currentColor",
      "stroke-width": "1.5", "stroke-linecap": "round", "aria-hidden": "true",
    };
    for (const [name, value] of Object.entries(attributes)) svg.setAttribute(name, value);
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M1.5 1.5l7 7M8.5 1.5l-7 7");
    svg.append(path);
    return svg;
  }

  function letterTile(domain) {
    const tile = el("span", "fav tile", String(domain || "?").charAt(0).toUpperCase());
    tile.setAttribute("aria-hidden", "true");
    return tile;
  }

  // The tab's own icon, or a letter tile when it has none or it fails to load.
  function favicon(url, domain) {
    const iconUrl = typeof url === "string" ? url.trim() : "";
    if (!iconUrl) return letterTile(domain);
    const img = el("img", "fav");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => img.replaceWith(letterTile(domain)));
    img.src = iconUrl;
    return img;
  }

  const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // A span with the first occurrence of `needle` wrapped in <mark>.
  function markedText(className, text, needle) {
    const node = el("span", className);
    const hit = needle ? new RegExp(escapeRegExp(needle), "i").exec(text) : null;
    if (!hit) {
      node.textContent = text;
      return node;
    }
    node.append(
      text.slice(0, hit.index),
      el("mark", "", hit[0]),
      text.slice(hit.index + hit[0].length)
    );
    return node;
  }

  // Add .fade only while the list really overflows. Measure without the class:
  // the class itself adds end space.
  function markOverflow(list) {
    list.classList.remove("fade");
    list.classList.toggle("fade", list.scrollHeight > list.clientHeight);
  }

  /* ---------- Result bar ---------- */

  let toastTimer = null;
  let toastMs = TOAST_MS;
  let coveredFocus = null;      // [footer, button]: a footer button that had focus when a result covered it

  function armToast() {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, toastMs);
  }

  // The result takes the footer's place while it shows, so it never covers a
  // row the user may want to close next.
  function showToast(text, { undo = false } = {}) {
    if (!undo) lastClosedTabs = [];
    const offersUndo = undo && lastClosedTabs.length > 0;
    byId("pc-status").textContent = text || "";
    byId("pc-undo-close").hidden = !offersUndo;
    byId("pc-toast-dismiss").hidden = false;
    toastMs = offersUndo ? TOAST_MS : NOTE_MS;
    const covered = [["pc-foot-main", "pc-sort-tabs-quick"], ["pc-foot-inactive", "pc-inactive-close"]]
      .find(([, id]) => byId(id) === document.activeElement);
    if (covered) coveredFocus = covered;
    byId("pc-bottom").classList.toggle("has-result", true);
    byId("pc-toast").classList.toggle("is-open", true);
    armToast();
  }

  // Closed by the user (× or Escape) rather than timed out. If focus was on
  // the result, it moves to the footer the result gives back.
  function dismissToast() {
    const hadFocus = ["pc-toast-dismiss", "pc-undo-close"].some((id) => byId(id) === document.activeElement);
    if (hadFocus) document.activeElement.blur();
    hideToast();                 // hands focus back to a footer button it covered, if any
    if (!hadFocus || (document.activeElement && document.activeElement !== document.body)) return;
    const footer = [["pc-foot-main", "pc-sort-tabs-quick"], ["pc-foot-inactive", "pc-inactive-close"]]
      .find(([id]) => !byId(id).hidden);
    if (footer) focusOn(footer[1]);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toastTimer = null;
    lastClosedTabs = [];
    byId("pc-toast").classList.toggle("is-open", false);
    byId("pc-bottom").classList.toggle("has-result", false);
    byId("pc-undo-close").hidden = true;
    byId("pc-toast-dismiss").hidden = true;
    byId("pc-status").textContent = "";
    // A keyboard user whose button the result covered gets it back, if its
    // footer is still the one showing and focus has not gone elsewhere.
    const covered = coveredFocus;
    coveredFocus = null;
    const focusLost = !document.activeElement || document.activeElement === document.body;
    if (covered && focusLost && !byId(covered[0]).hidden) focusOn(covered[1]);
  }

  function closeStatus(key, result) {
    const text = t(key, { count: result.closedCount });
    return result.failedCount ? text + " · " + t("closeFailed") : text;
  }

  /* ---------- One cleanup at a time ---------- */

  function applyBusy() {
    byId("pc-close").disabled = busy;
    byId("pc-undo-close").disabled = busy;
    byId("pc-close-duplicates").disabled = busy || !overview || !overview.duplicates;
    byId("pc-inactive-close").disabled = busy || !inactiveTabs || !inactiveTabs.length;
    for (const row of byId("pc-sites").children) row.disabled = busy;
    for (const id of ["pc-match-rows", "pc-inactive-rows"]) {
      for (const row of byId(id).children) {
        const close = row.children[row.children.length - 1];
        if (close) close.disabled = busy;
      }
    }
  }

  async function runCleanup(action) {
    // Enter, a row and Undo can arrive while an earlier action awaits the
    // background. Keep the undo snapshot tied to one completed action.
    if (busy) return;
    busy = true;
    applyBusy();
    try { return await action(); }
    finally {
      busy = false;
      applyBusy();
    }
  }

  /* ---------- Settings ---------- */

  const darkQuery = typeof globalThis.matchMedia === "function"
    ? globalThis.matchMedia("(prefers-color-scheme: dark)")
    : null;

  function isDark() {
    return currentTheme === "dark" || (currentTheme === "system" && !!darkQuery && darkQuery.matches);
  }

  function applyTheme(settings) {
    currentTheme = settings.theme === "light" || settings.theme === "dark" ? settings.theme : "system";
    root.setAttribute("data-theme", currentTheme);
    const accent = ACCENTS[settings.accent] ? settings.accent : "purple";
    const shade = isDark() ? 1 : 0;
    ACCENT_PROPS.forEach((property, index) => {
      // Purple is the stylesheet's default, so it needs no inline override.
      if (accent === "purple") root.style.removeProperty(property);
      else root.style.setProperty(property, ACCENTS[accent][shade][index]);
    });
    all("[data-accent-value]").forEach((swatch) => {
      const name = swatch.dataset.accentValue;
      if (ACCENTS[name]) swatch.style.setProperty("--sw", ACCENTS[name][shade][0]);
      swatch.setAttribute("aria-pressed", name === accent ? "true" : "false");
    });
  }

  function thresholdOf(settings) {
    return Math.max(THRESHOLDS[0], Number(settings.inactiveThresholdMinutes) || DEFAULTS.inactiveThresholdMinutes);
  }

  // The next choice below or above the saved value. A value saved by an older
  // version (45, say) is shown as it is and steps to its nearest neighbours.
  function nextThreshold(minutes, direction) {
    return direction < 0
      ? [...THRESHOLDS].reverse().find((value) => value < minutes)
      : THRESHOLDS.find((value) => value > minutes);
  }

  function syncSettingsForm(settings) {
    all("[data-theme-value]").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.themeValue === currentTheme ? "true" : "false");
    });
    const minutes = thresholdOf(settings);
    all("[data-threshold-value]").forEach((output) => { output.textContent = duration(minutes); });
    all("[data-threshold-step]").forEach((button) => {
      const next = nextThreshold(minutes, Number(button.dataset.thresholdStep));
      const label = duration(next === undefined ? minutes : next);
      button.disabled = next === undefined;
      button.title = label;
      button.setAttribute("aria-label", label);
    });
    byId("pc-inactive-hint").textContent = duration(minutes, "short") + "+";
    byId("pc-keep-pinned").setAttribute("aria-checked", settings.keepPinnedTabs !== false ? "true" : "false");
  }

  function applySettings(settings) {
    savedSettings = settings;
    applyTheme(settings);
    syncSettingsForm(settings);
  }

  async function readSettings() {
    const raw = await new Promise((resolve) => {
      try {
        chrome.storage.local.get(STORAGE_KEY, (result) => {
          resolve(chrome.runtime.lastError ? null : result || {});
        });
      } catch (_) { resolve(null); }
    });
    if (raw === null) {
      showToast(t("closeFailed"));
      return savedSettings;
    }
    return normalizeSettings(raw[STORAGE_KEY]);
  }

  async function writeSettings(patch) {
    // The background serializes settings patches from every open popup.
    const out = await msg("pc:updateSettings", { payload: patch || {} });
    if (!out?.ok || !out.settings) {
      applySettings(savedSettings);
      showToast(t("closeFailed"));
      return null;
    }
    applySettings(normalizeSettings(out.settings));
    return savedSettings;
  }

  /* ---------- Views ---------- */

  function showView() {
    const shown = view === "main" && query ? "search" : view;
    for (const ids of Object.values(BLOCKS)) for (const id of ids) byId(id).hidden = true;
    for (const id of BLOCKS[shown]) byId(id).hidden = false;
  }

  // Returns false when the element cannot take focus (hidden or disabled).
  function focusOn(id) {
    const target = byId(id);
    if (!target || target.disabled || target.hidden || typeof target.focus !== "function") return false;
    target.focus();
    return true;
  }

  // The control that opened a view is hidden with it, so move focus on purpose.
  function openView(name, focusId) {
    view = name;
    hideToast();
    showView();
    let loading;
    if (name === "inactive") {
      inactiveTabs = null;
      renderInactive();
      loading = loadInactive();
    }
    if (name === "settings") renderStats();
    if (!focusOn(focusId)) focusOn("pc-query");
    return loading;
  }

  /* ---------- Rendering ---------- */

  function renderHeader() {
    byId("pc-open-count").textContent = overview ? t("tabCount", { count: overview.openTabs }) : "";
    byId("pc-site-count").textContent = overview ? t("siteCount", { count: overview.sites }) : "";
  }

  function renderStats() {
    const text = totalClosed === null ? "" : t("closedCountShort", { count: totalClosed });
    byId("pc-closed-count").textContent = text;
    byId("pc-settings-closed").textContent = text;
  }

  function siteRow(item) {
    const domain = String(item.domain || "");
    const count = item.openCount || 0;
    const row = el("button", "row site");
    row.type = "button";
    row.dataset.domain = domain;
    row.disabled = busy;
    row.style.setProperty("--n", String(count));
    // The row shows a bare number; keep the full translated meaning in the
    // accessible name and hover text.
    const description = t("closeSiteLabel", { site: domain }) + " · " + t("openCount", { count });
    row.title = description;
    row.setAttribute("aria-label", description);
    const host = el("span", "host", domain);
    host.dir = "ltr";
    const ticks = el("span", "ticks");
    ticks.append(el("span", "bar"));
    const mark = el("span", "x");
    mark.append(crossIcon());
    row.append(favicon(item.favIconUrl, domain), host, ticks, el("span", "count", number(count)), mark);
    row.addEventListener("click", () => runCleanup(() => closeSite(domain)));
    return row;
  }

  function renderSuggestions() {
    const list = byId("pc-suggest-list");
    const inactive = overview ? overview.inactive : 0;
    const duplicates = overview ? overview.duplicates : 0;

    const inactiveRow = byId("pc-inactive-row");
    inactiveRow.hidden = savedSettings.enableInactiveSuggestion === false;
    inactiveRow.disabled = !inactive;
    byId("pc-inactive-count").textContent = overview ? number(inactive) : "";
    const inactiveLabel = t("inactive") + " · " + t("openCount", { count: inactive });
    inactiveRow.title = inactiveLabel;
    inactiveRow.setAttribute("aria-label", inactiveLabel);

    const duplicatesRow = byId("pc-close-duplicates");
    byId("pc-duplicates-count").textContent = overview ? number(duplicates) : "";
    const duplicatesLabel = t("closeDuplicates") + " · " + t("openCount", { count: duplicates });
    duplicatesRow.title = duplicatesLabel;
    duplicatesRow.setAttribute("aria-label", duplicatesLabel);

    // One 4px mark per tab. Past 16 tabs on one site the marks narrow to 3px;
    // past 21 the track becomes a plain proportional bar.
    const most = sites.length ? Math.max(1, sites[0].openCount) : 1;
    const whole = Math.min(4, Math.floor(TICK_TRACK / most));
    list.style.setProperty("--u", (whole >= 3 ? whole : TICK_TRACK / most) + "px");
    list.style.setProperty("--g", (whole >= 3 ? 1 : 0) + "px");

    byId("pc-sites").replaceChildren(...sites.map(siteRow));
    byId("pc-sites-rule").hidden = sites.length === 0;
    const empty = byId("pc-suggest-empty");
    empty.hidden = suggestionsState === "loading" || sites.length > 0;
    empty.textContent = suggestionsState === "failed" ? t("suggestionsFailed") : t("noSuggestions");
    applyBusy();
    markOverflow(list);
  }

  // Title on the first line, site on the second. When the keyword matched only
  // further along the address, show that part of the address so the row still
  // shows why it is listed.
  function tabRow(tab, { needle = "", meta = "", onClose }) {
    const row = el("div", "tab");
    row.dataset.tabId = String(tab.id);
    const title = tab.title || tab.url || "";
    let place = tab.domain || tab.url || "";
    if (needle) {
      const rx = new RegExp(escapeRegExp(needle), "i");
      if (!rx.test(title) && !rx.test(place)) {
        try {
          const address = new URL(tab.url);
          const longer = place + address.pathname + address.search;
          if (rx.test(longer)) place = longer;
        } catch (_) { /* keep the site */ }
      }
    }
    const text = el("span", "tab-text");
    const host = markedText("tab-host", place, needle);
    host.dir = "ltr";
    text.append(markedText("tab-title", title, needle), host);
    const close = el("button", "tab-close");
    close.type = "button";
    close.disabled = busy;
    const label = t("close") + ": " + title;
    close.title = label;
    close.setAttribute("aria-label", label);
    close.append(crossIcon());
    close.addEventListener("click", () => runCleanup(() => onClose(tab)));
    row.append(favicon(tab.favIconUrl, tab.domain), text, el("span", "tab-meta", meta), close);
    return row;
  }

  // The clear button exists while the field has text; the Close button while
  // that text has matches. Until the list for a new keystroke arrives, the
  // button keeps the previous count rather than blinking.
  function renderField() {
    const count = query && matches ? matches.length : 0;
    byId("pc-query-clear").hidden = !byId("pc-query").value;
    byId("pc-close").hidden = count === 0;
    byId("pc-close-count").textContent = number(count);
  }

  function renderMatches() {
    const list = byId("pc-match-list");
    const tabs = matches || [];
    // A domain is matched against the site without "www.", so mark it that way too.
    const needle = matchesFor.includes(".") ? matchesFor.replace(/^www\./i, "") : matchesFor;
    byId("pc-match-query").textContent = query;
    byId("pc-match-count").textContent = matches ? t("openCount", { count: tabs.length }) : "";
    byId("pc-match-rows").replaceChildren(
      ...tabs.map((tab) => tabRow(tab, { needle, onClose: closeMatch }))
    );
    const empty = byId("pc-match-empty");
    empty.hidden = !(matches && tabs.length === 0);
    empty.textContent = matchesFailed ? t("suggestionsFailed") : t("noMatches");
    renderField();
    applyBusy();
    markOverflow(list);
  }

  function renderInactive() {
    const list = byId("pc-inactive-list");
    const tabs = inactiveTabs || [];
    byId("pc-inactive-meta").textContent = inactiveTabs ? t("openCount", { count: tabs.length }) : "";
    byId("pc-inactive-rows").replaceChildren(
      ...tabs.map((tab) => tabRow(tab, {
        meta: tab.idleMinutes === null || tab.idleMinutes === undefined ? "" : age(tab.idleMinutes),
        onClose: closeInactiveTab,
      }))
    );
    const empty = byId("pc-inactive-empty");
    empty.hidden = !(inactiveTabs && tabs.length === 0);
    empty.textContent = inactiveFailed ? t("suggestionsFailed") : t("noInactive");
    byId("pc-inactive-close-count").textContent = inactiveTabs ? number(tabs.length) : "";
    applyBusy();
    markOverflow(list);
  }

  /* ---------- Loading ---------- */

  let suggestionsToken = 0;
  let matchesToken = 0;
  let inactiveToken = 0;

  async function loadSuggestions() {
    const token = ++suggestionsToken;
    const out = await msg("pc:getSuggestions");
    if (token !== suggestionsToken) return;
    if (out?.ok) {
      overview = out.overview || null;
      sites = (Array.isArray(out.suggestions) ? out.suggestions : []).filter((item) => item.kind === "domain");
      suggestionsState = "ready";
    } else {
      overview = null;
      sites = [];
      suggestionsState = "failed";
    }
    renderHeader();
    renderSuggestions();
  }

  async function loadMatches() {
    const token = ++matchesToken;
    const text = query;
    if (!text) {
      matches = null;
      matchesFor = "";
      renderMatches();
      return;
    }
    const out = await msg("pc:previewKeyword", { query: text });
    if (token !== matchesToken) return;
    matchesFailed = !(out?.ok && Array.isArray(out.tabs));
    matches = matchesFailed ? [] : out.tabs;
    matchesFor = text;
    renderMatches();
  }

  async function loadInactive() {
    const token = ++inactiveToken;
    const out = await msg("pc:previewInactive");
    if (token !== inactiveToken) return;
    inactiveFailed = !(out?.ok && Array.isArray(out.tabs));
    inactiveTabs = inactiveFailed ? [] : out.tabs;
    renderInactive();
  }

  async function loadStats() {
    const out = await msg("pc:getStats");
    if (!out?.ok) return;
    totalClosed = out.stats?.totalTabsEaten || 0;
    renderStats();
  }

  function refresh() {
    const jobs = [loadSuggestions()];
    if (query) jobs.push(loadMatches());
    if (view === "inactive") jobs.push(loadInactive());
    return Promise.all(jobs);
  }

  let refreshTimer = null;
  function scheduleRefresh() {
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    // Restored tabs can first appear as about:blank, especially in Firefox.
    // Wait for navigation events rather than leaving the first lists cached.
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refresh();
    }, 80);
  }

  function bindTabUpdates() {
    const tabsApi = chrome?.tabs;
    if (!tabsApi) return;
    tabsApi.onCreated?.addListener((tab) => {
      if (!tab?.incognito) scheduleRefresh();
    });
    tabsApi.onRemoved?.addListener(scheduleRefresh);
    tabsApi.onReplaced?.addListener(scheduleRefresh);
    tabsApi.onUpdated?.addListener((_tabId, changes, tab) => {
      if (tab?.incognito) return;
      // A page's icon usually arrives after the page has finished loading.
      if (changes?.url || changes?.status === "complete" || changes?.favIconUrl) scheduleRefresh();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const next = changes[STORAGE_KEY]?.newValue;
    if (!next) return;
    applySettings(normalizeSettings(next));
    refresh();
  });

  /* ---------- Actions ---------- */

  // Shared ending for every close: result bar with Undo, then fresh numbers.
  async function finishClose(out, key) {
    if (!out?.ok) {
      showToast(t("closeFailed"));
    } else {
      const closed = Array.isArray(out.closedTabs) ? out.closedTabs : [];
      lastClosedTabs = closed;
      showToast(closeStatus(key, out), { undo: closed.length > 0 });
    }
    await Promise.all([loadStats(), refresh()]);
  }

  function clearQuery() {
    byId("pc-query").value = "";
    query = "";
    loadMatches();      // with no text this only empties the list and hides Close
    showView();
  }

  async function closeSite(domain) {
    const out = await msg("pc:closeByDomain", { query: domain });
    await finishClose(out, "closedCount");
  }

  // Enter and the Close button: close the tabs listed for the text in the field.
  async function closeMatches() {
    const text = query;
    if (!text) return;
    // Enter can arrive before the list for the latest keystroke. Wait for it
    // rather than closing tabs that were never shown.
    if (matchesFor !== text || !matches) await loadMatches();
    if (query !== text || matchesFor !== text || !matches) return;
    if (matchesFailed) {
      showToast(t("closeFailed"));
      return;
    }
    if (!matches.length) return;
    const out = await msg("pc:closeByKeyword", { query: text, tabIds: matches.map((tab) => tab.id) });
    if (out?.ok) {
      clearQuery();
      focusOn("pc-query");
    }
    await finishClose(out, "closedCount");
  }

  async function closeMatch(tab) {
    const out = await msg("pc:closeByKeyword", { query: matchesFor, tabIds: [tab.id] });
    await finishClose(out, "closedCount");
  }

  async function closeInactiveListed() {
    if (!inactiveTabs || !inactiveTabs.length) return;
    const out = await msg("pc:closeInactive", { tabIds: inactiveTabs.map((tab) => tab.id) });
    if (out?.ok) {
      view = "main";
      showView();
      focusOn("pc-query");
    }
    await finishClose(out, "closedInactive");
  }

  async function closeInactiveTab(tab) {
    const out = await msg("pc:closeInactive", { tabIds: [tab.id] });
    await finishClose(out, "closedCount");
  }

  async function closeDuplicates() {
    const out = await msg("pc:closeDuplicates");
    if (out?.ok && !out.closedCount) {
      showToast(t("noDuplicates"));
      await refresh();
      return;
    }
    await finishClose(out, "closedDuplicates");
  }

  async function restoreLastClose() {
    if (!lastClosedTabs.length) return;
    const out = await msg("pc:restoreTabs", { tabs: lastClosedTabs });
    if (!out?.ok) {
      showToast(t("undoFailed"), { undo: true });
      return;
    }
    const restored = out.restoredCount || 0;
    lastClosedTabs = Array.isArray(out.remainingTabs) ? out.remainingTabs : [];
    if (restored) {
      const text = t("restoredCount", { count: restored });
      // Tabs that could not be restored stay in the snapshot for another try.
      if (lastClosedTabs.length) showToast(text + " · " + t("undoFailed"), { undo: true });
      else showToast(text);
    } else if (lastClosedTabs.length) {
      showToast(t("undoFailed"), { undo: true });
    } else {
      showToast(t("nothingToRestore"));
    }
    if (restored) await Promise.all([loadStats(), refresh()]);
  }

  async function sortTabs() {
    const button = byId("pc-sort-tabs-quick");
    button.disabled = true;
    try {
      const out = await msg("pc:sortTabsByOpenCount");
      if (!out?.ok) showToast(t("sortFailed"));
      else if (out.sortedCount) showToast(t("sortedCount", { count: out.sortedCount }));
      else showToast(t("nothingToSort"));
    } finally {
      button.disabled = false;
    }
    await refresh();
  }

  /* ---------- Wiring ---------- */

  function wireUI() {
    const field = byId("pc-query");
    // Handlers return the promise of the work they start, so tests can await it.
    field.addEventListener("input", () => {
      query = field.value.trim();
      hideToast();
      showView();
      byId("pc-match-query").textContent = query;
      renderField();
      return loadMatches();
    });
    field.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return undefined;
      event.preventDefault();
      return runCleanup(closeMatches);
    });
    byId("pc-query-clear").addEventListener("click", () => {
      clearQuery();
      focusOn("pc-query");
    });
    byId("pc-close").addEventListener("click", () => runCleanup(closeMatches));

    byId("pc-settings-toggle").addEventListener("click", () => openView("settings", "pc-settings-back"));
    byId("pc-settings-back").addEventListener("click", () => openView("main", "pc-settings-toggle"));
    byId("pc-inactive-row").addEventListener("click", () => openView("inactive", "pc-inactive-back"));
    byId("pc-inactive-back").addEventListener("click", () => openView("main", "pc-inactive-row"));

    byId("pc-close-duplicates").addEventListener("click", () => runCleanup(closeDuplicates));
    byId("pc-inactive-close").addEventListener("click", () => runCleanup(closeInactiveListed));
    byId("pc-undo-close").addEventListener("click", () => runCleanup(restoreLastClose));
    byId("pc-toast-dismiss").addEventListener("click", dismissToast);
    byId("pc-sort-tabs-quick").addEventListener("click", sortTabs);

    // The result bar stays while it is pointed at or holds focus.
    const toast = byId("pc-toast");
    for (const name of ["mouseenter", "focusin"]) toast.addEventListener(name, () => clearTimeout(toastTimer));
    for (const name of ["mouseleave", "focusout"]) {
      toast.addEventListener(name, () => { if (toastTimer !== null) armToast(); });
    }
    toast.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();      // Escape would otherwise close the whole popup
      dismissToast();
    });

    all("[data-theme-value]").forEach((button) => {
      button.addEventListener("click", () => writeSettings({ theme: button.dataset.themeValue }));
    });
    all("[data-accent-value]").forEach((button) => {
      button.addEventListener("click", () => writeSettings({ accent: button.dataset.accentValue }));
    });
    all("[data-threshold-step]").forEach((button) => {
      button.addEventListener("click", async () => {
        const next = nextThreshold(thresholdOf(savedSettings), Number(button.dataset.thresholdStep));
        if (next === undefined) return;
        if (await writeSettings({ inactiveThresholdMinutes: next })) await refresh();
      });
    });
    byId("pc-keep-pinned").addEventListener("click", async () => {
      if (await writeSettings({ keepPinnedTabs: savedSettings.keepPinnedTabs === false })) await refresh();
    });
    byId("pc-reset-stats").addEventListener("click", async () => {
      const out = await msg("pc:resetStats");
      if (!out?.ok) showToast(t("closeFailed"));
      await loadStats();
    });

    // "System" follows the browser's light or dark setting while the popup is open.
    darkQuery?.addEventListener?.("change", () => applyTheme(savedSettings));
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (typeof globalThis.ttLocalizeDocument === "function") {
      globalThis.ttLocalizeDocument(document);
    }
    const version = chrome.runtime.getManifest?.().version;
    byId("pc-version").textContent = version ? "TabTools " + version : "TabTools";
    applySettings(await readSettings());
    wireUI();
    bindTabUpdates();
    showView();
    await Promise.all([loadStats(), refresh()]);
  });
})();
