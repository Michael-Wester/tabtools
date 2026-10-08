const { test, expect } = require('@playwright/test');
const L = require('../../scripts/localisation');

const errors = new WeakMap();
const browserNames = { chrome: 'Chrome', firefox: 'Firefox', edge: 'Edge' };

test.beforeEach(async ({ page }, testInfo) => {
  const failures = [];
  errors.set(page, failures);
  page.on('pageerror', error => failures.push(error.message));
  await page.addInitScript(theme => {
    if (!localStorage.getItem('tabtools-site-theme')) localStorage.setItem('tabtools-site-theme', theme);
  }, testInfo.project.metadata.theme);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:4173') return route.continue();
    return route.abort();
  });
});

test.afterEach(async ({ page }) => {
  // A browser fixture startup failure occurs before our handler is installed.
  // Preserve that original diagnostic instead of adding an unrelated assertion.
  if (errors.has(page)) expect(errors.get(page), 'No uncaught errors on localized pages').toEqual([]);
});

async function checkGeometry(page) {
  const result = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const elements = document.querySelectorAll('.site-header, .shell, .feature, .specimen, .demo, .pp, .privacy-card, .final-cta-inner, .language-menu, .language-fallback-menu');
    return {
      width,
      content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      clipped: Array.from(elements).flatMap(element => {
        const rect = element.getBoundingClientRect();
        return rect.width && (rect.left < -1 || rect.right > width + 1)
          ? [{ element: element.className, left: rect.left, right: rect.right }]
          : [];
      })
    };
  });
  expect(result.content, 'Translated content must not create horizontal scrolling').toBeLessThanOrEqual(result.width + 1);
  expect(result.clipped, 'Visible page sections and the open language menu fit the viewport').toEqual([]);
}

test.describe('JavaScript-disabled localization', () => {
  test.use({ javaScriptEnabled: false });
  for (const localeCode of ['de', 'es', 'ja', 'he', 'zh-TW']) {
    const locale = L.localeInfo(localeCode);
    test(`${localeCode}: translated content, native language links and FAQ remain usable`, async ({ page }) => {
      await page.goto(locale.path);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('[data-language-picker]')).toBeHidden();
      await expect(page.locator('[data-theme-toggle]')).toBeHidden();
      const fallback = page.locator('.language-fallback');
      const trigger = fallback.locator('summary');
      await expect(trigger).toBeInViewport();
      const box = await trigger.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      await trigger.tap();
      await expect(fallback).toHaveAttribute('open', '');
      const links = fallback.locator('a');
      await expect(links).toHaveCount(L.registry.length);
      await checkGeometry(page);
      const spanish = fallback.locator('a[href="/es/"]');
      await spanish.tap();
      await expect(page).toHaveURL('/es/');
      await expect(page.locator('html')).toHaveAttribute('lang', 'es-ES');
      const faq = page.locator('.faq-list details').nth(1);
      await faq.locator('summary').tap();
      await expect(faq).toHaveAttribute('open', '');
      await expect(faq.locator('p').first()).toBeVisible();
      await checkGeometry(page);
    });
  }
});

async function checkHeader(page) {
  const links = page.locator('.main-nav a');
  await expect(links).toHaveCount(5);
  const controls = page.locator('.main-nav a, .nav-actions button, .nav-actions a:not([data-language-option])');
  for (const control of await controls.all()) {
    await expect(control).toBeInViewport();
    await control.click({ trial: true });
    const box = await control.boundingBox();
    expect(box.width, 'Header touch target width').toBeGreaterThanOrEqual(44);
    expect(box.height, 'Header touch target height').toBeGreaterThanOrEqual(44);
  }
}

for (const locale of L.registry) {
  test(`${locale.locale}: narrow localized homepage and touch controls`, async ({ page }, testInfo) => {
    const catalogue = L.catalogue(locale.locale);
    const theme = testInfo.project.metadata.theme;
    await page.goto(locale.path);
    await expect(page.locator('html')).toHaveAttribute('lang', locale.canonical);
    await expect(page.locator('html')).toHaveAttribute('dir', locale.direction);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('h1')).toBeVisible();
    await checkGeometry(page);
    // CI's wider system font exposed intrinsic grid sizing and long heading
    // words that the local fallback font concealed. Keep both layouts checked.
    if (testInfo.project.metadata.width === 320 && ['hu', 'uk'].includes(locale.locale)) {
      await page.addStyleTag({ content: 'body { font-family: "DejaVu Sans", sans-serif; }' });
      await checkGeometry(page);
    }
    await checkHeader(page);

    // Test the complete translated placeholder order, including suffixes in
    // Japanese and Korean, rather than assuming English prefix ordering.
    for (const link of await page.locator('[data-store]:visible').all()) {
      const browser = browserNames[await link.getAttribute('data-store')];
      const copy = link.locator('[data-browser-copy]');
      if (await copy.count()) await expect(copy).toHaveText(catalogue.web_view.replace('{browser}', browser));
      expect(await link.getAttribute('aria-label')).toContain(browser);
    }
    for (const note of await page.locator('[data-mobile-note]').all()) await expect(note).toBeVisible();

    const trigger = page.locator('[data-language-trigger]');
    await trigger.tap();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const selected = page.locator(`[data-language-option][data-locale="${locale.locale}"]`);
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    await expect(selected).toBeFocused();
    await expect(selected).toBeInViewport();
    await expect(page.locator('[data-language-option]')).toHaveCount(L.registry.length);
    // Each language goes by its own name, whatever the page's language.
    await expect(selected.locator('.language-option-name')).toHaveText(locale.nativeName);
    await expect(page.locator('[data-language-option][data-locale="ja"] .language-option-name')).toHaveText('日本語');
    await expect(trigger).toHaveAttribute('aria-label', catalogue.web_language + ': ' + locale.nativeName);
    // The working popup shows this language's words wherever the extension has them.
    await expect(page.locator('[data-demo] .pp-list-title').first()).toHaveText(catalogue.suggestions);
    await expect(page.locator('[data-demo] [data-pp-sort]')).toHaveText(catalogue.sortTabs);
    await expect(page.locator('[data-demo] [data-pp-site]')).toHaveCount(8);
    await checkGeometry(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-language-menu]')).toBeHidden();
    await expect(trigger).toBeFocused();

    const toggle = page.locator('[data-theme-toggle]');
    await toggle.tap();
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme);
    await expect(toggle).toHaveAttribute('aria-label', nextTheme === 'dark' ? catalogue.web_switchLight : catalogue.web_switch_to_dark_mode);
    expect(await page.evaluate(() => localStorage.getItem('tabtools-site-theme'))).toBe(nextTheme);
    await checkGeometry(page);
  });
}

for (const localeCode of ['de', 'es', 'ja', 'he', 'zh-TW']) {
  const locale = L.localeInfo(localeCode);
  test(`${localeCode}: keyboard menu, saved language, anchor and focus navigation`, async ({ page }) => {
    await page.goto(locale.path + '?review=localisation#faq');
    const trigger = page.locator('[data-language-trigger]');
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    const selected = page.locator(`[data-language-option][data-locale="${localeCode}"]`);
    await expect(selected).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.locator('[data-language-option]').first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('[data-language-option]').last()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-language-option]').first()).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.locator('[data-language-option]').last()).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('[data-language-menu]')).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.tap();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-language-menu]')).toBeHidden();
    await expect(trigger).not.toBeFocused();

    // New in-page hashes must reach native links before a new-tab/context-menu
    // action; an ordinary touch activation must save the chosen locale.
    await page.locator('.main-nav a[href="#features"]').tap();
    await expect(page).toHaveURL(/\?review=localisation#features$/);
    await trigger.tap();
    const spanish = page.locator('[data-language-option][data-locale="es"]');
    await expect(spanish).toHaveAttribute('href', '/es/?review=localisation#features');
    await spanish.tap();
    await expect(page).toHaveURL('/es/?review=localisation#features');
    expect(await page.evaluate(() => localStorage.getItem('tabtools-site-language'))).toBe('es');
    await expect(page.locator('[data-language-suggestion]')).toBeHidden();

    const featureBox = await page.locator('#features').boundingBox();
    const headerBox = await page.locator('.site-header').boundingBox();
    // The header stays put on wide windows and scrolls away on phones; either way it must not cover the section.
    expect(featureBox.y, 'Translated anchor clears the header').toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);
    await page.locator('.main-nav a[href="#privacy"]').tap();
    await expect(page.locator('#privacy')).toBeFocused();
    await expect(page.locator('#privacy h2')).toBeInViewport();
    await checkGeometry(page);
  });
}
