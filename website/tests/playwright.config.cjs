const { defineConfig, devices } = require('@playwright/test');

const widths = [320, 390, 430, 768, 1280];
const themes = ['light', 'dark'];
const browsers = ['chromium', 'webkit'];

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: '**/mobile.spec.cjs',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 4 : undefined,
  timeout: 30_000,
  // On GitHub a failure is also written onto the pull request, with its message.
  reporter: [['list'], ['html', { open: 'never' }], ...(process.env.GITHUB_ACTIONS ? [['github']] : [])],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: browsers.flatMap(browserName => widths.flatMap(width => themes.map(theme => {
    const mobile = width <= 768;
    const device = devices[browserName === 'webkit'
      ? (mobile ? 'iPhone 13' : 'Desktop Safari')
      : (mobile ? 'Pixel 7' : 'Desktop Chrome')];
    return {
      name: `${browserName}-${width}-${theme}`,
      metadata: { theme, mobile, width },
      use: {
        ...device,
        browserName,
        viewport: { width, height: 900 },
        deviceScaleFactor: 1,
        colorScheme: theme
      }
    };
  }))),
  webServer: {
    command: 'node server.cjs',
    cwd: __dirname,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 10_000
  }
});
