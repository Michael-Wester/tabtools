'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './extension-playwright',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 2,
  timeout: 60_000,
  // A real browser popup is timing-sensitive; one retry keeps a slow runner from failing the run.
  retries: process.env.CI ? 1 : 0,
  expect: { timeout: 7_000 },
  // On GitHub a failure is also written onto the pull request, with its message.
  reporter: process.env.GITHUB_ACTIONS ? [['line'], ['github']] : 'line',
  outputDir: 'test-results/native-extension'
});
