# Website mobile regression checks

These development-only dependencies do not change the published static site.
From this directory:

```sh
npm ci
npx playwright install --with-deps chromium webkit
npm test
```

The suite serves `../dist` on loopback port 4173 and covers the homepage, guide
index, and all three articles at 320, 390, 430, 768, and 1280 CSS pixels in light
and dark themes. Chromium uses Android emulation and WebKit uses iPhone
emulation at mobile/tablet widths; the desktop width uses desktop user agents.
WebKit emulation is useful regression coverage, not a test on physical iOS.

Checks cover horizontal overflow, reachable navigation and footer touch targets,
skip-link keyboard focus, theme switching and saved preference, following the
system theme when nothing is saved, mobile store wording, FAQ interaction,
uncaught page errors, and article links clearing the header. The home page's
working popup is driven through closing a site, Undo, typing, the Inactive
review, sorting and duplicates at every width, and its Settings at a phone and
a desktop width in both themes.
On phones a walk backwards through a guide with the keyboard checks that the
header covers nothing in focus. With JavaScript off, the popup is checked as a
picture of its starting state and section links still clear the header. A
compact desktop window separately checks that desktop installation wording
remains available.

The localized suite checks all 29 homepages at 320px and 390px in Chromium and
WebKit, with light and dark themes across those widths. It verifies translated
browser labels (including CJK placeholder ordering), header touch targets,
language-menu bounds, selected-option focus, and theme persistence. German,
Spanish, Japanese, Hebrew, and Traditional Chinese additionally cover keyboard
navigation, saved language choices, query/anchor preservation, sticky-header
navigation, and native language links and FAQs with JavaScript disabled.

The guide suite adds all 29 localized indexes and all 87 articles at both narrow
widths in Chromium and WebKit. It follows header/footer Guides links, checks
translated headings and overflow, switches every language while keeping the
article/query/section, exercises direct links, reload and Back/Forward, and checks
that intentional Home links still work. Simplified Chinese, Traditional Chinese
and Hebrew also exercise every guide route with JavaScript disabled. Desktop
Chromium and WebKit additionally cover keyboard selection, Escape/focus recovery,
and a real modified-click new tab while preserving the current guide and anchor.

`npm test` runs all three matrices (506 cases: 220 English layout and popup, 156
localized homepage and 130 localized guide cases; 78 of the English ones are
skipped by design, because a check that does not depend on the width or theme
runs at a few of them only). CLI filters such as `npm test -- --workers=2` apply to
all suites. Use `npm run test:localisation` or `npm run test:guides` for one matrix,
or `npm run test:chromium` for all Chromium cases.

The 320px and 390px homepage and close-site-tabs guide get full-page screenshots in both
themes and engines. The guide suite also captures the first article in German,
Simplified Chinese, Traditional Chinese and Hebrew at both narrow widths and
engines. Requests to other origins are blocked, so these checks do not contact
store listings; the site itself asks for nothing from another origin. Screenshots are review artifacts rather than pixel baselines.

The independent `Website mobile checks` workflow runs without deployment
credentials, including on fork pull requests. It uploads the HTML report,
screenshots, and failure traces as `website-mobile-results` for seven days.
Use `npm run report` to open the report locally after a run.
