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
    // Firefox's DOM trace snapshotter reads layout during document navigation,
    // producing its own forced-layout warnings. Keep screenshots and trace
    // events without DOM snapshots so diagnostics describe the authored site.
    trace: { mode: 'retain-on-failure', snapshots: false, screenshots: true }
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
