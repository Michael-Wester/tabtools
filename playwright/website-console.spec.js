'use strict';

const assert = require('node:assert/strict');
const { test, expect } = require('@playwright/test');

const youtubeStub = '<!doctype html><html><body data-playwright-youtube-stub></body></html>';
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
    // different origin belongs to the external player, rather than this site.
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

async function stubExternalDemo(page) {
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: youtubeStub
  }));
}

async function openLocale(page, path) {
  const origin = new URL('http://127.0.0.1:4173').origin;
  const diagnostics = watchDiagnostics(page, origin);
  await stubExternalDemo(page);
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
    // Exercise origin scoping with real script provenance in the stub iframe.
    const externalWarning = 'smoke check injected external warning';
    await page.route('https://www.youtube-nocookie.com/smoke-check-warning.js', route => route.fulfill({
      contentType: 'application/javascript',
      body: `console.warn(${JSON.stringify(externalWarning)});`
    }));
    await page.frameLocator('.product-video').locator('[data-playwright-youtube-stub]').evaluate(body => {
      const script = document.createElement('script');
      script.src = 'https://www.youtube-nocookie.com/smoke-check-warning.js';
      body.append(script);
    });
    await expect.poll(() => thirdPartyDiagnosticsByPage.get(page).some(item => item.includes(externalWarning))).toBeTruthy();
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
