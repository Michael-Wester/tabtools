const { defineConfig, devices } = require('@playwright/test');
const base = require('./playwright.config.cjs');

// Keep translations out of the English guide/viewport matrix. Every locale gets
// both smallest supported widths and both rendering engines; interaction cases
// additionally exercise expanded Latin, CJK and RTL text.
module.exports = defineConfig({
  ...base,
  testMatch: '**/localisation.spec.cjs',
  outputDir: 'test-results/localisation',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/localisation' }]],
  projects: ['chromium', 'webkit'].flatMap(browserName => [320, 390].map(width => ({
    name: `${browserName}-localisation-${width}`,
    metadata: { width, mobile: true, theme: width === 320 ? 'light' : 'dark' },
    use: {
      ...devices[browserName === 'webkit' ? 'iPhone 13' : 'Pixel 7'],
      browserName,
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: width === 320 ? 'light' : 'dark'
    }
  })))
});
