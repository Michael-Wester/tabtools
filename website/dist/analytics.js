/* Website analytics only. No extension code imports this file. */
(() => {
  'use strict';
  const config = window.TABTOOLS_ANALYTICS;
  const hosts = {
    'https://us.i.posthog.com': 'https://us-assets.i.posthog.com',
    'https://eu.i.posthog.com': 'https://eu-assets.i.posthog.com'
  };
  if (!config?.enabled || !/^phc_[A-Za-z0-9_-]+$/.test(config.token || '') || !hosts[config.apiHost] ||
      location.protocol !== 'https:' || !['tabtools.fyi', 'www.tabtools.fyi'].includes(location.hostname) ||
      window.tabtoolsAnalytics) return;

  const consentKey = 'tabtools-analytics-consent-v1';
  const attributionKey = 'tabtools-analytics-attribution-v1';
  const panel = document.querySelector('[data-analytics-consent]');
  const preferences = document.querySelector('[data-analytics-preferences]');
  const status = document.querySelector('[data-analytics-status]');
  if (!panel || !preferences) return; // Never collect without a usable preference control.
  const read = (storage, key) => { try { return window[storage].getItem(key); } catch (_) { return null; } };
  const write = (storage, key, value) => { try { window[storage].setItem(key, value); } catch (_) {} };
  const remove = (storage, key) => { try { window[storage].removeItem(key); } catch (_) {} };
  const privacySignal = () => navigator.globalPrivacyControl === true ||
    navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes' || window.doNotTrack === '1';
  let choice = read('localStorage', consentKey);
  let sdk;
  let loading = false;
  let pageCaptured = false;
  let errorsCaptured = 0;
  let restoreFocus;
  let pending = [];
  const consented = () => choice === 'granted' && !privacySignal();

  // Use authored canonical paths, never arbitrary URLs, query strings or hashes.
  const canonical = new URL(document.querySelector('link[rel="canonical"]')?.href || '/', location.origin);
  const pagePath = canonical.origin === 'https://tabtools.fyi' ? canonical.pathname : '/';
  const pageType = pagePath === '/' ? 'home' : pagePath === '/guides/' ? 'guides_index' : 'guide';
  const campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
  const campaignValue = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(value) ? value : undefined;

  function attribution() {
    let stored;
    try { stored = JSON.parse(read('sessionStorage', attributionKey) || 'null'); } catch (_) {}
    const result = {};
    const params = new URLSearchParams(location.search);
    for (const key of campaignKeys) {
      const value = campaignValue(stored ? stored[key] : params.get(key));
      if (value) result[key] = value;
    }
    try {
      const host = stored ? stored.referrer_host : new URL(document.referrer).hostname;
      if (typeof host === 'string' && /^[a-z0-9.-]{1,253}$/i.test(host)) result.referrer_host = host;
    } catch (_) {}
    if (consented()) write('sessionStorage', attributionKey, JSON.stringify(result));
    return result;
  }

  const allowedEvents = new Set(['$pageview', '$pageleave', '$exception', 'store_link_clicked', 'guide_link_clicked', 'guide_read', 'faq_opened']);
  const sdkProperties = ['token', 'distinct_id', '$session_id', '$window_id', '$lib', '$lib_version',
    '$browser', '$browser_version', '$os', '$os_version', '$device_type', '$screen_height', '$screen_width',
    '$viewport_height', '$viewport_width', '$is_identified', '$exception_handled', '$exception_level'];
  const eventProperties = ['browser_store', 'placement', 'guide_path', 'scroll_percent', 'question_index'];

  function scrubExceptions(exceptions) {
    return (Array.isArray(exceptions) ? exceptions : []).filter(exception => exception && typeof exception === 'object').slice(0, 5).map(exception => {
      const type = /^(?:Error|TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError|AggregateError)$/.test(exception.type) ? exception.type : 'Error';
      return {
        type,
        value: type + ' on the TabTools website (message omitted)',
        mechanism: { type: 'generic', handled: exception.mechanism?.handled === true },
        stacktrace: { frames: (Array.isArray(exception.stacktrace?.frames) ? exception.stacktrace.frames : []).flatMap(frame => {
          try {
            const url = new URL(frame.filename, location.origin);
            if (url.origin !== location.origin || !['/script.js', '/analytics.js'].includes(url.pathname)) return [];
            return [{ filename: url.origin + url.pathname, lineno: Number(frame.lineno) || 0,
              colno: Number(frame.colno) || 0, in_app: true }];
          } catch (_) { return []; }
        }) }
      };
    });
  }

  function beforeSend(event) {
    if (!consented() || !event || !allowedEvents.has(event.event)) return null;
    if (event.event === '$exception' && ++errorsCaptured > 10) return null;
    const incoming = event.properties || {};
    const properties = {};
    for (const key of [...sdkProperties, ...eventProperties]) {
      if (incoming[key] !== undefined) properties[key] = incoming[key];
    }
    Object.assign(properties, attribution(), {
      $current_url: 'https://tabtools.fyi' + pagePath, $pathname: pagePath,
      $host: 'tabtools.fyi', $process_person_profile: false, $geoip_disable: true,
      site: 'tabtools.fyi', environment: 'production', analytics_version: 1,
      page_path: pagePath, page_type: pageType, theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
    });
    if (event.event === '$exception') properties.$exception_list = scrubExceptions(incoming.$exception_list);
    // Reconstruct instead of forwarding SDK-added URL, referrer, person or DOM properties.
    return { event: event.event, properties, timestamp: event.timestamp, uuid: event.uuid };
  }

  function capture(name, properties = {}) {
    if (!consented()) return;
    if (!sdk) {
      if (loading && pending.length < 20) pending.push([name, properties]);
      return;
    }
    try { sdk.capture(name, properties); } catch (_) { /* Analytics must never block navigation. */ }
  }

  function recordPage() {
    if (pageCaptured || !consented() || !sdk) return;
    pageCaptured = true;
    capture('$pageview');
  }

  function initialise() {
    if (!consented() || sdk) return;
    try {
      sdk = window.posthog.init(config.token, {
        api_host: config.apiHost, defaults: '2026-05-30',
        persistence: 'localStorage', person_profiles: 'never', ip: false, respect_dnt: true,
        opt_out_capturing_by_default: true, opt_out_persistence_by_default: true,
        autocapture: false, capture_pageview: false, capture_pageleave: false,
        capture_exceptions: true, capture_performance: false, capture_heatmaps: false, capture_dead_clicks: false,
        rageclick: false, disable_session_recording: true, disable_surveys: true,
        disable_web_experiments: true, disable_product_tours: true, disable_conversations: true,
        advanced_disable_flags: true, save_campaign_params: false, save_referrer: false,
        disable_scroll_properties: true, cross_subdomain_cookie: false,
        before_send: beforeSend
      });
      sdk.opt_in_capturing({ captureEventName: false });
      recordPage();
      for (const [name, properties] of pending) capture(name, properties);
      pending = [];
    } catch (_) { sdk = undefined; }
  }

  function start() {
    if (!consented()) return;
    if (sdk) {
      try { sdk.opt_in_capturing({ captureEventName: false }); } catch (_) {}
      recordPage();
    } else if (!loading) {
      loading = true;
      const script = document.createElement('script');
      script.src = hosts[config.apiHost] + '/static/array.js';
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = () => { loading = false; initialise(); };
      script.onerror = () => { loading = false; pending = []; script.remove(); };
      document.head.appendChild(script);
    }
  }

  function stop() {
    pageCaptured = false;
    pending = [];
    remove('sessionStorage', attributionKey);
    try { sdk?.opt_out_capturing(); } catch (_) {}
  }

  function showPreferences(focus = false) {
    const signal = privacySignal();
    status.textContent = signal ? 'Your browser privacy preference is on, so website analytics stay off.' :
      consented() ? 'Optional website analytics are currently on.' : 'Optional website analytics are currently off.';
    panel.querySelector('[data-analytics-allow]').disabled = signal;
    panel.hidden = false;
    if (focus) {
      restoreFocus = document.activeElement;
      panel.querySelector('h2').focus({ preventScroll: true });
    }
  }

  function setConsent(value) {
    choice = value === 'granted' && !privacySignal() ? 'granted' : 'denied';
    write('localStorage', consentKey, choice);
    panel.hidden = true;
    if (consented()) start(); else stop();
    (restoreFocus || document.querySelector('main'))?.focus({ preventScroll: true });
    restoreFocus = undefined;
  }

  window.tabtoolsAnalytics = { setConsent, getConsent: () => consented() ? 'granted' : 'denied' };
  preferences.hidden = false;
  preferences.addEventListener('click', () => showPreferences(true));
  panel.querySelector('[data-analytics-allow]').addEventListener('click', () => setConsent('granted'));
  panel.querySelector('[data-analytics-deny]').addEventListener('click', () => setConsent('denied'));
  window.addEventListener('storage', event => {
    if (event.key !== consentKey && event.key !== null) return;
    choice = read('localStorage', consentKey);
    if (consented()) start(); else stop();
    panel.hidden = true;
  });
  if (consented()) start();
  else { stop(); if (!choice && !privacySignal()) showPreferences(); }

  function trackLink(event) {
    if (!consented() || (event.type === 'auxclick' && event.button !== 1)) return;
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    const url = new URL(link.href, location.origin);
    const store = link.dataset.store;
    const storeHosts = { chrome: 'chromewebstore.google.com', firefox: 'addons.mozilla.org', edge: 'microsoftedge.microsoft.com' };
    if (storeHosts[store] === url.hostname) {
      capture('store_link_clicked', { browser_store: store, placement: campaignValue(link.dataset.utmPlacement) || 'unknown' });
    } else if (url.origin === location.origin && /^\/guides\/(?:[a-z0-9-]+\/)?$/.test(url.pathname)) {
      capture('guide_link_clicked', { guide_path: url.pathname });
    }
  }
  document.addEventListener('click', trackLink);
  document.addEventListener('auxclick', trackLink);
  document.querySelectorAll('.faq-list details').forEach((details, index) => {
    details.addEventListener('toggle', () => { if (details.open) capture('faq_opened', { question_index: index + 1 }); });
  });
  const article = document.querySelector('.guide-article');
  const milestones = new Set();
  if (article) window.addEventListener('scroll', () => {
    if (!consented() || !sdk || document.visibilityState !== 'visible') return;
    const rect = article.getBoundingClientRect();
    const percent = (window.innerHeight - rect.top) / rect.height * 100;
    for (const threshold of [50, 90]) if (percent >= threshold && !milestones.has(threshold)) {
      milestones.add(threshold);
      capture('guide_read', { scroll_percent: threshold });
    }
  }, { passive: true });
  window.addEventListener('pagehide', () => { if (pageCaptured) capture('$pageleave'); });
})();
