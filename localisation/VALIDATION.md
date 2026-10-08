# Localisation validation

Current review results and remaining checks are recorded in [PR17_REVIEW.md](PR17_REVIEW.md).
The review started at `b492c9256eef9a1393eb3bbe2cff2afa7be27b5a` on 18 September 2026.

## Automated checks

```sh
npm test
node build.js
node scripts/check-packages.js
node website/build.js
node website/check-guides.cjs
node website/check-security.cjs
node scripts/validate-localisation.js
git add --all --intent-to-add . && git diff --exit-code
```

CI runs on Linux and Windows with Node 22. Windows additionally runs `./build.ps1`
and checks its packages. Generated locale files, pages and store text are committed;
generation must leave them unchanged, and a generated file that was never committed
fails the last command. Review fingerprints are never updated by generation.

`node scripts/check-packages.js` compares each built manifest, apart from its
version, with `scripts/approved-manifests/<browser>.json`. A manifest change is
therefore two edits in one pull request: the manifest and its approved copy.

### Release branches and pending translations

`main` always needs every language complete and current. A release branch can
take English changes first and their translations in a later pull request:

```sh
TABTOOLS_PENDING_TRANSLATIONS=1 npm test
```

With that variable set to `1`, validation reports, without failing, a string that a
language has not translated yet and a string whose English changed after its
translation was reviewed. Until it is translated the browser shows the English
string. Unknown strings, changed placeholders, unsafe markup, stale packages and
every other check fail in both modes, and `COVERAGE.md` is identical in both.

CI sets the variable for pull requests whose base is not `main`. The
`translations-complete` job never sets it, so it is red on a release branch
until the translations are merged and must be green before that branch is
merged into `main`.

## Installed Chromium extension regression

```sh
npm ci
npx playwright install --with-deps chromium
node build.js
npm run test:extension
```

The native-extension job installs `dist/chrome` in disposable profiles and opens
the actual browser action popup. For each of the 29 languages it compares every
fixed word, count and duration with the catalogue and with the browser's own
formatting, and checks in the main view, the Inactive review and Settings that the
popup is 380 px wide, as tall as its content, and that nothing is pushed out or cut
off. Until a language has a new string, the expected text is the English one the
browser falls back to.

The other tests cover a new profile and tabs changing behind an open popup; typed
keywords and sites; closing and Undo across two windows; duplicates; private
windows; the Keep pinned tabs switch; sorting around pinned tabs and real tab
groups; the Inactive review; themes and accent colours; settings saved by 4.0.4;
very long hostnames and counts; and a list of sixteen sites. Web pages for the
controlled tabs are fulfilled locally and the actions test runs offline. Each
test leaves pictures of the popup in `test-results/native-extension/`, which CI
uploads.

Two things are stood in for. Chromium cannot choose a context-menu item under
automation, so the suite calls the installed handler with the tab Chromium
reports. And to make tabs old, it moves the background's clock forward while
Chromium's own tab times stay real. This is Chromium coverage; it does not
establish native Firefox or Microsoft Edge behavior.

The same suite can check an installed official Edge executable and the Edge
package on Linux:

```sh
TABTOOLS_CHROMIUM_PATH=/path/to/msedge TABTOOLS_EXTENSION_TARGET=edge npm run test:extension
```

Use a disposable profile; the suite creates and closes its own controlled tabs.
The executable override selects the actual browser binary, rather than merely
changing Chromium's user agent.

## Website mobile regression

The independent website workflow runs the existing English homepage/guide matrix
and all 29 localized homepages in Chromium and WebKit. The localized matrix checks
320/390 px layouts and representative keyboard, saved-preference, RTL/CJK and
JavaScript-disabled navigation. Run it from `website/tests` with `npm ci`,
`npx playwright install --with-deps chromium webkit`, then `npm test`.
See [website test details](../website/tests/README.md). Browser emulation does not
replace physical-device acceptance or fluent-reader review.

## Firefox browser smoke check

The localisation workflow also runs a small Playwright check on Ubuntu with Firefox.
It installs the exact `@playwright/test` version in `package-lock.json`, generates the
website pages, serves `website/dist` from a loopback-only static server, and runs:

```sh
npm ci
npx playwright install --with-deps firefox
npm run locales:website
npm run test:firefox
```

The check visits English, German, Japanese and Hebrew pages. It reports authored
first-party `console.error`/`console.warn` messages, uncaught page errors, and failed
requests for first-party resources. Console messages with unknown or opaque source
origins also fail the check. Console warnings/errors from explicit third-party
origins are recorded separately in test attachments; Firefox can emit a native
layout warning for the deterministic YouTube stub. It also exercises the theme toggle,
language menu and privacy navigation. The embedded YouTube frame is fulfilled by a deterministic local stub so a
live third-party response cannot make the first-party check flaky. The final spec case
injects a warning from an external script in the stub frame and verifies that it is
recorded separately, then injects a warning and uncaught error in the main page and
verifies that those diagnostics would fail the check.

This is a focused Firefox smoke check, not a complete browser matrix. It does not
validate the live YouTube frame, external store pages, installed extensions, or every
native Firefox diagnostic that Playwright does not expose as a page event. The route
stub is explicit and limited to the YouTube origin; there are no message-string
allow-lists for first-party failures.

The first review checkpoint passed both platforms:
[validation run 35356589950](https://github.com/Michael-Wester/tabtools/actions/runs/35356589950).
It repairs checks that were absent or broken despite the previous nine-test suite passing.

## Manual browser acceptance

Use disposable profiles and controlled test tabs. Check English, German (long copy),
Japanese (CJK), Hebrew (RTL), Russian/Polish (plurals), then remaining locales for glyphs.

1. Load the built package in each browser. Confirm translated manifest names, toolbar
   tooltip, popup, settings, native context menus and unsupported-language English fallback.
2. Close a site across two regular windows; confirm matching current tabs close and
   unrelated/private tabs remain. Type a keyword and a site name: the list should
   show exactly what Close and Enter then close, and a row's own button should
   close that one tab. Right-click in a private window and confirm nothing closes.
3. Sort a window that has pinned tabs and a tab group: both should stay where they
   are and the group should keep its tabs. Check duplicate removal with a pinned
   copy, a copy playing sound, the copy in view, and two tabs that differ only after
   `#`, such as two Gmail conversations. Open the Inactive review: opening it should
   close nothing, a tab used until a moment ago should not be listed, and active,
   pinned and audible tabs should stay open.
4. Check immediate Undo while the popup is open, settings persistence, and offline
   operation. Try each accent colour in both themes, and the System theme while
   switching the browser between light and dark.
5. Inspect 0/1/2/5/21 counts, large numbers, long domains, both themes and Hebrew direction.
   The header should read `TabTools`, `14 open tabs`, `3 sites` in English and the
   footer `2,479 closed`, with each language's own digit grouping. The popup is
   380 px wide in every language and view. Confirm that no text is cut off, that a
   long summary drops under the name instead of widening the popup, and that the
   right edge of every control is visible in all three views, including after
   reopening the popup. The body must have an explicit pixel width; sizing only
   the root element can undersize Firefox's native popup and clip its contents.
   Height should follow content until the list reaches its fixed height; from
   there the list scrolls and fades at its end while the footer stays in view.

For the website, serve `website/dist` locally or use the existing PR preview. Check
320/390 px and desktop layouts, both themes, English/Hebrew and long regional names.
The circle and theme button should stay adjacent, with 44 px targets and no overflow.
Exercise arrows, Home/End, Enter/Space, Escape, Tab/Shift+Tab and outside click. Verify
focus return, scroll visibility, direct locale links, refresh, query/fragment retention,
modified-click navigation and saved preference without automatic redirects. Check FAQ,
privacy focus, adaptive store buttons, UTM values, canonical/hreflang and sitemap.

These checks do not constitute native-speaker review or store-dashboard verification.
Final localized store artwork sources are preserved under `marketing/assets/`;
see its README for provenance and rendering limits. Repository generation does not
change a live store listing.
