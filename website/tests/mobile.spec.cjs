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
    // The site asks nothing of other origins; anything that tries is stopped.
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
  const clipped = await page.locator('.site-header, .shell, .guide-card, .feature, .specimen, .demo, .pp, .guide-article').evaluateAll(elements =>
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
    await page.goto('http://127.0.0.1:4173/');
    await expect(page.locator('.hero-actions .browser-button-prefix')).toHaveText('Add to');
    for (const note of await page.locator('[data-mobile-note]').all()) await expect(note).toBeHidden();
    await checkOverflow(page);
    expect(errors, 'No uncaught page errors').toEqual([]);
  } finally {
    await context.close();
  }
});

// The working popup on the home page, at every width, and in the dark at one.
test('the working popup closes, restores and sorts its sample tabs', async ({ page }, testInfo) => {
  const { mobile, theme, width } = testInfo.project.metadata;
  test.skip(theme === 'dark' && width !== 390, 'the popup behaves the same in both themes');
  await page.goto('/');
  const demo = page.locator('[data-demo]');
  await expect(demo).toHaveAttribute('data-demo', 'ready');
  const press = locator => (mobile ? locator.tap() : locator.click());
  const tabs = demo.locator('[data-demo-strip] [data-tab]');
  const status = demo.locator('[data-pp-status]');
  await expect(tabs).toHaveCount(24);
  await expect(demo.locator('[data-pp-tabs]')).toHaveText('24 tabs');
  await expect(demo.locator('[data-pp-sites]')).toHaveText('8 sites');
  await expect(demo.locator('[data-pp-site]')).toHaveCount(8);

  // A site row closes that site's tabs and offers Undo.
  const github = demo.locator('[data-pp-site][data-host="github.com"]');
  await expect(github).toHaveAccessibleName('Close tabs from github.com · 6 open tabs');
  await expect(github.locator('.pp-ticks i')).toHaveCount(6);
  await press(github);
  await expect(status).toHaveText('Closed: 6');
  await expect(tabs).toHaveCount(18);
  await expect(demo.locator('[data-pp-tabs]')).toHaveText('18 tabs');
  await expect(demo.locator('[data-pp-site][data-host="github.com"]')).toHaveCount(0);
  await press(demo.locator('[data-pp-undo]'));
  await expect(status).toHaveText('Restored: 6');
  await expect(tabs).toHaveCount(24);
  await expect(demo.locator('[data-pp-undo]')).toBeHidden();

  // While a close is under way nothing else starts: a Reset or Sort pressed in
  // the same instant must not act on tabs that are about to go.
  await page.evaluate(() => {
    for (const selector of ['[data-pp-site][data-host="github.com"]', '[data-pp-reset]', '[data-pp-sort]']) {
      document.querySelector('[data-demo] ' + selector).click();
    }
  });
  await expect(status).toHaveText('Closed: 6');
  await expect(tabs).toHaveCount(18);
  await press(demo.locator('[data-pp-undo]'));
  await expect(tabs).toHaveCount(24);
  expect(await tabs.evaluateAll(all => all.map(tab => Number(tab.dataset.tab)))).toEqual(Array.from({ length: 24 }, (_, index) => index + 1));

  // Closing the site in view brings a neighbour into view; Undo brings the tab back into view.
  const address = demo.locator('[data-demo-address]');
  await expect(address).toHaveText('en.wikipedia.org/wiki/Web_browser');
  await press(demo.locator('[data-pp-site][data-host="en.wikipedia.org"]'));
  await expect(status).toHaveText('Closed: 3');
  await expect(address).not.toHaveText(/wikipedia/);
  await expect(demo.locator('[data-demo-strip] .is-active')).toHaveCount(1);
  await press(demo.locator('[data-pp-undo]'));
  await expect(address).toHaveText('en.wikipedia.org/wiki/Web_browser');
  await expect(demo.locator('[data-demo-strip] .is-active')).toHaveAttribute('data-tab', '13');

  // Typing lists matches first; a site includes its subdomains; Enter closes what is listed.
  const field = demo.locator('[data-pp-query]');
  await field.fill('google.com');
  await expect(demo.locator('[data-pp-match-rows] .pp-tab')).toHaveCount(6);
  await expect(demo.locator('[data-pp-close-count]')).toHaveText('6');
  await expect(tabs).toHaveCount(24);
  await field.fill('nothing like this');
  await expect(demo.locator('[data-pp-match-empty]')).toBeVisible();
  await expect(demo.locator('[data-pp-close]')).toBeHidden();
  await field.fill('wiki');
  await expect(demo.locator('[data-pp-match-rows] mark').first()).toHaveText(/wiki/i);
  await field.press('Enter');
  await expect(status).toHaveText('Closed: 3');
  await expect(field).toHaveValue('');
  await expect(demo.locator('[data-pp-clear]')).toBeHidden();
  await expect(tabs).toHaveCount(21);

  // Inactive opens a list to review; nothing closes until Close.
  await press(demo.locator('[data-pp-inactive-row]'));
  await expect(demo.locator('[data-pp-back="inactive"]')).toBeFocused();
  const listed = await demo.locator('[data-pp-inactive-rows] .pp-tab').count();
  expect(listed).toBeGreaterThan(0);
  // The bar counts the tabs listed, not every open tab.
  await expect(demo.locator('[data-pp-inactive-meta]')).toHaveText(listed + ' open tabs');
  await expect(tabs).toHaveCount(21);
  await expect(demo.locator('[data-pp-inactive-close-count]')).toHaveText(String(listed));
  await press(demo.locator('[data-view~="inactive"] [data-pp-step="1"]'));
  await expect(demo.locator('[data-view~="inactive"] [data-pp-threshold]')).toHaveText('4 hours');
  const fewer = await demo.locator('[data-pp-inactive-rows] .pp-tab').count();
  expect(fewer).toBeLessThan(listed);
  await press(demo.locator('[data-pp-inactive-close]'));
  await expect(status).toHaveText('Inactive tabs closed: ' + fewer);
  await expect(tabs).toHaveCount(21 - fewer);

  // Sorting keeps every tab and puts the busiest site first.
  await press(demo.locator('[data-pp-reset]'));
  await expect(tabs).toHaveCount(24);
  await press(demo.locator('[data-pp-sort]'));
  await expect(status).toHaveText(/^Tabs reordered: \d+$/);
  await expect(tabs).toHaveCount(24);
  expect(await tabs.evaluateAll(all => all.slice(0, 6).map(tab => tab.dataset.host))).toEqual(Array(6).fill('github.com'));
  // A result can be dismissed, which gives the footer back.
  await expect(demo.locator('[data-pp-dismiss]')).toHaveAccessibleName('Dismiss');
  await press(demo.locator('[data-pp-dismiss]'));
  await expect(status).toHaveText('');
  await expect(demo.locator('[data-pp-sort]')).toBeVisible();
  await expect(demo.locator('[data-pp-dismiss]')).toBeHidden();
  await press(demo.locator('[data-pp-duplicates-row]'));
  await expect(status).toHaveText('Duplicate tabs closed: 3');
  await expect(demo.locator('[data-pp-duplicates-row]')).toBeDisabled();
  await checkOverflow(page);
});

test('the popup lists what it closed under Recently closed and reopens a tab where it was', async ({ page }, testInfo) => {
  const { mobile, theme, width } = testInfo.project.metadata;
  test.skip(![320, 390, 1280].includes(width) || (theme === 'dark' && width !== 390), 'the narrowest phone, one phone and one desktop width; both themes on one');
  await page.goto('/');
  const demo = page.locator('[data-demo]');
  const press = locator => (mobile ? locator.tap() : locator.click());
  const status = demo.locator('[data-pp-status]');
  const tabs = demo.locator('[data-demo-strip] [data-tab]');
  const order = () => tabs.evaluateAll(all => all.map(tab => Number(tab.dataset.tab)));
  const rows = demo.locator('[data-pp-reopen]');
  const titles = () => rows.locator('.pp-tab-title').allTextContents();
  await expect(demo).toHaveAttribute('data-demo', 'ready');

  // Inactive and Close duplicates share one row, and both fit in it.
  const [idle, copies] = await Promise.all(['[data-pp-inactive-row]', '[data-pp-duplicates-row]'].map(selector => demo.locator(selector).boundingBox()));
  expect(Math.abs(idle.y - copies.y)).toBeLessThan(1);
  expect(idle.x + idle.width).toBeLessThanOrEqual(copies.x + 1);
  expect(await demo.locator('.pp-pair .pp-label, .pp-pair .pp-count').evaluateAll(all => all.filter(part => part.scrollWidth > part.clientWidth + 1).length)).toBe(0);

  // Nothing has been closed yet.
  await press(demo.locator('[data-pp-recent-toggle]'));
  await expect(demo.locator('[data-pp-back="recent"]')).toBeFocused();
  await expect(demo.locator('[data-pp-recent-empty]')).toHaveText('No recently closed tabs');
  await expect(demo.locator('[data-pp-recent-clear]')).toBeDisabled();
  await press(demo.locator('[data-pp-back="recent"]'));
  await expect(demo.locator('[data-pp-recent-toggle]')).toBeFocused();

  // Two closes: the latest is listed first, and what Undo brings back is not listed.
  await press(demo.locator('[data-pp-site][data-host="news.ycombinator.com"]'));
  await expect(status).toHaveText('Closed: 2');
  await press(demo.locator('[data-pp-dismiss]'));
  await press(demo.locator('[data-pp-site][data-host="calendar.google.com"]'));
  await expect(status).toHaveText('Closed: 1');
  await press(demo.locator('[data-pp-undo]'));
  await expect(tabs).toHaveCount(22);
  await press(demo.locator('[data-pp-dismiss]'));
  await press(demo.locator('[data-pp-duplicates-row]'));
  await expect(status).toHaveText('Duplicate tabs closed: 3');
  await press(demo.locator('[data-pp-dismiss]'));
  await press(demo.locator('[data-pp-recent-toggle]'));
  await expect(demo.locator('[data-pp-recent-meta]')).toHaveText('5 tabs');
  expect(await titles()).toEqual(['Pull requests · tabtools', 'YouTube', 'Tab (interface) - Wikipedia', 'Hacker News', 'Ask HN: How many tabs do you have open?']);
  await expect(rows.nth(3)).toHaveAccessibleName('Reopen: Hacker News');
  await checkOverflow(page);

  // A row reopens its tab in the place it had, behind the tab in view.
  const inView = await demo.locator('[data-demo-strip] .is-active').getAttribute('data-tab');
  await press(rows.nth(3));
  await expect(status).toHaveText('Restored: 1');
  await expect(tabs).toHaveCount(20);
  await expect(rows).toHaveCount(4);
  const now = await order();
  expect(now.indexOf(11)).toBe(now.indexOf(10) + 1);
  await expect(demo.locator('[data-demo-strip] .is-active')).toHaveAttribute('data-tab', inView);
  await expect(demo.locator('[data-pp-undo]')).toBeHidden();

  // Clear list empties the list and reopens nothing; Reset starts over.
  await press(demo.locator('[data-pp-dismiss]'));
  await press(demo.locator('[data-pp-recent-clear]'));
  await expect(rows).toHaveCount(0);
  await expect(demo.locator('[data-pp-recent-empty]')).toBeVisible();
  await expect(tabs).toHaveCount(20);
  await press(demo.locator('[data-pp-back="recent"]'));
  await press(demo.locator('[data-pp-site][data-host="mail.google.com"]'));
  await expect(status).toHaveText('Closed: 1');
  await press(demo.locator('[data-pp-reset]'));
  await expect(tabs).toHaveCount(24);
  await press(demo.locator('[data-pp-recent-toggle]'));
  await expect(rows).toHaveCount(0);
  await expect(demo.locator('[data-pp-recent-empty]')).toBeVisible();
});

test('the popup\'s Settings change this page\'s theme and accent, and return it to the system\'s', async ({ page }, testInfo) => {
  const { mobile, theme, width } = testInfo.project.metadata;
  test.skip(![390, 1280].includes(width), 'one phone and one desktop width');
  await page.goto('/');
  const demo = page.locator('[data-demo]');
  const html = page.locator('html');
  const press = locator => (mobile ? locator.tap() : locator.click());
  await press(demo.locator('[data-pp-open="settings"]'));
  await expect(demo.locator(`[data-pp-theme="${theme}"]`)).toHaveAttribute('aria-pressed', 'true');
  const other = theme === 'light' ? 'dark' : 'light';
  await press(demo.locator(`[data-pp-theme="${other}"]`));
  await expect(html).toHaveAttribute('data-theme', other);
  await expect(page.locator('[data-theme-toggle]')).toHaveAttribute('aria-label', `Switch to ${theme} mode`);
  await press(demo.locator('[data-pp-theme="system"]'));
  await expect(html).not.toHaveAttribute('data-theme', /./);
  expect(await page.evaluate(() => localStorage.getItem('tabtools-site-theme'))).toBeNull();
  // The test's browser is set to the project's theme, so that is what the system asks for.
  await expect(page.locator('[data-theme-toggle]')).toHaveAttribute('aria-label', `Switch to ${other} mode`);
  await press(demo.locator('[data-pp-accent="green"]'));
  await expect(html).toHaveAttribute('data-accent', 'green');
  await page.reload();
  await expect(html).toHaveAttribute('data-accent', 'green');
  await press(demo.locator('[data-pp-open="settings"]'));
  await expect(demo.locator('[data-pp-accent="green"]')).toHaveAttribute('aria-pressed', 'true');
  await press(demo.locator('[data-pp-accent="purple"]'));
  await expect(html).not.toHaveAttribute('data-accent', /./);
  expect(await page.evaluate(() => localStorage.getItem('tabtools-site-accent'))).toBeNull();
});

test.describe('without a saved theme', () => {
  test('the page follows the system\'s light or dark setting', async ({ browser }, testInfo) => {
    const { theme, width } = testInfo.project.metadata;
    test.skip(![390, 1280].includes(width), 'one phone and one desktop width');
    // A context of its own: the shared one saves a theme before each page loads.
    const context = await browser.newContext({ colorScheme: theme, viewport: { width: testInfo.project.metadata.width, height: 900 } });
    try {
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:4173/');
      await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
      const paper = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(paper).toBe(theme === 'dark' ? 'rgb(26, 27, 33)' : 'rgb(246, 246, 244)');
      expect(await page.evaluate(() => localStorage.getItem('tabtools-site-theme'))).toBeNull();
      await expect(page.locator('[data-theme-toggle]')).toHaveAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    } finally {
      await context.close();
    }
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the popup is a picture of its starting state and links to a section clear the header', async ({ page }, testInfo) => {
    // A phone, a tablet with the two-row pinned header, and a desktop.
    test.skip(![390, 768, 1280].includes(testInfo.project.metadata.width) || testInfo.project.metadata.theme !== 'light');
    await page.goto('/');
    const demo = page.locator('[data-demo]');
    await expect(demo.locator('[data-pp-site]')).toHaveCount(8);
    await expect(demo.locator('[data-pp-tabs]')).toHaveText('24 tabs');
    await expect(demo.locator('.demo')).toHaveAttribute('inert', '');
    await expect(demo.locator('[data-pp-reset]')).toBeHidden();
    await page.goto('/guides/close-duplicate-tabs/#which-copy-stays');
    const heading = page.locator('#which-copy-stays h2');
    await expect(heading).toBeInViewport();
    const header = await page.locator('.site-header').boundingBox();
    const box = await heading.boundingBox();
    expect(box.y, 'the heading is below the header').toBeGreaterThanOrEqual(header.y + header.height - 1);
  });
});

// On a phone the header scrolls away, so it cannot cover what the keyboard reaches.
test('nothing the keyboard reaches is under the header', async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.width > 430 || testInfo.project.metadata.theme !== 'light');
  await page.goto('/de/guides/close-duplicate-tabs/');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const covered = [];
  let stops = 0;
  for (; stops < 80; stops += 1) {
    await page.keyboard.press('Shift+Tab');
    const result = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return null;
      // The skip link is drawn above the header, at the top of the window, by design.
      if (element.matches('.skip-link')) return { skip: true };
      // What is drawn on top at the focused control's first line?
      const box = element.getBoundingClientRect();
      const x = Math.min(Math.max(box.left + Math.min(box.width / 2, 20), 0), window.innerWidth - 1);
      const y = box.top + Math.min(box.height / 2, 10);
      const onTop = document.elementFromPoint(x, y);
      return {
        name: (element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 40),
        inView: y >= 0 && y < window.innerHeight,
        covered: Boolean(onTop && onTop.closest('.site-header') && !element.closest('.site-header'))
      };
    });
    if (!result) break;
    if (!result.skip && (!result.inView || result.covered)) covered.push(result);
  }
  expect(stops, 'the page was walked').toBeGreaterThan(20);
  expect(covered).toEqual([]);
});
