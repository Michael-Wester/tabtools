#!/usr/bin/env node
'use strict';

// Only the public project token belongs in the browser. Never read a personal API key here.
const fs = require('node:fs');
const path = require('node:path');

function configuration(env) {
  if (env.POSTHOG_ENVIRONMENT !== 'production') return { enabled: false };
  const token = (env.POSTHOG_PROJECT_TOKEN || '').trim();
  if (!token) return { enabled: false };
  if (!/^phc_[A-Za-z0-9_-]+$/.test(token)) throw new Error('POSTHOG_PROJECT_TOKEN must be a public phc_ project token.');
  const apiHost = (env.POSTHOG_API_HOST || '').trim();
  if (!['https://us.i.posthog.com', 'https://eu.i.posthog.com'].includes(apiHost)) {
    throw new Error('Set POSTHOG_API_HOST to the US or EU ingestion host shown in your PostHog project.');
  }
  return { enabled: true, token, apiHost };
}

if (require.main === module) {
  const config = configuration(process.env);
  fs.writeFileSync(path.join(__dirname, 'dist/analytics-config.js'),
    '// Generated deployment configuration; public project token only.\nwindow.TABTOOLS_ANALYTICS = ' + JSON.stringify(config) + ';\n');
  console.log(config.enabled ? 'PostHog configured for production; visitor consent is still required.' : 'PostHog disabled for this deployment.');
}

module.exports = { configuration };
