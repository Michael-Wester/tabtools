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
node scripts/validate-localisation.js --report
git diff --exit-code
```

CI runs on Linux and Windows with Node 22. Windows additionally runs `./build.ps1`
and checks its packages. Generated locale files, pages and store text are committed;
generation must leave them unchanged. Review fingerprints are never updated by generation.

## Installed Chromium extension regression

```sh
npm ci
npx playwright install --with-deps chromium
node build.js
npm run test:extension
```

The native-extension job installs `dist/chrome` in disposable profiles and opens
the actual browser action popup. It checks every supported catalogue, long site
labels, counters, Main/Settings layout and theme changes. Native API checks cover
multi-window cleanup and Undo, private-tab exclusions, pinned duplicate retention,
sorting, inactive exceptions, concurrent settings patches and offline operation.
Web pages for the controlled tabs are fulfilled locally. This is Chromium coverage;
it does not establish native Firefox or Microsoft Edge behavior.

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
   unrelated/private tabs remain. Check exact-domain and keyword matching.
3. Check site-frequency sorting in the current window, duplicate removal with pinned
   duplicates, and inactive cleanup with active/pinned/audible exceptions.
4. Check immediate Undo while the popup is open, settings persistence, and offline operation.
5. Inspect 0/1/2/5/21 counts, large numbers, long domains, both themes and Hebrew direction.
   Header counters should read `14 open` / `2479 closed` in English, with compact
   equivalents and ungrouped digits in other locales. Confirm the original 380 px
   body width (including padding), 10 px body padding and 12 px vertical margins
   before testing expansion. The body must have an explicit pixel width; sizing
   only the root element can undersize Firefox's native popup and clip its contents.
   Longer header text should widen the popup while Main and Settings retain the
   same width in both directions. Check right-edge visibility of every card and
   control in both panels, including after reopening the popup, and the wrapping
   fallback at the maximum popup width. Height should continue to follow content.

For the website, serve `website/dist` locally or use the existing PR preview. Check
320/390 px and desktop layouts, both themes, English/Hebrew and long regional names.
The circle and theme button should stay adjacent, with 44 px targets and no overflow.
Exercise arrows, Home/End, Enter/Space, Escape, Tab/Shift+Tab and outside click. Verify
focus return, scroll visibility, direct locale links, refresh, query/fragment retention,
modified-click navigation and saved preference without automatic redirects. Check FAQ,
privacy focus, adaptive store buttons, UTM values, canonical/hreflang and sitemap.

These checks do not constitute native-speaker review or store-dashboard verification.
Media is intentionally untranslated. No live store listing is changed by this repository.
