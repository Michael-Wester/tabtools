// SPDX-License-Identifier: MPL-2.0
'use strict';
// Keep the legacy entry point on the template/generator used by npm and CI.
if (process.argv.length > 2) {
  throw new Error('Generate all pages without arguments; use git diff --exit-code to check committed output.');
}
require('../scripts/generate-website').main();
