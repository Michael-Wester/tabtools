// SPDX-License-Identifier: MPL-2.0
const L = require('./localisation');
const check = process.argv.includes('--check');
L.write('src/shared/i18n-fallback.js','// Generated from localisation/locales/en.json.\n'+'globalThis.TabToolsEnglish = '+JSON.stringify(Object.fromEntries(Object.entries(L.english).filter(([key])=>!key.startsWith('web_'))))+';\n',check);
const requested = process.argv.indexOf('--locale');
const targets = requested < 0 ? L.registry : L.registry.filter(l=>l.locale===process.argv[requested+1]);
if (!targets.length) throw new Error('Unknown locale');
for (const locale of targets) {
  const data = L.catalogue(locale.locale);
  L.write(`src/shared/_locales/${locale.extension}/messages.json`,L.json(L.messages(data,locale)),check);
  const fields=L.listing(data);
  for (const store of ['chrome','firefox','edge']) {
    const origin = store === 'firefox' ? 'Name and summary are separately managed in AMO; values are deliberately validated against the package.' : 'Name and short description come from the localised extension manifest.';
    L.write(`marketing/listings/${store}/${locale.locale}.md`,
      `<!-- Generated. Edit localisation/locales/${locale.locale}.json, then run node scripts/generate-localisation.js. -->\n`+
      `# ${locale.name} — ${store}\n\nStore locale: \`${locale.stores[store]}\`. ${origin}\n\n`+
      `## Name (${fields.name.length} characters)\n\n${fields.name}\n\n`+
      `## Summary / short description (${fields.summary.length} characters)\n\n${fields.summary}\n\n`+
      `## Description (${fields.description.length} characters)\n\n${fields.description}\n`,check);
  }
}
console.log(`Generated/checked runtime messages and store text for ${targets.length} locales.`);
