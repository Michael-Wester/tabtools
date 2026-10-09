'use strict';

const assert = require('node:assert/strict');
const { test, expect } = require('@playwright/test');

const thirdPartyDiagnosticsByPage = new WeakMap();
const representativeLocales = [
  { locale: 'de', path: '/de/', direction: 'ltr' },
  { locale: 'ja', path: '/ja/', direction: 'ltr' },
  { locale: 'he', path: '/he/', direction: 'rtl' }
];

function firstPartyUrl(value, origin) {
  try {
    return new URL(value).origin === origin;
  } catch (_) {
    return false;
  }
}

function watchDiagnostics(page, origin) {
  const diagnostics = [];
  const thirdPartyDiagnostics = [];
  thirdPartyDiagnosticsByPage.set(page, thirdPartyDiagnostics);
  page.on('console', message => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    const location = message.location();
    const diagnostic = `console.${message.type()} ${location.url || '(unknown source)'}:${location.lineNumber}: ${message.text()}`;
    let sourceOrigin;
    try { sourceOrigin = new URL(location.url).origin; } catch (_) {}
    // Keep unknown and opaque sources in the failure set. Only an explicit
    // different origin is somebody else's, and the site loads nothing from one.
    if (sourceOrigin && sourceOrigin !== 'null' && sourceOrigin !== origin) {
      thirdPartyDiagnostics.push(diagnostic);
    } else {
      diagnostics.push(diagnostic);
    }
  });
  page.on('pageerror', error => {
    diagnostics.push(`pageerror: ${error.message}`);
  });
  page.on('requestfailed', request => {
    if (!firstPartyUrl(request.url(), origin)) return;
    diagnostics.push(`requestfailed ${request.url()}: ${request.failure()?.errorText || 'unknown error'}`);
  });
  page.on('response', response => {
    if (response.status() < 400 || !firstPartyUrl(response.url(), origin)) return;
    diagnostics.push(`response ${response.status()} ${response.url()}`);
  });
  return diagnostics;
}

test.afterEach(async ({ page }, testInfo) => {
  const diagnostics = thirdPartyDiagnosticsByPage.get(page) || [];
  if (diagnostics.length) {
    await testInfo.attach('third-party-console-diagnostics', {
      body: diagnostics.join('\n'),
      contentType: 'text/plain'
    });
  }
});

function assertNoDiagnostics(diagnostics) {
  assert.deepEqual(diagnostics, [], diagnostics.join('\n'));
}

async function openLocale(page, path) {
  const origin = new URL('http://127.0.0.1:4173').origin;
  const diagnostics = watchDiagnostics(page, origin);
  // The pages ask nothing of other origins. A request to one is a fault.
  await page.route(url => url.origin !== origin, route => {
    diagnostics.push(`request to another origin: ${route.request().url()}`);
    return route.abort();
  });
  const response = await page.goto(path, { waitUntil: 'load' });
  expect(response, `expected ${path} to return a response`).not.toBeNull();
  expect(response.status(), `expected ${path} to return HTTP 200`).toBe(200);
  await page.waitForLoadState('networkidle');
  return diagnostics;
}

test.describe('Firefox website console smoke', () => {
  test('English page and core navigation stay free of authored diagnostics', async ({ page }) => {
    const diagnostics = await openLocale(page, '/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1')).toContainText('Close tabs');

    await page.locator('[data-theme-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('[data-theme-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.locator('[data-language-trigger]').click();
    await expect(page.locator('[data-language-menu]')).toBeVisible();
    await expect(page.locator('[data-language-option][data-locale="de"]')).toHaveAttribute('href', '/de/');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-language-menu]')).toBeHidden();

    await page.locator('a[href="#privacy"]').first().click();
    await expect(page).toHaveURL(/#privacy$/);
    await expect(page.locator('#privacy')).toBeFocused();

    // The working popup: close a site, undo, list matches, review inactive tabs, change the accent.
    const demo = page.locator('[data-demo]');
    await expect(demo).toHaveAttribute('data-demo', 'ready');
    await demo.locator('[data-pp-site][data-host="github.com"]').click();
    await expect(demo.locator('[data-pp-status]')).toHaveText('Closed: 6');
    await expect(demo.locator('[data-demo-strip] [data-tab]')).toHaveCount(18);
    await demo.locator('[data-pp-undo]').click();
    await expect(demo.locator('[data-demo-strip] [data-tab]')).toHaveCount(24);
    await demo.locator('[data-pp-query]').fill('google.com');
    await expect(demo.locator('[data-pp-match-rows] .pp-tab')).toHaveCount(6);
    await demo.locator('[data-pp-clear]').click();
    await demo.locator('[data-pp-inactive-row]').click();
    await expect(demo.locator('[data-pp-inactive-rows] .pp-tab')).toHaveCount(11);
    await demo.locator('[data-pp-back="inactive"]').click();
    await demo.locator('[data-pp-sort]').click();
    await expect(demo.locator('[data-pp-status]')).toHaveText(/^Tabs reordered: \d+$/);
    await demo.locator('[data-pp-open="settings"]').click();
    await demo.locator('[data-pp-accent="blue"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'blue');
    await demo.locator('[data-pp-accent="purple"]').click();
    await expect(page.locator('html')).not.toHaveAttribute('data-accent', /./);
    assertNoDiagnostics(diagnostics);
  });

  for (const { locale, path, direction } of representativeLocales) {
    test(`${locale} page loads and theme, language and privacy interactions stay clean`, async ({ page }) => {
      const diagnostics = await openLocale(page, path);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', direction);
      await expect(page.locator('h1')).toBeVisible();

      await page.locator('[data-theme-toggle]').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.locator('[data-language-trigger]').click();
      await expect(page.locator('[data-language-menu]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-language-menu]')).toBeHidden();

      await page.locator('a[href="#privacy"]').first().click();
      await expect(page).toHaveURL(/#privacy$/);
      await expect(page.locator('#privacy')).toBeFocused();
      assertNoDiagnostics(diagnostics);
    });
  }

  test('the smoke check catches an authored console warning and page error', async ({ page }) => {
    const diagnostics = await openLocale(page, '/');
    assertNoDiagnostics(diagnostics);
    const before = diagnostics.length;
    await page.evaluate(() => {
      console.warn('smoke check injected warning');
      setTimeout(() => { throw new Error('smoke check injected page error'); }, 0);
    });
    await expect.poll(() => diagnostics.some(item => item.includes('smoke check injected warning'))).toBeTruthy();
    await expect.poll(() => diagnostics.some(item => item.includes('smoke check injected page error'))).toBeTruthy();
    const injected = diagnostics.slice(before);
    expect(injected.join('\n')).toContain('smoke check injected warning');
    expect(injected.join('\n')).toContain('smoke check injected page error');
    expect(() => assertNoDiagnostics(injected)).toThrow(/smoke check injected/);
  });
});

for (const locale of ['zh-CN', 'zh-TW']) {
  test(`Firefox guide language switch to ${locale} retains the article and anchor`, async ({ page }) => {
    const route = '/guides/close-tabs-from-same-website/';
    const suffix = '?review=guide-language#use-the-popup';
    const diagnostics = await openLocale(page, route + suffix);
    await page.locator('[data-language-trigger]').click();
    const prefix = locale === 'zh-CN' ? '/zh-cn' : '/zh-tw';
    // The language handler uses location.assign(). Wait for the destination's
    // stylesheets before Playwright's viewport checks force layout in Firefox.
    await Promise.all([
      page.waitForURL(prefix + route + suffix, { waitUntil: 'load' }),
      page.locator(`[data-language-option][data-locale="${locale}"]`).click()
    ]);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(prefix + route + suffix);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('#use-the-popup h2')).toBeInViewport();
    await page.reload();
    await expect(page).toHaveURL(prefix + route + suffix);
    await page.goBack();
    await expect(page).toHaveURL(route + suffix);
    await page.goForward();
    await expect(page).toHaveURL(prefix + route + suffix);
    await Promise.all([
      page.waitForURL(prefix + '/guides/', { waitUntil: 'load' }),
      page.locator(`.main-nav a[href="${prefix}/guides/"]`).click()
    ]);
    await expect(page).toHaveURL(prefix + '/guides/');
    assertNoDiagnostics(diagnostics);
  });
}
