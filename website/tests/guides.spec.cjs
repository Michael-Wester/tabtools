const { test, expect } = require('@playwright/test');
const L = require('../../scripts/localisation');
const G = require('../guide-localisation.cjs');

const failures = new WeakMap();
test.beforeEach(async ({ page }, testInfo) => {
  const errors = [];
  failures.set(page, errors);
  await page.addInitScript(theme => {
    if (!localStorage.getItem('tabtools-site-theme')) localStorage.setItem('tabtools-site-theme', theme);
  }, testInfo.project.metadata.theme);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().startsWith('http://127.0.0.1:4173/') && response.status() >= 400) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:4173') return route.continue();
    if (url.hostname === 'www.youtube-nocookie.com') return route.fulfill({ contentType: 'text/html', body: '<html><body>Demo</body></html>' });
    return route.abort();
  });
});
test.afterEach(async ({ page }) => {
  if (failures.has(page)) expect(failures.get(page), 'Guide navigation has no uncaught errors or missing local assets').toEqual([]);
});

async function checkLayout(page) {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
  }));
  expect(dimensions.content, 'Translated guide content fits the viewport').toBeLessThanOrEqual(dimensions.width + 1);
  for (const link of await page.locator('.main-nav a').all()) {
    await expect(link).toBeInViewport();
    await link.click({ trial: true });
  }
}

for (const [index, locale] of L.registry.entries()) {
  const translated = G.catalogue(locale.locale);
  const target = L.registry[(index + 1) % L.registry.length];
  const targetCopy = G.catalogue(target.locale);
  test(`${locale.locale}: all guides, locale switching and browser history preserve the article`, async ({ page }, testInfo) => {
    await page.goto(locale.path);
    await page.locator(`.main-nav a[href="${G.routeFor(locale)}"]`).click();
    await expect(page).toHaveURL(G.routeFor(locale));
    await expect(page.locator('html')).toHaveAttribute('lang', locale.canonical);
    await page.goBack();
    await expect(page).toHaveURL(locale.path);
    await page.locator(`.site-footer a[href="${G.routeFor(locale)}"]`).click();
    await expect(page).toHaveURL(G.routeFor(locale));
    await checkLayout(page);

    for (const guide of translated.guides) {
      const route = G.routeFor(locale, guide.slug);
      await page.locator(`.guide-card[href="${route}"]`).click();
      await expect(page).toHaveURL(route);
      await expect(page.locator('h1')).toHaveText(guide.title);
      await expect(page.locator('html')).toHaveAttribute('data-theme', testInfo.project.metadata.theme);
      await checkLayout(page);
      if (guide.slug === G.source.guides[0].slug && ['zh-CN', 'zh-TW', 'he', 'de'].includes(locale.locale)) {
        await page.locator('img').evaluateAll(async images => {
          for (const image of images) image.loading = 'eager';
          await Promise.all(images.map(image => image.decode().catch(() => {})));
        });
        await page.evaluate(() => document.fonts.ready);
        const screenshot = testInfo.outputPath(locale.locale + '-guide.png');
        await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
        await testInfo.attach(locale.locale + '-guide', { path: screenshot, contentType: 'image/png' });
      }
      if (locale.locale !== 'en') await expect(page.locator('.guide-screenshot-note')).toHaveText(translated.ui.screenshotNote);
      const anchor = guide.sections[1].id;
      await page.locator(`.guide-sidebar a[href="#${anchor}"]`).click();
      await expect(page).toHaveURL(route + '#' + anchor);
      const heading = page.locator(`#${anchor} h2`);
      await expect(heading).toBeInViewport();
      const header = await page.locator('.site-header').boundingBox();
      const headingBox = await heading.boundingBox();
      expect(headingBox.y, 'Guide anchor clears the wrapped localized header').toBeGreaterThanOrEqual(header.height - 1);

      // Direct deep links and reloading must preserve the explicit language,
      // even after a different preference was saved earlier in this session.
      const suffix = '?review=guides#' + anchor;
      await page.goto(route + suffix);
      await page.reload();
      await expect(page).toHaveURL(route + suffix);
      await page.locator('[data-language-trigger]').tap();
      const choice = page.locator(`[data-language-option][data-locale="${target.locale}"]`);
      const counterpart = G.routeFor(target, guide.slug) + suffix;
      await expect(choice).toHaveAttribute('href', counterpart);
      await choice.tap();
      await expect(page).toHaveURL(counterpart);
      await expect(page.locator('html')).toHaveAttribute('lang', target.canonical);
      await expect(page.locator('h1')).toHaveText(targetCopy.guides.find(item => item.slug === guide.slug).title);
      await expect(page.locator(`[data-language-option][data-locale="${target.locale}"]`)).toHaveAttribute('aria-selected', 'true');
      await page.goBack();
      await expect(page).toHaveURL(route + suffix);
      await page.goForward();
      await expect(page).toHaveURL(counterpart);
      await page.goBack();
      await expect(page).toHaveURL(route + suffix);
      await page.locator(`.main-nav a[href="${G.routeFor(locale)}"]`).click();
      await expect(page).toHaveURL(G.routeFor(locale));
    }
    // Intentional Home navigation remains available after reading a guide.
    await page.locator('.site-header .brand').click();
    await expect(page).toHaveURL(locale.path + '#top');
    await expect(page.locator('[data-language-picker]')).toBeVisible();
  });
}

test.describe('Guides without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  for (const localeCode of ['zh-CN', 'zh-TW', 'he']) {
    const locale = L.localeInfo(localeCode);
    test(`${localeCode}: native language links keep index and article routes`, async ({ page }) => {
      for (const slug of ['', ...G.source.guides.map(guide => guide.slug)]) {
        await page.goto(G.routeFor('en', slug));
        await page.locator('.language-fallback summary').click();
        const choice = page.locator(`.language-fallback-option[href="${G.routeFor(locale, slug)}"]`);
        await choice.tap();
        await expect(page).toHaveURL(G.routeFor(locale, slug));
        await expect(page.locator('html')).toHaveAttribute('lang', locale.canonical);
        await expect(page.locator('h1')).toBeVisible();
        await checkLayout(page);
      }
    });
  }
});
