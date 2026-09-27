#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { configuration } = require('./configure-analytics.cjs');
const { queries, report } = require('./posthog-report.cjs');
const source = fs.readFileSync(path.join(__dirname, 'dist/analytics.js'), 'utf8');
const consentKey = 'tabtools-analytics-consent-v1';
const config = { enabled: true, token: 'phc_test', apiHost: 'https://us.i.posthog.com' };

function harness(options = {}) {
  function element() {
    const listeners = {};
    return { hidden: true, dataset: {}, addEventListener: (name, fn) => { listeners[name] = fn; },
      emit: (name, event = {}) => listeners[name]?.(event), focus() {}, remove() {}, listeners };
  }
  const panel = element(), allow = element(), deny = element(), preferences = element(), status = element();
  panel.querySelector = selector => ({ '[data-analytics-allow]': allow, '[data-analytics-deny]': deny, h2: element() })[selector];
  const storage = new Map(options.consent ? [[consentKey, options.consent]] : []);
  const session = new Map();
  const storageAPI = map => ({ getItem: key => { if (options.storageBlocked) throw Error('blocked'); return map.get(key) || null; },
    setItem: (key, value) => { if (options.storageBlocked) throw Error('blocked'); map.set(key, value); }, removeItem: key => map.delete(key) });
  const scripts = [], captures = [], document = element(), window = element();
  let initConfig, inits = 0, optouts = 0;
  const sdk = { capture: (event, properties = {}) => {
    if (options.captureThrows) throw Error('SDK failed');
    const result = initConfig.before_send({ event, properties: { distinct_id: 'test-visitor', $session_id: 'test-session', token: config.token, ...properties } });
    if (result) captures.push(result);
  }, opt_in_capturing() {}, opt_out_capturing() { optouts++; } };
  Object.assign(window, { TABTOOLS_ANALYTICS: options.config || config,
    localStorage: storageAPI(storage), sessionStorage: storageAPI(session),
    posthog: { init: (_token, settings) => { inits++; initConfig = settings; return sdk; } },
    innerHeight: 800 });
  const location = new URL(options.url || 'https://tabtools.fyi/?utm_source=youtube&utm_campaign=launch&utm_content=user%40mail.test&email=private#secret');
  Object.assign(document, { head: { appendChild: script => scripts.push(script) }, createElement: element,
    documentElement: { dataset: { theme: 'light' } }, visibilityState: 'visible',
    referrer: 'https://example.com/private?token=secret',
    querySelector: selector => ({ '[data-analytics-consent]': panel, '[data-analytics-preferences]': preferences,
      '[data-analytics-status]': status, 'link[rel="canonical"]': { href: 'https://tabtools.fyi' + (options.pagePath || '/') },
      main: element(), '.guide-article': options.article })[selector], querySelectorAll: () => [] });
  const context = { window, document, location, navigator: options.navigator || {}, URL, URLSearchParams, Set };
  vm.runInNewContext(source, context);
  return { window, document, panel, allow, deny, preferences, scripts, captures, storage, session, sdk,
    get settings() { return initConfig; }, get inits() { return inits; }, get optouts() { return optouts; },
    grant() { allow.emit('click'); }, reject() { deny.emit('click'); }, load() { scripts.at(-1).onload(); },
    click(store = 'chrome', placement = 'hero', type = 'click', button = 0) {
      const hosts = { chrome: 'chromewebstore.google.com', firefox: 'addons.mozilla.org', edge: 'microsoftedge.microsoft.com' };
      const link = { href: `https://${hosts[store]}/store?utm_source=tabtools.fyi`, dataset: { store, utmPlacement: placement } };
      const event = { type, button, target: { closest: () => link }, preventDefault() { assert.fail('Analytics blocked navigation'); } };
      document.emit(type, event);
    } };
}

async function main() {
  for (const options of [{ config: { enabled: false } }, { config: { ...config, token: 'phx_private' } },
    { config: { ...config, apiHost: 'https://untrusted.example' } }, { url: 'https://pr-1.tabtools-website.pages.dev/' },
    { url: 'http://localhost/' }]) {
    const h = harness({ ...options, consent: 'granted' });
    assert.equal(h.window.tabtoolsAnalytics, undefined);
    assert.equal(h.scripts.length, 0);
  }
  const fresh = harness();
  assert.equal(fresh.panel.hidden, false);
  fresh.click();
  assert.equal(fresh.scripts.length, 0, 'No PostHog requests before consent');
  fresh.reject();
  assert.equal(fresh.scripts.length, 0);
  fresh.grant(); fresh.click('firefox', 'hero');
  assert.equal(fresh.scripts.length, 1);
  fresh.load();
  assert.equal(fresh.settings.opt_out_persistence_by_default, true, 'The SDK must remove its identity storage on withdrawal');
  assert.deepEqual(fresh.captures.map(e => e.event), ['$pageview', 'store_link_clicked'], 'Queue consented clicks while SDK loads');
  assert.equal(fresh.captures[1].properties.browser_store, 'firefox');
  for (const browser of ['chrome', 'firefox', 'edge']) fresh.click(browser, 'footer');
  assert.deepEqual(fresh.captures.slice(-3).map(e => e.properties.browser_store), ['chrome', 'firefox', 'edge']);
  fresh.click('edge', 'hero', 'auxclick', 1);
  const count = fresh.captures.length;
  fresh.click('edge', 'hero', 'auxclick', 2);
  assert.equal(fresh.captures.length, count, 'Right-click alone is not a conversion');
  fresh.grant();
  assert.equal(fresh.captures.filter(e => e.event === '$pageview').length, 1);
  const scrubbed = fresh.settings.before_send({ event: '$pageview', $set: { email: 'private' }, properties: {
    distinct_id: 'id', $session_id: 'session', $current_url: 'https://tabtools.fyi/?email=private',
    $referrer: 'https://example.com/private', $initial_current_url: 'secret', $set: { email: 'private' },
    $elements: ['private'], email: 'private'
  } });
  assert.equal(scrubbed.properties.$current_url, 'https://tabtools.fyi/');
  assert.equal(scrubbed.properties.referrer_host, 'example.com');
  assert.equal(scrubbed.properties.utm_source, 'youtube');
  assert.equal(scrubbed.properties.utm_content, undefined);
  assert(!JSON.stringify(scrubbed).includes('private'));
  assert.equal(fresh.settings.before_send({ event: '$autocapture', properties: {} }), null);
  const exception = fresh.settings.before_send({ event: '$exception', properties: { $exception_list: [{
    type: 'TypeError', value: 'private user data', stacktrace: { frames: [
      { filename: 'https://tabtools.fyi/script.js?token=secret', lineno: 42, colno: 3, function: 'private' },
      { filename: 'https://untrusted.example/private.js', lineno: 1 }
    ] }
  }] } });
  assert(!/private|secret|untrusted/.test(JSON.stringify(exception)));
  assert.equal(exception.properties.$exception_list[0].stacktrace.frames[0].lineno, 42);
  for (let i = 0; i < 9; i++) assert(fresh.settings.before_send({ event: '$exception', properties: {} }));
  assert.equal(fresh.settings.before_send({ event: '$exception', properties: {} }), null);
  fresh.reject(); fresh.click();
  assert.equal(fresh.captures.length, count);
  assert(fresh.optouts > 0);
  assert.equal(fresh.session.size, 0);
  assert.equal(fresh.settings.before_send({ event: '$pageview', properties: {} }), null);

  const race = harness(); race.grant(); race.click(); race.reject(); race.load();
  assert.equal(race.inits, 0, 'Revocation during script download prevents SDK init');
  const blocked = harness(); blocked.grant(); blocked.scripts[0].onerror();
  assert.doesNotThrow(() => blocked.click());
  const failingSDK = harness({ captureThrows: true }); failingSDK.grant(); failingSDK.load();
  assert.doesNotThrow(() => failingSDK.click());
  for (const navigator of [{ doNotTrack: '1' }, { globalPrivacyControl: true }]) {
    const h = harness({ consent: 'granted', navigator });
    h.grant(); assert.equal(h.scripts.length, 0);
    h.preferences.emit('click'); assert.equal(h.allow.disabled, true);
  }
  const restricted = harness({ storageBlocked: true });
  restricted.grant(); restricted.load();
  assert.equal(restricted.captures[0].event, '$pageview', 'Blocked storage must not crash the site');
  const otherTab = harness({ consent: 'granted' }); otherTab.load();
  otherTab.storage.set(consentKey, 'denied'); otherTab.window.emit('storage', { key: consentKey });
  assert.equal(otherTab.window.tabtoolsAnalytics.getConsent(), 'denied');
  assert.equal(otherTab.optouts, 1);
  const guide = harness({ pagePath: '/guides/sort-tabs-by-website/', article: { getBoundingClientRect: () => ({ top: -1600, height: 2400 }) } });
  guide.grant(); guide.load(); guide.window.emit('scroll'); guide.window.emit('scroll');
  assert.deepEqual(guide.captures.filter(e => e.event === 'guide_read').map(e => e.properties.scroll_percent), [50, 90]);

  assert.deepEqual(configuration({ POSTHOG_ENVIRONMENT: 'preview', POSTHOG_PROJECT_TOKEN: 'phc_live' }), { enabled: false });
  assert.deepEqual(configuration({ POSTHOG_ENVIRONMENT: 'production' }), { enabled: false });
  assert.throws(() => configuration({ POSTHOG_ENVIRONMENT: 'production', POSTHOG_PROJECT_TOKEN: 'phx_private' }));
  assert.throws(() => configuration({ POSTHOG_ENVIRONMENT: 'production', POSTHOG_PROJECT_TOKEN: 'phc_live', POSTHOG_API_HOST: 'https://example.com' }));
  assert.equal(configuration({ POSTHOG_ENVIRONMENT: 'production', POSTHOG_PROJECT_TOKEN: 'phc_live', POSTHOG_API_HOST: 'https://eu.i.posthog.com' }).enabled, true);

  const now = new Date('2026-09-28T03:40:00Z');
  assert.equal(queries(now).windows.end_exclusive, '2026-09-28T00:00:00.000Z');
  assert.equal(queries(now).windows.current_start, '2026-09-14T00:00:00.000Z');
  const env = { POSTHOG_APP_HOST: 'https://eu.posthog.com', POSTHOG_PROJECT_ID: '123', POSTHOG_PERSONAL_API_KEY: 'test-private-key' };
  let requests = 0;
  const output = await report(env, async (url, request) => {
    requests++;
    assert.equal(url, 'https://eu.posthog.com/api/projects/123/query/');
    assert.equal(request.method, 'POST');
    assert.equal(JSON.parse(request.body).query.kind, 'HogQLQuery');
    assert.equal(request.redirect, 'error');
    return { ok: true, json: async () => requests === 1 ? {
      columns: ['period', 'visitors', 'pageviews', 'store_clicking_visitors', 'store_clicks', 'error_events'],
      results: [['current', 10, 15, 2, 3, 1]]
    } : { columns: [], results: [] } };
  }, now);
  assert.equal(requests, 2);
  assert.equal(output.overview[0].store_click_rate, null);
  assert.equal(output.overview[1].store_click_rate, .2);
  assert(!JSON.stringify(output).includes(env.POSTHOG_PERSONAL_API_KEY));
  await assert.rejects(report({ ...env, POSTHOG_APP_HOST: 'https://untrusted.example' }));
  await assert.rejects(report(env, async () => ({ ok: false, status: 403 })), /HTTP 403/);
  await assert.rejects(report(env, async () => ({ ok: true, json: async () => ({ query_status: { complete: false } }) })), /complete result/);
  console.log('Analytics checks passed: consent, privacy, region/configuration, conversion events, SDK failures, guide engagement and read-only reporting.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
