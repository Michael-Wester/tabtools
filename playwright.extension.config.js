'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './extension-playwright',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 2,
  timeout: 60_000,
  expect: { timeout: 7_000 },
  reporter: 'line',
  outputDir: 'test-results/native-extension'
});
