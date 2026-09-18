// SPDX-License-Identifier: MPL-2.0
'use strict';

const fs = require('fs');
const path = require('path');
const L = require('./localisation');

function main() {
  fs.writeFileSync(path.join(L.root, 'src/shared/i18n-fallback.js'),
    '// Generated from localisation/locales/en.json.\n' +
    'globalThis.TabToolsEnglish = ' + JSON.stringify(L.extensionSource(L.catalogue('en'))) + ';\n');
  const root = path.join(L.root, 'src', 'shared', '_locales');
  fs.mkdirSync(root, { recursive: true });
  const expected = new Set(L.registry.map(locale => locale.extension));
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && !expected.has(entry.name)) {
      fs.rmSync(path.join(root, entry.name), { recursive: true, force: true });
    }
  }
  for (const locale of L.registry) {
    const directory = path.join(root, locale.extension);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'messages.json'),
      JSON.stringify(L.toWebExtensionMessages(locale.locale), null, 2) + '\n'
    );
  }
}

if (require.main === module) main();
module.exports = { main };
