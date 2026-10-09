// SPDX-License-Identifier: MPL-2.0
'use strict';

// The home page's working popup: its sample tabs, the text it needs, and the
// markup for its starting state. website/src/demo.js holds the rules and takes
// over in the browser; this file draws the same picture into the HTML so the
// page looks the same before that script runs and with JavaScript off.
const L = require('../scripts/localisation');
const model = require('./src/demo.js');
const { version } = require('../package.json');

// Tab order is the order in the sample window. `idle` is minutes since the tab
// was last used. Titles are page titles, which a browser shows as sites give them.
const tabs = [
  ['Pull requests · tabtools', 'github.com/Michael-Wester/tabtools/pulls', 20],
  ['Trip budget - Google Sheets', 'docs.google.com/spreadsheets/trip-budget', 300],
  ['YouTube', 'youtube.com/', 4400],
  ['Issues · tabtools', 'github.com/Michael-Wester/tabtools/issues', 45],
  ['Tab (interface) - Wikipedia', 'en.wikipedia.org/wiki/Tab_(interface)', 200],
  ['How do I undo the most recent local commits in Git?', 'stackoverflow.com/questions/927358', 1500],
  ['tabtools/README.md', 'github.com/Michael-Wester/tabtools/blob/main/README.md', 10],
  ['Inbox (3) - Gmail', 'mail.google.com/mail/inbox', 5],
  ['lofi beats to tidy tabs to - YouTube', 'youtube.com/watch?v=tidy', 15],
  ['Meeting notes - Google Docs', 'docs.google.com/document/meeting-notes', 90],
  ['Hacker News', 'news.ycombinator.com/', 540],
  ['Pull requests · tabtools', 'github.com/Michael-Wester/tabtools/pulls', 130],
  ['Web browser - Wikipedia', 'en.wikipedia.org/wiki/Web_browser', 0],
  ['What is the difference between px, em and rem?', 'stackoverflow.com/questions/11799236', 380],
  ['Q3 plan - Google Slides', 'docs.google.com/presentation/q3-plan', 2900],
  ['YouTube', 'youtube.com/', 60],
  ['Actions · tabtools', 'github.com/Michael-Wester/tabtools/actions', 25],
  ['Google Calendar', 'calendar.google.com/calendar/week', 30],
  ['Tab (interface) - Wikipedia', 'en.wikipedia.org/wiki/Tab_(interface)', 40],
  ['Newest questions - Stack Overflow', 'stackoverflow.com/questions', 240],
  ['Untitled document - Google Docs', 'docs.google.com/document/untitled', 700],
  ['How to fold a fitted sheet - YouTube', 'youtube.com/watch?v=fold', 190],
  ['Ask HN: How many tabs do you have open?', 'news.ycombinator.com/item?id=tabs', 75],
  ['Releases · tabtools', 'github.com/Michael-Wester/tabtools/releases', 55]
].map(([title, url, idle], index) => ({ id: index + 1, title, url, idle, ...(idle === 0 ? { active: true } : {}) }));

const threshold = 120;

// Extension strings the popup shows. They come from the same catalogue as the
// extension, so the page and the extension always use the same words.
const messageKeys = [
  'suggestions', 'inactive', 'closeDuplicates', 'sortTabs', 'queryPlaceholder', 'close', 'undo', 'clear', 'dismiss',
  'settings', 'closedCount', 'closedInactive', 'closedDuplicates', 'sortedCount', 'nothingToSort',
  'restoredCount', 'openCount', 'tabCount', 'siteCount', 'closeSiteLabel',
  'recentlyClosed', 'noRecent', 'recentNote', 'reopen', 'clearList',
  'noSuggestions', 'noMatches', 'noInactive', 'inactiveAfter', 'keepNote', 'theme', 'system', 'light',
  'dark', 'accentColour', 'accentPurple', 'accentBlue', 'accentGreen', 'accentOrange', 'accentPink',
  'accentGraphite', 'reset'
];

// A string a language has not translated yet is shown in English, as the
// extension itself does.
function messages(locale) {
  const english = L.catalogue('en');
  const translated = L.catalogue(locale.locale);
  return Object.fromEntries(messageKeys.map(key => {
    const value = translated[key] ?? english[key];
    if (value === undefined) throw new Error('Missing demo message ' + key);
    return [key, value];
  }));
}

function data(locale) {
  return { locale: locale.canonical, threshold, tabs, messages: messages(locale) };
}

const icon = {
  mark: '<svg class="pp-mark" viewBox="0 0 1024 1024" width="26" height="26" fill="none" stroke="currentColor" stroke-width="92" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M 794 190 C 916 306 944 493 875 657 C 802 829 617 920 434 882 C 244 842 105 686 92 497 C 82 346 153 217 278 132 C 307 112 334 100 366 100"></path><path d="M 92 100 H 506"></path><path d="M 398 368 L 626 596 M 626 368 L 398 596" stroke-width="78"></path></svg>',
  settings: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2 5h5.5M12.5 5H14M2 11h1.5M8.5 11H14"></path><circle cx="10" cy="5" r="2"></circle><circle cx="6" cy="11" r="2"></circle></svg>',
  search: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.6"></circle><path d="M10.6 10.6L14 14"></path></svg>',
  cross: '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7"></path></svg>',
  back: '<svg class="pp-flip" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5"></path></svg>',
  moon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.4 9.6A5.8 5.8 0 1 1 6.4 2.6a4.6 4.6 0 0 0 7 7z"></path></svg>',
  copies: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="2"></rect><path d="M10.5 3.5v-.3A1.2 1.2 0 0 0 9.3 2H3.2A1.2 1.2 0 0 0 2 3.2v6.1a1.2 1.2 0 0 0 1.2 1.2h.3"></path><path d="M7.7 9.5h3.6"></path></svg>',
  sort: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2.5 4h11M2.5 8h7.5M2.5 12h4"></path></svg>',
  undo: '<svg class="pp-flip" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 3.5l-3 3 3 3"></path><path d="M3 6.5h6.2a3.3 3.3 0 0 1 0 6.6H8"></path></svg>',
  minus: '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M1.5 5h7"></path></svg>',
  plus: '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M1.5 5h7M5 1.5v7"></path></svg>',
  history: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.6 8a5.4 5.4 0 1 0 1.7-3.9"></path><path d="M2.4 2.4v2.9h2.9"></path><path d="M8 5.3V8l1.9 1.2"></path></svg>',
  reopen: '<svg class="pp-flip" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.6 1.6L1.6 3.6l2 2"></path><path d="M1.8 3.6h4a2.4 2.4 0 0 1 0 4.8H4.6"></path></svg>',
  check: '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 5.3l2 2 4-4.6"></path></svg>'
};

const e = L.escape;
const ticks = count => '<span class="pp-ticks">' + '<i></i>'.repeat(count) + '</span>';
const tile = host => '<span class="pp-fav" aria-hidden="true">' + e(model.letterOf(host)) + '</span>';

function markup(locale, hint) {
  const text = messages(locale);
  const format = model.formatter(locale.canonical, text);
  const t = (key, values) => e(format.text(key, values));
  const siteList = model.sites(tabs);
  const idle = model.inactive(tabs, threshold);
  const copies = model.duplicates(tabs);
  const active = tabs.find(tab => tab.active);
  const duration = display => format.unit(model.duration(threshold), display);
  const stepLabel = direction => e(format.unit(model.duration(model.step(threshold, direction)), 'long'));

  const stripTab = tab => `<span class="demo-tab${tab.active ? ' is-active' : ''}" data-tab="${tab.id}" data-host="${e(model.hostOf(tab))}">${tile(model.hostOf(tab))}</span>`;
  const siteRow = site => {
    const label = `${t('closeSiteLabel', { site: site.host })} · ${t('openCount', { count: site.count })}`;
    return `<button class="pp-row pp-site" type="button" data-pp-site data-host="${e(site.host)}" title="${label}" aria-label="${label}">${tile(site.host)}<span class="pp-host" dir="ltr">${e(site.host)}</span>${ticks(site.count)}<span class="pp-count">${e(format.number(site.count))}</span><span class="pp-x">${icon.cross}</span></button>`;
  };
  const stepper = () => `<div class="pp-stepper" role="group" aria-label="${t('inactiveAfter')}">
            <button class="pp-step" type="button" data-pp-step="-1" title="${stepLabel(-1)}" aria-label="${stepLabel(-1)}">${icon.minus}</button>
            <output class="pp-step-value" data-pp-threshold>${e(duration('long'))}</output>
            <button class="pp-step" type="button" data-pp-step="1" title="${stepLabel(1)}" aria-label="${stepLabel(1)}">${icon.plus}</button>
          </div>`;
  const idleLabel = `${t('inactive')} · ${t('openCount', { count: idle.length })}`;
  const copyLabel = `${t('closeDuplicates')} · ${t('openCount', { count: copies.length })}`;

  return `<div class="demo-wrap" data-demo role="group" aria-label="${e(L.catalogue(locale.locale).web_tabtools_in_action ?? L.catalogue('en').web_tabtools_in_action)}">
      <div class="demo" inert>
        <div class="demo-strip" data-demo-strip aria-hidden="true">${tabs.map(stripTab).join('')}</div>
        <div class="demo-bar" aria-hidden="true">
          <span class="demo-address" data-demo-address dir="ltr">${e(active.url)}</span>
          <span class="demo-ext">${icon.mark}</span>
        </div>
        <div class="demo-stage">
          <div class="demo-page" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
          <div class="pp">
            <div class="pp-head" data-view="main typing">
              <div class="pp-head-row">
                ${icon.mark}
                <div class="pp-head-text">
                  <strong class="pp-brand">TabTools</strong>
                  <span class="pp-stats"><span dir="auto" data-pp-tabs>${t('tabCount', { count: tabs.length })}</span><span class="pp-dot" aria-hidden="true">·</span><span dir="auto" data-pp-sites>${t('siteCount', { count: siteList.length })}</span></span>
                </div>
                <button class="pp-icon-btn" type="button" data-pp-open="settings" aria-label="${t('settings')}" title="${t('settings')}">${icon.settings}</button>
              </div>
              <label class="pp-field">
                ${icon.search}
                <input type="text" dir="auto" data-pp-query autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="${t('queryPlaceholder')}" placeholder="${t('queryPlaceholder')}" />
                <button class="pp-icon-btn pp-round" type="button" data-pp-clear aria-label="${t('clear')}" title="${t('clear')}" hidden>${icon.cross}</button>
                <button class="pp-inline-close" type="button" data-pp-close hidden><span>${t('close')}</span><span class="pp-badge" data-pp-close-count></span></button>
              </label>
            </div>
            <div class="pp-sub-bar" data-view="inactive" hidden>
              <button class="pp-icon-btn" type="button" data-pp-back="inactive" aria-label="${t('suggestions')}" title="${t('suggestions')}">${icon.back}</button>
              <strong class="pp-sub-title">${t('inactive')}</strong>
              <span class="pp-sub-meta" dir="auto" data-pp-inactive-meta></span>
            </div>
            <div class="pp-sub-bar" data-view="recent" hidden>
              <button class="pp-icon-btn" type="button" data-pp-back="recent" aria-label="${t('suggestions')}" title="${t('suggestions')}">${icon.back}</button>
              <strong class="pp-sub-title">${t('recentlyClosed')}</strong>
              <span class="pp-sub-meta" dir="auto" data-pp-recent-meta></span>
            </div>
            <div class="pp-sub-bar" data-view="settings" hidden>
              <button class="pp-icon-btn" type="button" data-pp-back="settings" aria-label="${t('suggestions')}" title="${t('suggestions')}">${icon.back}</button>
              <strong class="pp-sub-title">${t('settings')}</strong>
            </div>

            <div class="pp-list-head" data-view="main"><span class="pp-list-title">${t('suggestions')}</span></div>
            <div class="pp-list pp-suggest" data-view="main">
              <div class="pp-pair">
                <button class="pp-row pp-cell" type="button" data-pp-inactive-row title="${idleLabel}" aria-label="${idleLabel}">
                  ${icon.moon}
                  <span class="pp-label-wrap"><span class="pp-label">${t('inactive')}</span><span class="pp-hint" data-pp-inactive-hint>${e(duration('short'))}+</span></span>
                  <span class="pp-count" data-pp-inactive-count>${e(format.number(idle.length))}</span>
                </button>
                <button class="pp-row pp-cell" type="button" data-pp-duplicates-row title="${copyLabel}" aria-label="${copyLabel}">
                  ${icon.copies}
                  <span class="pp-label">${t('closeDuplicates')}</span>
                  <span class="pp-count" data-pp-duplicates-count>${e(format.number(copies.length))}</span>
                </button>
              </div>
              <hr class="pp-rule" data-pp-sites-rule />
              <div class="pp-rows" data-pp-sites-rows>${siteList.map(siteRow).join('')}</div>
              <div class="pp-empty" data-pp-suggest-empty hidden>${t('noSuggestions')}</div>
            </div>

            <div class="pp-list-head" data-view="typing" hidden><span class="pp-list-title"><q data-pp-match-query></q></span><span class="pp-list-meta" dir="auto" data-pp-match-count></span></div>
            <div class="pp-list pp-matches" data-view="typing" hidden>
              <div class="pp-rows" data-pp-match-rows></div>
              <div class="pp-none" data-pp-match-empty hidden>${t('noMatches')}</div>
            </div>

            <div class="pp-control" data-view="inactive" hidden>
              <div class="pp-control-row">
                <span class="pp-setting-label">${t('inactiveAfter')}</span>
                ${stepper()}
              </div>
              <p class="pp-note" dir="auto">${t('keepNote')}</p>
            </div>
            <div class="pp-list pp-inactive" data-view="inactive" hidden>
              <div class="pp-rows" data-pp-inactive-rows></div>
              <div class="pp-none" data-pp-inactive-empty hidden>${t('noInactive')}</div>
            </div>

            <div class="pp-list pp-recent" data-view="recent" hidden>
              <div class="pp-rows" data-pp-recent-rows></div>
              <div class="pp-none" data-pp-recent-empty hidden>${t('noRecent')}</div>
            </div>

            <div class="pp-settings" data-view="settings" hidden>
              <div class="pp-setting">
                <span class="pp-setting-label">${t('theme')}</span>
                <div class="pp-segmented" role="group" aria-label="${t('theme')}">${model.THEMES.map(name =>
                  `<button class="pp-seg" type="button" data-pp-theme="${name}" aria-pressed="${name === 'system'}">${t(name)}</button>`).join('')}</div>
              </div>
              <hr class="pp-divider" />
              <div class="pp-setting">
                <span class="pp-setting-label">${t('accentColour')}</span>
                <div class="pp-swatches" role="group" aria-label="${t('accentColour')}">${model.ACCENTS.map(name => {
                  const label = t('accent' + name[0].toUpperCase() + name.slice(1));
                  return `<button class="pp-swatch pp-swatch-${name}" type="button" data-pp-accent="${name}" aria-pressed="${name === 'purple'}" aria-label="${label}" title="${label}">${icon.check}</button>`;
                }).join('')}</div>
              </div>
              <hr class="pp-divider" />
              <div class="pp-setting">
                <span class="pp-setting-label">${t('inactiveAfter')}</span>
                ${stepper()}
              </div>
            </div>

            <div class="pp-bottom">
              <div class="pp-toast" data-pp-toast>
                <span class="pp-toast-text" dir="auto" role="status" aria-live="polite" data-pp-status></span>
                <button class="pp-toast-btn" type="button" data-pp-undo hidden><span>${t('undo')}</span>${icon.undo}</button>
                <button class="pp-toast-x" type="button" data-pp-dismiss aria-label="${t('dismiss')}" title="${t('dismiss')}" hidden>${icon.cross}</button>
              </div>
              <div class="pp-foot" data-view="main typing">
                <button class="pp-btn pp-sort" type="button" data-pp-sort>${icon.sort}<span>${t('sortTabs')}</span></button>
                <button class="pp-btn pp-sort" type="button" data-pp-recent-toggle>${icon.history}<span>${t('recentlyClosed')}</span></button>
              </div>
              <div class="pp-foot" data-view="recent" hidden>
                <span class="pp-note" dir="auto">${t('recentNote')}</span>
                <button class="pp-btn" type="button" data-pp-recent-clear disabled>${t('clearList')}</button>
              </div>
              <div class="pp-foot-action" data-view="inactive" hidden>
                <button class="pp-primary" type="button" data-pp-inactive-close><span>${t('close')}</span><span class="pp-badge" data-pp-inactive-close-count></span></button>
              </div>
              <div class="pp-foot-links" data-view="settings" hidden>
                <a href="https://github.com/Michael-Wester/tabtools" target="_blank" rel="noopener">GitHub</a>
                <span>TabTools ${e(version)}</span>
              </div>
            </div>

            <template data-pp-template="strip"><span class="demo-tab">${'<span class="pp-fav" aria-hidden="true"></span>'}</span></template>
            <template data-pp-template="site"><button class="pp-row pp-site" type="button" data-pp-site><span class="pp-fav" aria-hidden="true"></span><span class="pp-host" dir="ltr"></span><span class="pp-ticks"></span><span class="pp-count"></span><span class="pp-x">${icon.cross}</span></button></template>
            <template data-pp-template="recent"><button class="pp-tab" type="button" data-pp-reopen><span class="pp-fav" aria-hidden="true"></span><span class="pp-tab-text"><span class="pp-tab-title"></span><span class="pp-tab-host" dir="ltr"></span></span><span class="pp-tab-meta"></span><span class="pp-x">${icon.reopen}</span></button></template>
            <template data-pp-template="tab"><div class="pp-tab"><span class="pp-fav" aria-hidden="true"></span><span class="pp-tab-text"><span class="pp-tab-title"></span><span class="pp-tab-host" dir="ltr"></span></span><span class="pp-tab-meta"></span><button class="pp-tab-close" type="button">${icon.cross}</button></div></template>
          </div>
        </div>
      </div>
      <p class="demo-caption"><span dir="auto">${e(hint)}</span> <button class="demo-reset" type="button" data-pp-reset>${t('reset')}</button></p>
    </div>`;
}

module.exports = { tabs, threshold, messageKeys, messages, data, markup, icon };
