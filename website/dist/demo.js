// SPDX-License-Identifier: MPL-2.0
// The working popup on the home page. It closes and sorts a set of sample tabs
// held in this page, by the rules the extension uses, and never touches the
// visitor's own tabs. The first half is the rules; the generator also loads it
// to draw the starting state into the HTML, so the page reads the same before
// this script runs and without it.
(function (root) {
  'use strict';

  const THRESHOLDS = [30, 60, 120, 240, 480, 1440, 4320, 10080];   // minutes, as in the popup
  const ACCENTS = ['purple', 'blue', 'green', 'orange', 'pink', 'graphite'];
  const THEMES = ['system', 'light', 'dark'];
  const RECENT_MAX = 25;                                            // as many as the extension keeps

  const hostOf = tab => tab.url.split('/')[0];
  const letterOf = host => host.replace(/^www\./, '').charAt(0).toUpperCase();

  // One entry per site, the site with the most tabs first, then by name.
  function sites(tabs) {
    const counts = new Map();
    for (const tab of tabs) counts.set(hostOf(tab), (counts.get(hostOf(tab)) || 0) + 1);
    return [...counts].map(([host, count]) => ({ host, count }))
      .sort((a, b) => b.count - a.count || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
  }

  // Copies are tabs with the same whole address. The copy in view stays; when
  // none is in view the first in tab order stays.
  function duplicates(tabs) {
    const groups = new Map();
    for (const tab of tabs) {
      if (!groups.has(tab.url)) groups.set(tab.url, []);
      groups.get(tab.url).push(tab);
    }
    const extra = new Set();
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const spare = group.filter(tab => !tab.active);
      if (spare.length === group.length) spare.shift();
      for (const tab of spare) extra.add(tab.id);
    }
    return tabs.filter(tab => extra.has(tab.id));
  }

  // Tabs left for at least the chosen time, longest first. The tab in view stays.
  function inactive(tabs, thresholdMinutes) {
    return tabs.filter(tab => !tab.active && tab.idle >= thresholdMinutes)
      .sort((a, b) => b.idle - a.idle);
  }

  // Text with a dot names a site and its subdomains. Any other text matches
  // tab titles and addresses, ignoring case.
  function matches(tabs, query) {
    const text = String(query || '').trim();
    if (!text) return [];
    if (text.includes('.')) {
      const wanted = text.toLowerCase().replace(/^www\./, '');
      return tabs.filter(tab => {
        const host = hostOf(tab).replace(/^www\./, '');
        return host === wanted || host.endsWith('.' + wanted);
      });
    }
    const needle = text.toLowerCase();
    return tabs.filter(tab => tab.title.toLowerCase().includes(needle) || tab.url.toLowerCase().includes(needle));
  }

  // Sites with the most tabs first, then by name; tabs of one site keep their
  // order. `moved` is how many tabs ended up in a different place.
  function sorted(tabs) {
    const rank = new Map(sites(tabs).map((site, index) => [site.host, index]));
    const order = tabs.map((tab, index) => ({ tab, index }))
      .sort((a, b) => rank.get(hostOf(a.tab)) - rank.get(hostOf(b.tab)) || a.index - b.index)
      .map(item => item.tab);
    return { tabs: order, moved: order.filter((tab, index) => tabs[index] !== tab).length };
  }

  // Recently closed: the tabs of the latest close first, each with the place it
  // had in the window, and never more than the extension keeps.
  function remember(recent, tabs, order) {
    const entries = tabs.map(tab => ({ ...tab, active: false, index: order.indexOf(tab.id) }));
    return [...entries, ...recent].slice(0, RECENT_MAX);
  }

  // A reopened tab goes back to the place it had, behind the tab in view.
  function reopened(tabs, entry) {
    const { index, ...tab } = entry;
    const next = tabs.slice();
    next.splice(Math.max(0, Math.min(index, next.length)), 0, tab);
    return next;
  }

  // The next choice below or above the current time, or undefined at an end.
  function step(minutes, direction) {
    return direction < 0
      ? [...THRESHOLDS].reverse().find(value => value < minutes)
      : THRESHOLDS.find(value => value > minutes);
  }

  // "2 hours": the largest unit that divides the value exactly.
  function duration(minutes) {
    if (minutes % 10080 === 0) return { value: minutes / 10080, unit: 'week' };
    if (minutes % 1440 === 0) return { value: minutes / 1440, unit: 'day' };
    if (minutes % 60 === 0) return { value: minutes / 60, unit: 'hour' };
    return { value: minutes, unit: 'minute' };
  }

  // "11 hr": whole units, rounded down.
  function age(minutes) {
    if (minutes >= 1440) return { value: Math.floor(minutes / 1440), unit: 'day' };
    if (minutes >= 60) return { value: Math.floor(minutes / 60), unit: 'hour' };
    return { value: minutes, unit: 'minute' };
  }

  function formatter(locale, messages) {
    const number = value => {
      try { return new Intl.NumberFormat(locale).format(value); } catch (_) { return String(value); }
    };
    const unit = ({ value, unit: name }, unitDisplay) => {
      try { return new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay }).format(value); }
      catch (_) { return String(value); }
    };
    const text = (key, values = {}) => {
      let message = messages[key];
      if (message && typeof message === 'object') {
        let category = 'other';
        try { category = new Intl.PluralRules(locale).select(Number(values.count)); } catch (_) {}
        message = message[category] ?? message.other;
      }
      return String(message ?? '').replace(/\{(\w+)\}/g, (_, name) =>
        name === 'count' ? number(values.count) : String(values[name] ?? ''));
    };
    return { number, unit, text };
  }

  const model = { THRESHOLDS, ACCENTS, THEMES, RECENT_MAX, hostOf, letterOf, sites, duplicates, inactive, matches, sorted, remember, reopened, step, duration, age, formatter };
  if (typeof module === 'object' && module.exports) { module.exports = model; return; }
  if (!root.document) return;

  /* ---------- The page ---------- */

  const document = root.document;
  const frame = document.querySelector('[data-demo]');
  if (!frame) return;
  let data;
  try { data = JSON.parse(document.getElementById('locale-data').textContent).demo; } catch (_) {}
  if (!data || !Array.isArray(data.tabs)) return;

  const { text, unit, number } = formatter(data.locale, data.messages);
  const $ = selector => frame.querySelector(selector);
  const $$ = selector => Array.from(frame.querySelectorAll(selector));
  const calm = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: true };
  const touch = root.matchMedia ? root.matchMedia('(pointer: coarse)') : { matches: false };
  const UNDO_MS = 7000;
  const NOTE_MS = 4000;      // a result without Undo gives the footer back sooner, as in the popup
  const LEAVE_MS = 240;

  const state = {
    tabs: data.tabs.map(tab => ({ ...tab })),
    threshold: data.threshold,
    view: 'main',
    undo: null,        // { tabs, order } for the latest close
    recent: [],        // what was closed and has not been brought back, latest first
    busy: false
  };

  const strip = $('[data-demo-strip]');
  const query = $('[data-pp-query]');
  const toast = $('[data-pp-toast]');
  const status = $('[data-pp-status]');
  const undoButton = $('[data-pp-undo]');
  const dismissButton = $('[data-pp-dismiss]');
  const template = name => $(`template[data-pp-template="${name}"]`).content.firstElementChild;

  function show(view) {
    state.view = view;
    for (const element of $$('[data-view]')) element.hidden = !element.dataset.view.split(' ').includes(view);
  }

  /* Tab strip */

  function drawStrip() {
    const present = new Map($$('[data-tab]').map(element => [element.dataset.tab, element]));
    let previous = null;
    for (const tab of state.tabs) {
      let element = present.get(String(tab.id));
      if (!element) {
        element = template('strip').cloneNode(true);
        element.dataset.tab = tab.id;
        element.dataset.host = hostOf(tab);
        element.querySelector('.pp-fav').textContent = letterOf(hostOf(tab));
      }
      present.delete(String(tab.id));
      element.classList.toggle('is-active', Boolean(tab.active));
      element.classList.remove('is-leaving');
      const wanted = previous ? previous.nextElementSibling : strip.firstElementChild;
      if (wanted !== element) strip.insertBefore(element, wanted);
      previous = element;
    }
    for (const element of present.values()) element.remove();
    const active = state.tabs.find(tab => tab.active);
    $('[data-demo-address]').textContent = active ? active.url : '';
  }

  function mark(ids) {
    const wanted = new Set(ids.map(String));
    for (const element of $$('[data-tab]')) element.classList.toggle('is-hit', wanted.has(element.dataset.tab));
  }

  /* Main view */

  function siteRow(site) {
    const row = template('site').cloneNode(true);
    const label = text('closeSiteLabel', { site: site.host }) + ' · ' + text('openCount', { count: site.count });
    row.dataset.host = site.host;
    row.title = label;
    row.setAttribute('aria-label', label);
    row.querySelector('.pp-fav').textContent = letterOf(site.host);
    row.querySelector('.pp-host').textContent = site.host;
    row.querySelector('.pp-count').textContent = number(site.count);
    const ticks = row.querySelector('.pp-ticks');
    for (let index = 0; index < site.count; index += 1) ticks.append(document.createElement('i'));
    return row;
  }

  function drawMain() {
    const list = sites(state.tabs);
    $('[data-pp-tabs]').textContent = text('tabCount', { count: state.tabs.length });
    $('[data-pp-sites]').textContent = text('siteCount', { count: list.length });

    const idle = inactive(state.tabs, state.threshold);
    const idleRow = $('[data-pp-inactive-row]');
    idleRow.disabled = idle.length === 0;
    $('[data-pp-inactive-hint]').textContent = unit(duration(state.threshold), 'short') + '+';
    $('[data-pp-inactive-count]').textContent = number(idle.length);
    const idleLabel = text('inactive') + ' · ' + text('openCount', { count: idle.length });
    idleRow.title = idleLabel;
    idleRow.setAttribute('aria-label', idleLabel);

    const copies = duplicates(state.tabs);
    const copyRow = $('[data-pp-duplicates-row]');
    copyRow.disabled = copies.length === 0;
    $('[data-pp-duplicates-count]').textContent = number(copies.length);
    const copyLabel = text('closeDuplicates') + ' · ' + text('openCount', { count: copies.length });
    copyRow.title = copyLabel;
    copyRow.setAttribute('aria-label', copyLabel);

    $('[data-pp-sites-rows]').replaceChildren(...list.map(siteRow));
    $('[data-pp-sites-rule]').hidden = list.length === 0;
    $('[data-pp-suggest-empty]').hidden = list.length !== 0;
    $('[data-pp-sort]').disabled = state.tabs.length < 2;
  }

  /* Tab rows: keyword matches and the inactive review */

  function highlighted(value, needle) {
    const fragment = document.createDocumentFragment();
    const at = needle ? value.toLowerCase().indexOf(needle.toLowerCase()) : -1;
    if (at < 0) { fragment.append(value); return fragment; }
    const hit = document.createElement('mark');
    hit.textContent = value.slice(at, at + needle.length);
    fragment.append(value.slice(0, at), hit, value.slice(at + needle.length));
    return fragment;
  }

  function tabRow(tab, { needle = '', meta = '' } = {}) {
    const row = template('tab').cloneNode(true);
    const host = hostOf(tab);
    row.dataset.id = tab.id;
    row.querySelector('.pp-fav').textContent = letterOf(host);
    const inTitle = needle && tab.title.toLowerCase().includes(needle.toLowerCase());
    const inHost = needle && host.toLowerCase().includes(needle.toLowerCase());
    row.querySelector('.pp-tab-title').append(highlighted(tab.title, inTitle ? needle : ''));
    // A keyword found only in the rest of the address shows the address.
    row.querySelector('.pp-tab-host').append(highlighted(needle && !inTitle && !inHost ? tab.url : host, needle));
    row.querySelector('.pp-tab-meta').textContent = meta;
    const button = row.querySelector('.pp-tab-close');
    const label = text('close') + ': ' + tab.title;
    button.title = label;
    button.setAttribute('aria-label', label);
    return row;
  }

  function drawMatches() {
    const typed = query.value;
    const found = matches(state.tabs, typed);
    const dotted = typed.trim().includes('.');
    const needle = dotted ? typed.trim().toLowerCase().replace(/^www\./, '') : typed.trim();
    $('[data-pp-match-query]').textContent = typed.trim();
    $('[data-pp-match-count]').textContent = text('openCount', { count: found.length });
    $('[data-pp-match-rows]').replaceChildren(...found.map(tab => tabRow(tab, { needle })));
    $('[data-pp-match-empty]').hidden = found.length !== 0;
    $('[data-pp-close]').hidden = found.length === 0;
    $('[data-pp-close-count]').textContent = number(found.length);
    mark(found.map(tab => tab.id));
  }

  function drawInactive() {
    const idle = inactive(state.tabs, state.threshold);
    $('[data-pp-inactive-meta]').textContent = text('openCount', { count: idle.length });
    $('[data-pp-inactive-rows]').replaceChildren(...idle.map(tab => tabRow(tab, { meta: unit(age(tab.idle), 'short') })));
    $('[data-pp-inactive-empty]').hidden = idle.length !== 0;
    const close = $('[data-pp-inactive-close]');
    close.disabled = idle.length === 0;
    $('[data-pp-inactive-close-count]').textContent = number(idle.length);
    mark(idle.map(tab => tab.id));
  }

  // One button per tab: the whole row reopens it.
  function recentRow(entry) {
    const row = template('recent').cloneNode(true);
    const host = hostOf(entry);
    const label = text('reopen') + ': ' + entry.title;
    row.dataset.id = entry.id;
    row.title = label;
    row.setAttribute('aria-label', label);
    row.querySelector('.pp-fav').textContent = letterOf(host);
    row.querySelector('.pp-tab-title').textContent = entry.title;
    row.querySelector('.pp-tab-host').textContent = host;
    return row;
  }

  function drawRecent() {
    const count = state.recent.length;
    $('[data-pp-recent-meta]').textContent = count ? text('tabCount', { count }) : '';
    $('[data-pp-recent-rows]').replaceChildren(...state.recent.map(recentRow));
    $('[data-pp-recent-empty]').hidden = count !== 0;
    $('[data-pp-recent-clear]').disabled = count === 0;
    mark([]);
  }

  function drawThreshold() {
    const label = unit(duration(state.threshold), 'long');
    for (const output of $$('[data-pp-threshold]')) output.textContent = label;
    for (const button of $$('[data-pp-step]')) {
      const next = step(state.threshold, Number(button.dataset.ppStep));
      button.disabled = next === undefined;
      const name = next === undefined ? label : unit(duration(next), 'long');
      button.title = name;
      button.setAttribute('aria-label', name);
    }
  }

  function draw() {
    // Some tab is always in view, as in a browser window.
    if (state.tabs.length && !state.tabs.some(tab => tab.active)) state.tabs[0].active = true;
    drawStrip();
    drawMain();
    drawThreshold();
    if (state.view === 'inactive') drawInactive();
    else if (state.view === 'typing') drawMatches();
    else if (state.view === 'recent') drawRecent();
    else mark([]);
    // The field's two buttons follow its text in every view: Clear while it
    // holds any text, spaces included, and Close only beside listed matches.
    $('[data-pp-clear]').hidden = query.value.length === 0;
    if (state.view !== 'typing') $('[data-pp-close]').hidden = true;
  }

  /* Result bar */

  let toastTimer = null;
  let toastMs = NOTE_MS;

  function armToast() {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, toastMs);
  }

  function showToast(message, offerUndo = false) {
    if (!offerUndo) state.undo = null;
    status.textContent = message;
    undoButton.hidden = !offerUndo;
    dismissButton.hidden = false;
    toastMs = offerUndo ? UNDO_MS : NOTE_MS;
    toast.classList.add('is-open');
    toast.parentElement.classList.add('has-result');
    armToast();
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toastTimer = null;
    const hadFocus = toast.contains(document.activeElement);
    state.undo = null;
    toast.classList.remove('is-open');
    toast.parentElement.classList.remove('has-result');
    undoButton.hidden = true;
    dismissButton.hidden = true;
    status.textContent = '';
    // Focus that was on the result goes to the footer the result gives back.
    if (!hadFocus) return;
    const footer = $$('[data-pp-sort], [data-pp-inactive-close], [data-pp-recent-clear]').find(button => !button.closest('[data-view]').hidden && !button.disabled);
    (footer || (state.view === 'recent' ? $('[data-pp-back="recent"]') : query)).focus();
  }

  /* Actions */

  function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, calm.matches ? 0 : milliseconds));
  }

  // Closes the given tabs: they leave the strip, then every count follows.
  async function close(tabs, message) {
    if (state.busy || !tabs.length) return;
    state.busy = true;
    const gone = new Set(tabs.map(tab => tab.id));
    const order = state.tabs.map(tab => tab.id);
    for (const element of $$('[data-tab]')) element.classList.toggle('is-leaving', gone.has(Number(element.dataset.tab)));
    await wait(LEAVE_MS);
    const wasActive = state.tabs.findIndex(tab => tab.active && gone.has(tab.id));
    state.tabs = state.tabs.filter(tab => !gone.has(tab.id));
    // The browser brings a neighbour into view when the tab in view closes.
    if (wasActive >= 0 && state.tabs.length) {
      const before = order.slice(0, wasActive).filter(id => !gone.has(id)).length;
      state.tabs[Math.min(before, state.tabs.length - 1)].active = true;
    }
    state.undo = { tabs: tabs.map(tab => ({ ...tab })), order };
    state.recent = remember(state.recent, tabs, order);
    state.busy = false;
    draw();
    showToast(text(message, { count: tabs.length }), true);
  }

  function undo() {
    if (!state.undo) return;
    const { tabs, order } = state.undo;
    const place = new Map(order.map((id, index) => [id, index]));
    // A restored tab that was in view comes back into view, as the extension restores it.
    if (tabs.some(tab => tab.active)) for (const tab of state.tabs) tab.active = false;
    state.tabs = [...state.tabs, ...tabs].sort((a, b) => (place.get(a.id) ?? 0) - (place.get(b.id) ?? 0));
    // A tab that is open again is no longer recently closed.
    const back = new Set(tabs.map(tab => tab.id));
    state.recent = state.recent.filter(entry => !back.has(entry.id));
    draw();
    showToast(text('restoredCount', { count: tabs.length }));
  }

  function reopen(id) {
    const entry = state.recent.find(item => item.id === id);
    if (!entry) return;
    state.recent = state.recent.filter(item => item !== entry);
    state.tabs = reopened(state.tabs, entry);
    draw();
    showToast(text('restoredCount', { count: 1 }));
    // The row that was pressed is gone: the next one, or the way back, takes focus.
    if (!frame.contains(document.activeElement) || document.activeElement === document.body) {
      ($('[data-pp-reopen]') || $('[data-pp-back="recent"]')).focus();
    }
  }

  function sort() {
    const result = sorted(state.tabs);
    if (!result.moved) { showToast(text('nothingToSort')); return; }
    state.tabs = result.tabs;
    draw();
    showToast(text('sortedCount', { count: result.moved }));
  }

  function reset() {
    hideToast();
    state.tabs = data.tabs.map(tab => ({ ...tab }));
    state.threshold = data.threshold;
    state.recent = [];
    query.value = '';
    show('main');
    draw();
  }

  function open(view, focus) {
    hideToast();
    show(view);
    draw();
    const target = $(focus);
    if (target) target.focus();
  }

  /* Events */

  frame.addEventListener('click', event => {
    const control = event.target.closest('button');
    if (!control || control.disabled || !frame.contains(control)) return;
    // One cleanup at a time, as in the extension: while tabs are leaving the
    // strip nothing else starts, so Reset, Sort or Undo cannot act on tabs
    // that are about to go.
    if (state.busy) return;
    if (control.matches('[data-pp-site]')) {
      close(state.tabs.filter(tab => hostOf(tab) === control.dataset.host), 'closedCount');
    } else if (control.matches('[data-pp-duplicates-row]')) {
      close(duplicates(state.tabs), 'closedDuplicates');
    } else if (control.matches('[data-pp-inactive-row]')) {
      open('inactive', '[data-pp-back="inactive"]');
    } else if (control.matches('[data-pp-open="settings"]')) {
      open('settings', '[data-pp-back="settings"]');
    } else if (control.matches('[data-pp-recent-toggle]')) {
      open('recent', '[data-pp-back="recent"]');
    } else if (control.matches('[data-pp-reopen]')) {
      reopen(Number(control.dataset.id));
    } else if (control.matches('[data-pp-recent-clear]')) {
      state.recent = [];
      hideToast();
      draw();
      $('[data-pp-back="recent"]').focus();
    } else if (control.matches('[data-pp-back]')) {
      const opener = { settings: '[data-pp-open="settings"]', recent: '[data-pp-recent-toggle]', inactive: '[data-pp-inactive-row]' };
      open(query.value.trim() ? 'typing' : 'main', opener[control.dataset.ppBack]);
      if (frame.contains(document.activeElement) && document.activeElement.disabled) query.focus();
    } else if (control.matches('[data-pp-sort]')) {
      sort();
    } else if (control.matches('[data-pp-undo]')) {
      undo();
    } else if (control.matches('[data-pp-dismiss]')) {
      hideToast();
    } else if (control.matches('[data-pp-clear]')) {
      query.value = '';
      show('main');
      draw();
      query.focus();
    } else if (control.matches('[data-pp-close]')) {
      closeMatches();
    } else if (control.matches('[data-pp-inactive-close]')) {
      const idle = inactive(state.tabs, state.threshold);
      show('main');
      close(idle, 'closedInactive');
    } else if (control.matches('.pp-tab-close')) {
      const id = Number(control.closest('[data-id]').dataset.id);
      close(state.tabs.filter(tab => tab.id === id), state.view === 'inactive' ? 'closedInactive' : 'closedCount');
    } else if (control.matches('[data-pp-step]')) {
      const next = step(state.threshold, Number(control.dataset.ppStep));
      if (next !== undefined) state.threshold = next;
      draw();
      // A stepper button that has just run out of steps hands focus to its pair.
      if (control.disabled) control.parentElement.querySelector('[data-pp-step]:not(:disabled)')?.focus();
    } else if (control.matches('[data-pp-reset]')) {
      reset();
    }
  });

  function closeMatches() {
    const found = matches(state.tabs, query.value);
    if (!found.length || state.busy) return;
    query.value = '';
    show('main');
    // The field takes focus again, as in the extension, except on a touch
    // screen, where that would raise the keyboard over the result.
    close(found, 'closedCount').then(() => { if (!touch.matches) query.focus(); });
  }

  query.addEventListener('input', () => {
    hideToast();
    show(query.value.trim() ? 'typing' : 'main');
    draw();
  });
  query.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); closeMatches(); }
  });

  // Pointing at a row shows in the tab strip which tabs it would close.
  function preview(event) {
    const row = event.target.closest ? event.target.closest('[data-pp-site], [data-pp-duplicates-row], [data-pp-inactive-row], .pp-tab') : null;
    if (state.view === 'settings' || state.view === 'recent') return;
    if (!row || !frame.contains(row)) {
      if (state.view === 'main') mark([]);
      return;
    }
    if (row.matches('[data-pp-site]')) mark(state.tabs.filter(tab => hostOf(tab) === row.dataset.host).map(tab => tab.id));
    else if (row.matches('[data-pp-duplicates-row]')) mark(duplicates(state.tabs).map(tab => tab.id));
    else if (row.matches('[data-pp-inactive-row]')) mark(inactive(state.tabs, state.threshold).map(tab => tab.id));
  }
  frame.addEventListener('pointerover', preview);
  frame.addEventListener('focusin', preview);
  frame.addEventListener('pointerleave', () => { if (state.view === 'main') mark([]); });

  toast.addEventListener('pointerenter', () => clearTimeout(toastTimer));
  toast.addEventListener('pointerleave', () => { if (toast.classList.contains('is-open')) armToast(); });
  toast.addEventListener('focusin', () => clearTimeout(toastTimer));
  toast.addEventListener('focusout', () => { if (toast.classList.contains('is-open')) armToast(); });
  toast.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    hideToast();
  });

  /* Settings: the theme and accent colour of this page */

  const site = root.TabToolsSite;
  function drawSettings() {
    if (!site) return;
    for (const button of $$('[data-pp-theme]')) button.setAttribute('aria-pressed', String(button.dataset.ppTheme === site.theme()));
    for (const button of $$('[data-pp-accent]')) button.setAttribute('aria-pressed', String(button.dataset.ppAccent === site.accent()));
  }
  for (const button of $$('[data-pp-theme]')) button.addEventListener('click', () => { site?.setTheme(button.dataset.ppTheme); });
  for (const button of $$('[data-pp-accent]')) button.addEventListener('click', () => { site?.setAccent(button.dataset.ppAccent); });
  document.addEventListener('tabtools:appearance', drawSettings);

  // Until here the popup is a picture: the HTML marks it inert, so a page
  // whose script did not run offers no buttons that do nothing.
  frame.querySelector('.demo').removeAttribute('inert');
  frame.dataset.demo = 'ready';
  show('main');
  draw();
  drawSettings();
})(typeof globalThis !== 'undefined' ? globalThis : this);
