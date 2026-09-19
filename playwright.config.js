'use strict';

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './playwright',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    }
  ],
  webServer: {
    command: 'node playwright/static-server.js --port 4173',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
