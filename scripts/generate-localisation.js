// SPDX-License-Identifier: MPL-2.0
'use strict';
// Compatibility entry point: one implementation for npm, CI and older docs.
if (process.argv.length > 2) {
  throw new Error('Generate all locales without arguments; use git diff --exit-code to check committed output.');
}
require('./generate-extension-locales').main();
require('./generate-website').main();
require('./generate-listings').main();
