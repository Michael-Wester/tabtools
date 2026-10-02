const { defineConfig } = require('@playwright/test');
const main = require('./playwright.config.cjs');
const localisation = require('./localisation.config.cjs');
const guides = require('./guides.config.cjs');

// One invocation preserves CLI filters and keeps both suites' screenshots and
// traces together. Project-specific matches prevent the full English viewport
// matrix from multiplying every localized test.
module.exports = defineConfig({
  ...main,
  testMatch: ['**/mobile.spec.cjs', '**/localisation.spec.cjs', '**/guides.spec.cjs', '**/guides-desktop.spec.cjs'],
  timeout: 60_000,
  projects: [
    ...main.projects.map(project => ({ ...project, testMatch: main.testMatch })),
    ...localisation.projects.map(project => ({ ...project, testMatch: localisation.testMatch })),
    ...guides.projects.map(project => ({ ...project, testMatch: project.testMatch || guides.testMatch }))
  ]
});
