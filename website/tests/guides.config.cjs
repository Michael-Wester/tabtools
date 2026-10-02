const { defineConfig, devices } = require('@playwright/test');
const localization = require('./localisation.config.cjs');
const mobileMatch = '**/guides.spec.cjs';
const desktopMatch = '**/guides-desktop.spec.cjs';
module.exports = defineConfig({
  ...localization,
  testMatch: [mobileMatch, desktopMatch],
  timeout: 60_000,
  outputDir: 'test-results/guides',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/guides' }]],
  projects: [
    ...localization.projects.map(project => ({ ...project, name: project.name.replace('localisation', 'guides'), testMatch: mobileMatch })),
    ...['chromium', 'webkit'].map(browserName => ({
      name: `${browserName}-guides-desktop`,
      testMatch: desktopMatch,
      use: { ...devices[browserName === 'webkit' ? 'Desktop Safari' : 'Desktop Chrome'], browserName }
    }))
  ]
});
