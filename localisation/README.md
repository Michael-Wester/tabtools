# Maintaining TabTools localisation

English is the source and fallback. The registry defines 30 implementation locales;
see [support evidence and mappings](LOCALES.md) before calling this an exhaustive
three-store set. [Coverage](COVERAGE.md) separates text completion, technical checks
and linguistic review. [Validation](VALIDATION.md) records real tests and gaps.

## Authored and generated files

| Purpose | Authored source | Generated output |
|---|---|---|
| Copy for all surfaces | `localisation/locales/<locale>.json` | Runtime messages, website text, store text |
| Native runtime | `src/shared/i18n.js`, popup/background code | `src/shared/_locales/<Chromium code>/messages.json`, `i18n-fallback.js` |
| Website layout/styles/behaviour | `website/src/index.html`, `styles.css`, `script.js` | `website/dist/**/index.html`, root styles/script, sitemap |
| Store fields | Manifest keys plus the documented website keys | `marketing/listings/<store>/<locale>.md` |
| Review provenance | `localisation/reviews/<locale>.json` | `localisation/COVERAGE.md` |

All generated outputs are committed. Do not edit them directly. Images and videos
are unchanged; existing website assets remain in `website/dist/assets`.
The original English source files and retrieved listing text are preserved in
[baseline](baseline/README.md), with the source commit and versions.

## Edit, review, generate, validate

Use Node 22 for the localisation toolchain (CI uses 22). Node/PowerShell packaging
still works from the committed runtime files; PowerShell does not require Node.
There are no translation-network requests, runtime dependencies or new permissions.

1. Edit `locales/en.json`, retaining stable descriptive keys and full sentences.
   Check the glossary and product behaviour before changing a claim. Keep markup
   limited to the existing `em`, `strong` and `br` structure; keep placeholders.
2. Run `node scripts/validate-localisation.js --sources-only --report`. It fails
   on each changed English key, even if the translated key still exists. Do not
   regenerate fingerprints to silence the failures.
3. Update each affected translation, or deliberately review it against the new
   meaning. Record that one-key review with, for example:

   ```sh
   node scripts/review-translation.js de settings 'Reviewer name / review type' 'What was checked and why this translation is current'
   ```

   The command requires an explicit locale, key, reviewer and note. It records
   SHA-256 of the current English value and the reviewed translated value using
   `JSON.stringify`. It does not translate text or establish linguistic quality.
   Never call it for unreviewed text. AI review must be labelled as such. Record
   actual human review identities only when that review has occurred. For an
   intentionally identical English match, add a specific `identicalReason` to
   that key's review entry; do not blanket-allow untranslated English.
4. Regenerate and check every deliverable:

   ```sh
   node scripts/generate-localisation.js
   node website/build.js
   node scripts/validate-localisation.js --report
   node --test tests/*.test.js
   node build.js
   node scripts/check-packages.js
   ```

5. Review generated diffs, character counts, copy meaning and actual UI. Use the
   manual browser matrix in `VALIDATION.md`. Commit authored translations and
   their reviews together with generated output. Never count English runtime
   fallback as a completed translation.

Both generators support `--locale de` for a focused local preview and `--check`
for a read-only stale-output check. CI always checks every registry locale and
the coverage report. It never updates fingerprints or publishes store listings.
The website deploy workflow validates first and preserves PR-preview/main-production
separation; this localisation PR itself must not be merged or deployed to production.

## Runtime choices

Native `chrome.i18n` / `browser.i18n.getMessage` selects messages according to the
browser UI locale. `translationLocale` identifies the catalogue actually selected
for `Intl.PluralRules` and `Intl.NumberFormat`; unsupported UI locales get English.
Every plural category is emitted locally to prevent an English category leaking
through native per-key fallback. A defensive local English dictionary handles
missing messages. Values go through textContent/attributes, never translated HTML.
Tab titles, domains and browsing data are never translated or sent anywhere.

Manifest version, extension version, permissions, settings keys, Firefox minimum
version and background architectures are preserved. Firefox packaging maps `no`
to `nb`. Store text, reviews and reports are outside `src/shared` and never ship
in an extension. The package check compares exact generated messages, locale count,
manifest invariants, referenced resources, unwanted files and uncompressed sizes.

Website pages are indexable static HTML. Explicit URLs determine language. The
selector remembers its choice and keeps query strings and anchors. A saved or
browser language can offer a link, never redirect. Generic `pt` and `zh` do not
silently select a region/script; unsupported preferences fall back to English.

Source guidance: [Chrome i18n](https://developer.chrome.com/docs/extensions/reference/api/i18n),
[Google multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites),
[Google localised versions](https://developers.google.com/search/docs/specialty/international/localized-versions).
