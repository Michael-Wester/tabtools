const { test, expect } = require('@playwright/test');
const L = require('../../scripts/localisation');
const G = require('../guide-localisation.cjs');

test('desktop guide keyboard selection and native new-tab links preserve article, query and anchor', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === 'http://127.0.0.1:4173' ? route.continue() : route.abort();
  });
  const slug = 'close-duplicate-tabs';
  const suffix = '?review=keyboard#which-copy-stays';
  await page.goto(G.routeFor('en', slug) + suffix);
  const trigger = page.locator('[data-language-trigger]');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-language-option][data-locale="en"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const chinese = page.locator('[data-language-option][data-locale="zh-CN"]');
  await expect(chinese).toBeFocused();
  await expect(chinese).toHaveAttribute('href', G.routeFor('zh-CN', slug) + suffix);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-language-menu]')).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(G.routeFor('en', slug) + suffix);

  await page.keyboard.press('Enter');
  // A real modifier click must use the rendered href, not the JS assign path.
  const opened = context.waitForEvent('page');
  await chinese.click({ modifiers: ['ControlOrMeta'] });
  const nativeTab = await opened;
  try {
    await nativeTab.waitForLoadState();
    await expect(nativeTab).toHaveURL(G.routeFor('zh-CN', slug) + suffix);
    await expect(nativeTab.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(nativeTab.locator('h1')).toHaveText(G.catalogue('zh-CN').guides.find(guide => guide.slug === slug).title);
    await expect(page).toHaveURL(G.routeFor('en', slug) + suffix);
    expect(await page.evaluate(() => localStorage.getItem('tabtools-site-language'))).toBeNull();
  } finally {
    await nativeTab.close();
  }

  for (const locale of ['zh-CN', 'he']) {
    await trigger.focus();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    const current = await page.locator('html').getAttribute('lang');
    await expect(page.locator(`[data-language-option][data-locale="${current}"]`)).toBeFocused();
    await page.keyboard.press('Home');
    const position = L.presentationRegistry.findIndex(item => item.locale === locale);
    for (let i = 0; i < position; i++) await page.keyboard.press('ArrowDown');
    await expect(page.locator(`[data-language-option][data-locale="${locale}"]`)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(G.routeFor(locale, slug) + suffix);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator(`[data-language-option][data-locale="${locale}"]`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#which-copy-stays h2')).toBeInViewport();
  }
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.goBack();
  await expect(page).toHaveURL(G.routeFor('zh-CN', slug) + suffix);
  await page.goBack();
  await expect(page).toHaveURL(G.routeFor('en', slug) + suffix);
  expect(errors).toEqual([]);
});
