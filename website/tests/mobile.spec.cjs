const { test, expect, devices } = require('@playwright/test');

const pageErrors = new WeakMap();

const routes = [
  '/',
  '/guides/',
  '/guides/close-tabs-from-same-website/',
  '/guides/close-duplicate-tabs/',
  '/guides/sort-tabs-by-website/'
];

test.beforeEach(async ({ page }, testInfo) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(theme => {
    localStorage.setItem('tabtools-site-theme', theme);
  }, testInfo.project.metadata.theme);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:4173') return route.continue();
    // Avoid real video/network traffic and keep screenshots deterministic.
    if (url.hostname === 'www.youtube-nocookie.com') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<html><body style="margin:0;background:#111216;color:#b4b7c2;font:16px system-ui;display:grid;place-items:center;height:100vh">YouTube demo · placeholder in layout tests</body></html>'
      });
    }
    return route.abort();
  });
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page), 'No uncaught page errors').toEqual([]);
});

async function checkOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
  }));
  expect(dimensions.content, 'Page must not scroll horizontally').toBeLessThanOrEqual(dimensions.width + 1);
  const clipped = await page.locator('.site-header, .shell, .guide-card, .feature-card, .guide-article').evaluateAll(elements =>
    elements.flatMap(element => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || (rect.left >= -1 && rect.right <= document.documentElement.clientWidth + 1)) return [];
      return [{ element: element.className, left: rect.left, right: rect.right }];
    }));
  expect(clipped, 'Content must fit even if an ancestor clips overflow').toEqual([]);
}

async function checkHeader(page, width) {
  if (width <= 430) {
    const brand = await page.locator('.site-header .brand').boundingBox();
    const actions = await page.locator('.nav-actions').boundingBox();
    expect(Math.abs(brand.y - actions.y), 'Brand and controls stay on the same header row').toBeLessThan(1);
  }
  const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  await expect(nav).toBeVisible();
  const links = nav.getByRole('link');
  await expect(links).toHaveCount(5);
  for (const link of await links.all()) {
    await expect(link).toBeInViewport();
    // Trial checks hit testing/overlap without leaving the current page.
    await link.click({ trial: true });
    if (width <= 768) {
      const rect = await link.boundingBox();
      expect(rect.height, 'Navigation touch target height').toBeGreaterThanOrEqual(44);
      expect(rect.width, 'Navigation touch target width').toBeGreaterThanOrEqual(44);
    }
  }
  for (const control of await page.locator('.nav-actions button, .nav-actions a:not([data-language-option])').all()) {
    await expect(control).toBeInViewport();
    await control.click({ trial: true });
    const rect = await control.boundingBox();
    expect(rect.height).toBeGreaterThanOrEqual(44);
    expect(rect.width).toBeGreaterThanOrEqual(44);
  }
}

async function saveReviewScreenshot(page, testInfo, route) {
  if (![320, 390].includes(testInfo.project.metadata.width) ||
      !['/', '/guides/close-tabs-from-same-website/'].includes(route)) return;
  // Load below-fold local images before taking a full-page review capture.
  await page.locator('img').evaluateAll(async images => {
    for (const image of images) image.loading = 'eager';
    await Promise.all(images.map(image => image.decode().catch(() => {})));
  });
  await page.evaluate(() => document.fonts.ready);
  const filename = route === '/' ? 'homepage.png' : 'close-site-tabs-guide.png';
  const screenshot = testInfo.outputPath(filename);
  await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
  await testInfo.attach(filename, { path: screenshot, contentType: 'image/png' });
}

for (const route of routes) {
  test(`${route} layout and controls`, async ({ page }, testInfo) => {
    const { theme, mobile, width } = testInfo.project.metadata;
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    if (route === '/' && width === 390 && theme === 'light') {
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('main')).toBeFocused();
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await checkOverflow(page);
    await checkHeader(page, width);
    await saveReviewScreenshot(page, testInfo, route);
    if (mobile) {
      const shortFooterLinks = await page.locator('.footer-links a').evaluateAll(links =>
        links.filter(link => link.getBoundingClientRect().height < 44).map(link => link.textContent));
      expect(shortFooterLinks, 'Footer touch targets must be at least 44px tall').toEqual([]);
    }

    // Mobile copy should send visitors to listings without promising installation.
    const prefixes = page.locator('.browser-button-prefix, [data-install-prefix]');
    for (const prefix of await prefixes.all()) await expect(prefix).toHaveText(mobile ? 'View' : 'Add to');
    for (const note of await page.locator('[data-mobile-note]').all()) {
      if (mobile) await expect(note).toBeVisible();
      else await expect(note).toBeHidden();
    }

    const toggle = page.locator('[data-theme-toggle]');
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    if (mobile) await toggle.tap();
    else await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme);
    await expect(toggle).toHaveAttribute('aria-label', `Switch to ${theme} mode`);
    expect(await page.evaluate(() => localStorage.getItem('tabtools-site-theme'))).toBe(nextTheme);

    if (route === '/') {
      await page.getByRole('navigation', { name: 'Main navigation', exact: true })
        .getByRole('link', { name: 'FAQ', exact: true }).click();
      await expect(page).toHaveURL(/#faq$/);
      const details = page.locator('.faq-list details').nth(1);
      const summary = details.locator('summary');
      await summary.click();
      await expect(details).toHaveAttribute('open', '');
      await expect(details.locator('p')).toBeVisible();
      await summary.click();
      await expect(details).not.toHaveAttribute('open', '');
    } else if (route !== '/guides/') {
      const toc = page.getByRole('navigation', { name: 'On this page', exact: true });
      for (const link of await toc.getByRole('link').all()) {
        if (mobile) {
          const box = await link.boundingBox();
          expect(box.height, 'Guide contents touch target height').toBeGreaterThanOrEqual(44);
        }
        const href = await link.getAttribute('href');
        await link.click();
        await expect(page).toHaveURL(new RegExp(`${href}$`));
        const heading = page.locator(href).locator('h2').first();
        await expect(heading).toBeInViewport();
        const headerBox = await page.locator('.site-header').boundingBox();
        const headingBox = await heading.boundingBox();
        expect(headingBox.y, `${href} must clear the sticky header`).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);
      }
    }
    await checkOverflow(page);
  });
}

test('a narrow desktop window retains desktop store wording', async ({ browser, browserName }, testInfo) => {
  test.skip(testInfo.project.metadata.width !== 390 || testInfo.project.metadata.theme !== 'light');
  const device = devices[browserName === 'webkit' ? 'Desktop Safari' : 'Desktop Chrome'];
  const context = await browser.newContext({ ...device, viewport: { width: 390, height: 900 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://www.youtube-nocookie.com/**', route => route.abort());
    await page.goto('http://127.0.0.1:4173/');
    await expect(page.locator('.hero-actions .browser-button-prefix')).toHaveText('Add to');
    for (const note of await page.locator('[data-mobile-note]').all()) await expect(note).toBeHidden();
    await checkOverflow(page);
    expect(errors, 'No uncaught page errors').toEqual([]);
  } finally {
    await context.close();
  }
});
